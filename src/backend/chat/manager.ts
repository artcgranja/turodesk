import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AIMessage, HumanMessage, BaseMessage, SystemMessage } from '@langchain/core/messages';
import { StateGraph, messagesStateReducer } from '@langchain/langgraph';
import { createAgent } from '../agent';
import { getSystemPrompt } from '../agent/systemPrompt';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { buildMemoryTools } from '../tools/memoryTools';
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
	private userId: string;
	private llm: ChatOpenAI | null;
	private graph: any | null = null;
	private agent: any | null = null;
	private tools: DynamicStructuredTool[] = [];
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

		// Define um userId estável local (persistido em disco)
		const uidPath = path.join(base, 'user.json');
		if (fs.existsSync(uidPath)) {
			try {
				const data = JSON.parse(fs.readFileSync(uidPath, 'utf8')) as { userId?: string };
				this.userId = data.userId || 'local_user';
			} catch {
				this.userId = 'local_user';
			}
		} else {
			this.userId = uuidv4();
			fs.writeFileSync(uidPath, JSON.stringify({ userId: this.userId }, null, 2), 'utf8');
		}

		// Configure checkpointer (Postgres se disponível; caso contrário, memória)
		if (this.isPgEnabled()) {
			// Porta publicada do container (docker-compose mapeia 5544->5432)
			const fallbackPort = 5544;
			const poolConfigChat: pg.PoolConfig = { connectionString: this.normalizeConnectionString(process.env.DATABASE_URI as string, fallbackPort) };
			const poolChat = new pg.Pool(poolConfigChat);
			this.checkpointer = new PostgresSaver(poolChat);
			void this.checkpointer.setup();

			// Configure memória de longo prazo em conexão separada, se fornecida
			const memPoolConfig: pg.PoolConfig | null = process.env.MEM_DATABASE_URI
				? { connectionString: this.normalizeConnectionString(process.env.MEM_DATABASE_URI as string, fallbackPort) }
				: null;
			this.longTerm = memPoolConfig ? new LongTermMemory(memPoolConfig, 'long_term_memories') : null;
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
				streaming: true,
			});
			this.graph = this.buildGraph();
			this.tools = buildMemoryTools({ longTerm: this.longTerm, getUserId: () => this.userId });
			this.agent = createAgent(this.llm, this.tools);
		} else {
			this.llm = null;
			this.graph = null;
			this.agent = null;
		}
	}

	private isPgEnabled(): boolean {
		return !!process.env.DATABASE_URI;
	}

	private normalizeConnectionString(uri: string, fallbackPort: number): string {
		try {
			const u = new URL(uri);
			if (u.hostname === 'langgraph-postgres') {
				u.hostname = '127.0.0.1';
				// Sempre use a porta de fallback (porta mapeada do container)
				u.port = String(fallbackPort);
			}
			return u.toString();
		} catch {
			return uri;
		}
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

	// tools moved to ../tools/memoryTools

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
		// Prefer stored local history if available
		const histPath = this.historyPath(sessionId);
		if (fs.existsSync(histPath)) {
			try {
				const raw = JSON.parse(fs.readFileSync(histPath, 'utf8')) as ChatMessage[];
				if (Array.isArray(raw) && raw.length > 0) return raw;
			} catch {}
		}

		// Fallback: read from LangGraph checkpointer
		const ckpt = await (this.checkpointer as any).get({ configurable: { thread_id: sessionId, checkpoint_ns: 'turodesk' } });
		const msgs: BaseMessage[] = ckpt?.channel_values?.messages ?? [];
		const mapped: ChatMessage[] = msgs.map((m): ChatMessage => ({
			role: (m._getType() === 'human' ? 'user' : m._getType() === 'ai' ? 'assistant' : 'system') as 'user' | 'assistant' | 'system',
			content: m.content as string,
			createdAt: new Date().toISOString(),
		}));
		// Backfill local history so it persists on next loads
		try {
			const histPath = this.historyPath(sessionId);
			if (!fs.existsSync(histPath) && mapped.length > 0) {
				fs.writeFileSync(histPath, JSON.stringify(mapped, null, 2), 'utf8');
			}
		} catch {}
		return mapped;
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
			{ configurable: { thread_id: sessionId, checkpoint_ns: 'turodesk' } }
		);
		const outputMsg = (result.messages[result.messages.length - 1] ?? new AIMessage('')).content as string;

		// Persist history locally
		this.appendToHistory(sessionId, [
			{ role: 'user', content: input, createdAt: new Date().toISOString() },
			{ role: 'assistant', content: outputMsg, createdAt: new Date().toISOString() },
		]);

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

		// Não injeta contexto histórico automaticamente; o agente usa tools quando necessário
		const finalInput = input;

		// Streaming real via LangChain callbacks, preservando histórico local manualmente

		// Usa o agente ReAct com ferramentas expostas; suporta tool calls
		const prior = await this.getMessages(sessionId);
		const priorAsBase: BaseMessage[] = [
			new SystemMessage(getSystemPrompt({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })),
			...prior.map((m) => (m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content))),
		];
		let fullText = '';
		const streamRes = await this.agent.invoke(
			{ messages: [...priorAsBase, new HumanMessage(finalInput)] },
			{
				configurable: { thread_id: sessionId, checkpoint_ns: 'turodesk' },
				callbacks: [
					{
						handleLLMNewToken: (token: string) => {
							fullText += token;
							onToken(token);
						},
					},
				],
			}
		);
		const finalText = fullText || ((streamRes?.messages?.[streamRes.messages.length - 1] as any)?.content as string) || '';

		// Não salva automaticamente trocas de chat na memória de longo prazo.
		// Apenas as tools explicitamente chamadas devem persistir memórias importantes.

		// Persist history locally
		this.appendToHistory(sessionId, [
			{ role: 'user', content: input, createdAt: new Date().toISOString() },
			{ role: 'assistant', content: finalText, createdAt: new Date().toISOString() },
		]);

		session.updatedAt = new Date().toISOString();
		this.persistSessions();

		return { role: 'assistant', content: finalText, createdAt: new Date().toISOString() };
	}

	// User memory maintenance APIs
	async listUserFacts(): Promise<Array<{ id: string; content: string; metadata: Record<string, unknown> }>> {
		if (!this.longTerm) return [];
		return this.longTerm.listUserFacts(this.userId, 100);
	}

	async upsertUserFact(key: string, content: string, tags?: string[]): Promise<void> {
		if (!this.longTerm) return;
		await this.longTerm.upsertUserFact(this.userId, key, content, tags);
	}

	async deleteUserFact(key: string): Promise<number> {
		if (!this.longTerm) return 0;
		return this.longTerm.deleteUserFactByKey(this.userId, key);
	}

	private historyPath(sessionId: string): string {
		const base = path.join(userDataPath(), 'turodesk', 'history');
		ensureDir(base);
		return path.join(base, `${sessionId}.json`);
	}

	private persistSessions(): void {
		fs.writeFileSync(this.sessionsFile, JSON.stringify(this.sessions, null, 2), 'utf8');
	}

	private appendToHistory(sessionId: string, messages: ChatMessage[]): void {
		const p = this.historyPath(sessionId);
		let existing: ChatMessage[] = [];
		if (fs.existsSync(p)) {
			try {
				existing = JSON.parse(fs.readFileSync(p, 'utf8')) as ChatMessage[];
				if (!Array.isArray(existing)) existing = [];
			} catch {
				existing = [];
			}
		}
		const next = [...existing, ...messages];
		fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8');
	}
}
