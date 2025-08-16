import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AIMessage, HumanMessage, BaseMessage } from '@langchain/core/messages';
import { StateGraph, messagesStateReducer } from '@langchain/langgraph';
import pg from 'pg';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import type { ChatMessage, ChatSessionMeta } from './types';
import { LongTermMemory } from '../memory/longTerm';

function userDataPath(): string {
	return app.getPath('userData');
}

function ensureDir(dir: string): void {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

type GraphState = {
	messages: BaseMessage[];
};

export class ChatManager {
	private sessionsFile: string;
	private sessions: ChatSessionMeta[] = [];
	private llm: ChatOpenAI | null;
	private graph: any | null = null;
	private checkpointer: PostgresSaver | MemorySaver;
	private longTerm: LongTermMemory | null = null;

	constructor() {
		const base = path.join(userDataPath(), 'turodesk');
		ensureDir(base);
		this.sessionsFile = path.join(base, 'sessions.json');
		if (fs.existsSync(this.sessionsFile)) {
			try {
				this.sessions = JSON.parse(fs.readFileSync(this.sessionsFile, 'utf8'));
			} catch {
				this.sessions = [];
			}
		}

		// Configure checkpointer (Postgres se disponível; caso contrário, memória)
		if (this.isPgEnabled()) {
			const poolConfig: pg.PoolConfig = {
				host: process.env.POSTGRES_HOST || '127.0.0.1',
				port: Number(process.env.POSTGRES_PORT || 5432),
				user: process.env.POSTGRES_USER || 'turodesk',
				password: process.env.POSTGRES_PASSWORD || 'turodesk',
				database: process.env.POSTGRES_DB || 'turodesk',
			};
			const pool = new pg.Pool(poolConfig);
			this.checkpointer = new PostgresSaver(pool);
			void this.checkpointer.setup();
			this.longTerm = new LongTermMemory(poolConfig, 'long_term_memories');
		} else {
			this.checkpointer = new MemorySaver();
			this.longTerm = null;
		}

		const apiKey = process.env.OPENAI_API_KEY;
		if (apiKey) {
			this.llm = new ChatOpenAI({
				apiKey,
				model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
				temperature: 0.2,
			});
			this.graph = this.buildGraph();
		} else {
			this.llm = null;
			this.graph = null;
		}
	}

	private isPgEnabled(): boolean {
		return !!(process.env.POSTGRES_HOST || process.env.POSTGRES_USER || process.env.POSTGRES_PASSWORD || process.env.POSTGRES_DB);
	}

	private buildGraph() {
		if (!this.llm) throw new Error('LLM não configurado');
		const prompt = ChatPromptTemplate.fromMessages([
			['system', 'Você é um assistente no app Turodesk. Seja conciso e útil.'],
			new MessagesPlaceholder('messages'),
		]);

		const callModel = async (state: GraphState): Promise<Partial<GraphState>> => {
			const chain = prompt.pipe(this.llm!);
			const result = await chain.invoke({ messages: state.messages });
			return { messages: [result] };
		};

		const builder: any = new (StateGraph as any)({
			channels: {
				messages: { reducer: messagesStateReducer, default: () => [] },
			},
		} as any);
		builder.addNode('call_model', callModel);
		builder.addEdge('__start__', 'call_model');
		builder.addEdge('call_model', '__end__');
		return builder.compile({ checkpointer: this.checkpointer });
	}

	listSessions(): ChatSessionMeta[] {
		return [...this.sessions].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
	}

	renameSession(sessionId: string, title: string): ChatSessionMeta {
		const s = this.sessions.find((x) => x.id === sessionId);
		if (!s) throw new Error('Sessão não encontrada');
		s.title = title || s.title;
		s.updatedAt = new Date().toISOString();
		this.persistSessions();
		return s;
	}

	createSession(title?: string): ChatSessionMeta {
		const now = new Date().toISOString();
		const session: ChatSessionMeta = { id: uuidv4(), title: title || 'Nova conversa', createdAt: now, updatedAt: now };
		this.sessions.push(session);
		this.persistSessions();
		return session;
	}

	deleteSession(sessionId: string): void {
		this.sessions = this.sessions.filter((s) => s.id !== sessionId);
		this.persistSessions();
		const histPath = this.historyPath(sessionId);
		if (fs.existsSync(histPath)) fs.rmSync(histPath, { force: true, recursive: true });
	}

	async getMessages(sessionId: string): Promise<ChatMessage[]> {
		const ckpt = await (this.checkpointer as any).get({ configurable: { thread_id: sessionId } });
		const msgs: BaseMessage[] = ckpt?.channel_values?.messages ?? [];
		return msgs.map((m) => ({
			role: m._getType() === 'human' ? 'user' : m._getType() === 'ai' ? 'assistant' : 'system',
			content: m.content as string,
			createdAt: new Date().toISOString(),
		}));
	}

	async sendMessage(sessionId: string, input: string): Promise<ChatMessage> {
		const session = this.sessions.find((s) => s.id === sessionId);
		if (!session) throw new Error('Sessão não encontrada');

		if (!this.graph || !this.llm) {
			const fallback = 'Configure OPENAI_API_KEY para obter respostas inteligentes.';
			session.updatedAt = new Date().toISOString();
			this.persistSessions();
			return { role: 'assistant', content: fallback, createdAt: new Date().toISOString() };
		}

		const result = await this.graph.invoke(
			{ messages: [new HumanMessage(input)] },
			{ configurable: { thread_id: sessionId } }
		);
		const outputMsg = (result.messages[result.messages.length - 1] ?? new AIMessage('')).content as string;

		session.updatedAt = new Date().toISOString();
		this.persistSessions();

		return { role: 'assistant', content: outputMsg, createdAt: new Date().toISOString() };
	}

	async sendMessageStream(
		sessionId: string,
		input: string,
		onToken: (token: string) => void
	): Promise<ChatMessage> {
		const session = this.sessions.find((s) => s.id === sessionId);
		if (!session) throw new Error('Sessão não encontrada');
		if (!this.llm) {
			onToken('Configure OPENAI_API_KEY para obter respostas inteligentes.');
			return { role: 'assistant', content: 'Configure OPENAI_API_KEY para obter respostas inteligentes.', createdAt: new Date().toISOString() };
		}

		// Recupera memórias relevantes (quando Postgres disponível)
		let memoryContext = '';
		if (this.longTerm) {
			try {
				const memories = await this.longTerm.search(input, 'user_default', 5);
				if (memories.length) {
					memoryContext = memories.map((m) => `- ${m.content}`).join('\n');
				}
			} catch {}
		}

		const finalInput = memoryContext ? `${input}\n\nContexto histórico:\n${memoryContext}` : input;

		// Executa via LangGraph com persistência por checkpoint; emite o texto ao final
		const result = await this.graph.invoke(
			{ messages: [new HumanMessage(finalInput)] },
			{ configurable: { thread_id: sessionId } }
		);
		const finalText = (result.messages[result.messages.length - 1] ?? new AIMessage('')).content as string;
		if (finalText) onToken(finalText);

		// Promove para memória de longo prazo (básico)
		if (this.longTerm) {
			try {
				await this.longTerm.addMemory({
					userId: 'user_default',
					threadId: sessionId,
					content: `Pergunta: ${input}\nResposta: ${finalText}`,
					category: 'conversation',
					tags: ['chat'],
					importanceScore: 0.5,
				});
			} catch {}
		}

		session.updatedAt = new Date().toISOString();
		this.persistSessions();

		return { role: 'assistant', content: finalText, createdAt: new Date().toISOString() };
	}

	private historyPath(sessionId: string): string {
		const base = path.join(userDataPath(), 'turodesk', 'history');
		ensureDir(base);
		return path.join(base, `${sessionId}.json`);
	}

	private persistSessions(): void {
		fs.writeFileSync(this.sessionsFile, JSON.stringify(this.sessions, null, 2), 'utf8');
	}
}
