import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AIMessage, HumanMessage, BaseMessage } from '@langchain/core/messages';
import { FileSystemChatMessageHistory } from '@langchain/community/stores/message/file_system';
import { StateGraph, messagesStateReducer } from '@langchain/langgraph';
import { JSONEmbeddingStore } from '../store/embeddingStore';
import type { ChatMessage, ChatSessionMeta } from './types';

function userDataPath(): string {
	return app.getPath('userData');
}

function ensureDir(dir: string): void {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

type GraphState = {
	messages: BaseMessage[];
	context: string;
	sessionId: string;
};

export class ChatManager {
	private sessionsFile: string;
	private sessions: ChatSessionMeta[] = [];
	private embeddingStore: JSONEmbeddingStore;
	private embeddings: OpenAIEmbeddings | null;
	private llm: ChatOpenAI | null;
	private graph: ReturnType<StateGraph<GraphState>['compile']> | null = null;

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
		const memoryDir = path.join(base, 'memory');
		ensureDir(memoryDir);
		this.embeddingStore = new JSONEmbeddingStore(path.join(memoryDir, 'longterm.json'));

		const apiKey = process.env.OPENAI_API_KEY;
		if (apiKey) {
			this.llm = new ChatOpenAI({
				apiKey,
				model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
				temperature: 0.2,
			});
			this.embeddings = new OpenAIEmbeddings({ apiKey, model: 'text-embedding-3-small' });
			this.graph = this.buildGraph();
		} else {
			this.llm = null;
			this.embeddings = null;
			this.graph = null;
		}
	}

	private buildGraph() {
		if (!this.llm) throw new Error('LLM não configurado');
		const prompt = ChatPromptTemplate.fromMessages([
			['system', 'Você é um assistente no app Turodesk. Seja conciso e útil.'],
			['system', 'Contexto (memória longa): {context}'],
			new MessagesPlaceholder('messages'),
		]);

		const retrieve = async (state: GraphState): Promise<Partial<GraphState>> => {
			let retrieved = '';
			if (this.embeddings) {
				const lastHuman = [...state.messages].reverse().find((m) => m._getType() === 'human') as HumanMessage | undefined;
				const query = (lastHuman?.content as string) || '';
				if (query) {
					const queryEmbedding = await this.embeddings.embedQuery(query);
					const top = this.embeddingStore.query(queryEmbedding, 5, (r) => (r.metadata as any)?.sessionId === state.sessionId);
					if (top.length) retrieved = top.map((t) => `- ${t.text}`).join('\n');
				}
			}
			return { context: retrieved };
		};

		const callModel = async (state: GraphState): Promise<Partial<GraphState>> => {
			const chain = prompt.pipe(this.llm!);
			const result = await chain.invoke({ context: state.context, messages: state.messages });
			return { messages: [result] };
		};

		const builder = new StateGraph<GraphState>({
			channels: {
				messages: { reducer: messagesStateReducer, default: () => [] },
				context: { default: () => '' },
				sessionId: { default: () => '' },
			},
		});
		builder.addNode('retrieve', retrieve);
		builder.addNode('call_model', callModel);
		builder.addEdge('__start__', 'retrieve');
		builder.addEdge('retrieve', 'call_model');
		builder.addEdge('call_model', '__end__');
		return builder.compile();
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
		const history = new FileSystemChatMessageHistory({
			basePath: path.dirname(this.historyPath(sessionId)),
			sessionId,
		});
		const msgs = await history.getMessages();
		return msgs.map((m) => ({
			role: m._getType() === 'human' ? 'user' : m._getType() === 'ai' ? 'assistant' : 'system',
			content: m.content as string,
			createdAt: new Date().toISOString(),
		}));
	}

	async sendMessage(sessionId: string, input: string): Promise<ChatMessage> {
		const session = this.sessions.find((s) => s.id === sessionId);
		if (!session) throw new Error('Sessão não encontrada');

		const history = new FileSystemChatMessageHistory({
			basePath: path.dirname(this.historyPath(sessionId)),
			sessionId,
		});

		if (!this.graph || !this.llm) {
			await history.addMessage(new HumanMessage(input));
			const fallback = 'Configure OPENAI_API_KEY para obter respostas inteligentes.';
			await history.addMessage(new AIMessage(fallback));
			session.updatedAt = new Date().toISOString();
			this.persistSessions();
			return { role: 'assistant', content: fallback, createdAt: new Date().toISOString() };
		}

		const prev: BaseMessage[] = await history.getMessages();
		const result = await this.graph.invoke({ messages: [...prev, new HumanMessage(input)], context: '', sessionId });
		const outputMsg = (result.messages[result.messages.length - 1] ?? new AIMessage('')).content as string;

		await history.addMessage(new HumanMessage(input));
		await history.addMessage(new AIMessage(outputMsg));

		if (this.embeddings) {
			const textToStore = `${input}\n\nResposta: ${outputMsg}`;
			const embedding = await this.embeddings.embedQuery(textToStore);
			this.embeddingStore.add({
				id: uuidv4(),
				text: textToStore,
				embedding,
				metadata: { sessionId },
				createdAt: new Date().toISOString(),
			});
		}

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

		const history = new FileSystemChatMessageHistory({
			basePath: path.dirname(this.historyPath(sessionId)),
			sessionId,
		});
		const prev: BaseMessage[] = await history.getMessages();

		let retrieved = '';
		if (this.embeddings) {
			const queryEmbedding = await this.embeddings.embedQuery(input);
			const top = this.embeddingStore.query(queryEmbedding, 5, (r) => (r.metadata as any)?.sessionId === sessionId);
			if (top.length) retrieved = top.map((t) => `- ${t.text}`).join('\n');
		}

		const prompt = ChatPromptTemplate.fromMessages([
			['system', 'Você é um assistente no app Turodesk. Seja conciso e útil.'],
			['system', 'Contexto (memória longa): {context}'],
			new MessagesPlaceholder('messages'),
		]);
		const chain = prompt.pipe(this.llm);

		let finalText = '';
		await chain.invoke(
			{ context: retrieved, messages: [...prev, new HumanMessage(input)] },
			{
				callbacks: [
					{
						handleLLMNewToken: async (token: string) => {
							finalText += token;
							onToken(token);
						},
					},
				],
			}
		);

		await history.addMessage(new HumanMessage(input));
		await history.addMessage(new AIMessage(finalText));

		if (this.embeddings) {
			const textToStore = `${input}\n\nResposta: ${finalText}`;
			const embedding = await this.embeddings.embedQuery(textToStore);
			this.embeddingStore.add({
				id: uuidv4(),
				text: textToStore,
				embedding,
				metadata: { sessionId },
				createdAt: new Date().toISOString(),
			});
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
