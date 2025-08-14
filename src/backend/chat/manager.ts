import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { FileSystemChatMessageHistory } from '@langchain/community/stores/message/file_system';
import { JSONEmbeddingStore } from '../store/embeddingStore';
import type { ChatMessage, ChatSessionMeta } from './types';

function userDataPath(): string {
	return app.getPath('userData');
}

function ensureDir(dir: string): void {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export class ChatManager {
	private sessionsFile: string;
	private sessions: ChatSessionMeta[] = [];
	private embeddingStore: JSONEmbeddingStore;
	private embeddings: OpenAIEmbeddings | null;
	private llm: ChatOpenAI | null;

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
		} else {
			this.llm = null;
			this.embeddings = null;
		}
	}

	listSessions(): ChatSessionMeta[] {
		return [...this.sessions].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
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

		if (!this.llm) {
			await history.addMessage(new HumanMessage(input));
			const fallback = 'Configure OPENAI_API_KEY para obter respostas inteligentes.';
			await history.addMessage(new AIMessage(fallback));
			session.updatedAt = new Date().toISOString();
			this.persistSessions();
			return { role: 'assistant', content: fallback, createdAt: new Date().toISOString() };
		}

		let retrieved = '' as string;
		if (this.embeddings) {
			const queryEmbedding = await this.embeddings.embedQuery(input);
			const top = this.embeddingStore.query(queryEmbedding, 5, (r) => (r.metadata as any)?.sessionId === sessionId);
			if (top.length) {
				retrieved = top.map((t) => `- ${t.text}`).join('\n');
			}
		}

		const systemPrompt = ChatPromptTemplate.fromMessages([
			['system', 'Você é um assistente no app Turodesk. Seja conciso e útil.'],
			new MessagesPlaceholder('history'),
			['human', 'Contexto (memória longa):\n{context}\n\nPergunta: {input}'],
		]);

		const chain = systemPrompt.pipe(this.llm);
		const withHistory = new RunnableWithMessageHistory({
			runnable: chain,
			getMessageHistory: async () => history,
			inputMessagesKey: 'input',
			historyMessagesKey: 'history',
		});

		const result = await withHistory.invoke({ input, context: retrieved });
		const output = typeof result === 'string' ? result : (result as any).content ?? '';

		if (this.embeddings) {
			const textToStore = `${input}\n\nResposta: ${output}`;
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

		return { role: 'assistant', content: output, createdAt: new Date().toISOString() };
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
