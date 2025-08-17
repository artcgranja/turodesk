import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { AIMessage, HumanMessage, BaseMessage } from '@langchain/core/messages';
import { TurodeskAgent } from '../agent';
import { DatabaseQueries, type User, type Chat } from '../db/queries';
import type { ChatMessage, ChatSessionMeta } from './types';
import { Pool } from 'pg';

function userDataPath(): string {
	return app.getPath('userData');
}

function ensureDir(dir: string): void {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export class ChatManager {
	private sessionsFile: string; // Mantido para backup/migração
	private userId: string;
	private user: User | null = null;
	private agent: TurodeskAgent | null = null;
	private dbPool: Pool | null = null;
	private db: DatabaseQueries | null = null;

	constructor() {
		const base = path.join(userDataPath(), 'turodesk');
		ensureDir(base);
		this.sessionsFile = path.join(base, 'sessions.json');

		// Define um userId estável local (persistido em disco)
		const uidPath = path.join(base, 'user.json');
		if (fs.existsSync(uidPath)) {
			try {
				const data = JSON.parse(fs.readFileSync(uidPath, 'utf8')) as { userId?: string };
				this.userId = data.userId || uuidv4();
			} catch {
				this.userId = uuidv4();
			}
		} else {
			this.userId = uuidv4();
			fs.writeFileSync(uidPath, JSON.stringify({ userId: this.userId }, null, 2), 'utf8');
		}

		// Initialize PostgreSQL and Agent (both are required)
		this.initializeAgent();
	}

	private async initializeAgent(): Promise<void> {
		const dbUrl = process.env.DATABASE_URI || 'postgresql://turodesk:turodesk@localhost:5432/turodesk';
		const apiKey = process.env.OPENAI_API_KEY;

		if (!apiKey) {
			throw new Error('OPENAI_API_KEY is required');
		}

		try {
			// Initialize PostgreSQL connection
			this.dbPool = new Pool({
				connectionString: dbUrl,
				max: 10,
				idleTimeoutMillis: 30000,
				connectionTimeoutMillis: 2000,
			});

			// Test connection
			await this.dbPool.query('SELECT 1');
			console.log('PostgreSQL connected successfully');

			// Initialize database queries
			this.db = new DatabaseQueries(this.dbPool);

			// Ensure user exists in database
			this.user = await this.db.ensureUserExists(this.userId);
			console.log('User initialized:', this.user.id);

			// Initialize agent with PostgreSQL
			this.agent = await TurodeskAgent.create({
				apiKey,
				model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
				temperature: 0.2,
				dbPool: this.dbPool
			});

			console.log('Turodesk Agent initialized successfully');

		} catch (error) {
			console.error('Failed to initialize agent with PostgreSQL:', error);
			throw new Error('PostgreSQL connection is required for Turodesk to function');
		}
	}

	async listSessions(): Promise<ChatSessionMeta[]> {
		if (!this.db || !this.user) {
			throw new Error('Database not initialized');
		}

		const chats = await this.db.getChatsByUserId(this.user.id);
		return chats.map(chat => ({
			id: chat.id,
			title: chat.title,
			createdAt: chat.created_at,
			updatedAt: chat.updated_at
		}));
	}

	async renameSession(sessionId: string, title: string): Promise<ChatSessionMeta> {
		if (!this.db) {
			throw new Error('Database not initialized');
		}

		const updatedChat = await this.db.updateChatTitle(sessionId, title);
		if (!updatedChat) {
			throw new Error('Sessão não encontrada');
		}

		return {
			id: updatedChat.id,
			title: updatedChat.title,
			createdAt: updatedChat.created_at,
			updatedAt: updatedChat.updated_at
		};
	}

	async createSession(title?: string): Promise<ChatSessionMeta> {
		if (!this.db || !this.user) {
			throw new Error('Database not initialized');
		}

		const chat = await this.db.createChat(this.user.id, title);
		return {
			id: chat.id,
			title: chat.title,
			createdAt: chat.created_at,
			updatedAt: chat.updated_at
		};
	}

	async deleteSession(sessionId: string): Promise<void> {
		if (!this.db) {
			throw new Error('Database not initialized');
		}

		const deleted = await this.db.deleteChat(sessionId);
		if (!deleted) {
			throw new Error('Sessão não encontrada');
		}

		// Remove backup local history file
		const histPath = this.historyPath(sessionId);
		if (fs.existsSync(histPath)) {
			fs.rmSync(histPath, { force: true, recursive: true });
		}
	}

	async getMessages(sessionId: string): Promise<ChatMessage[]> {
		if (!this.agent) {
			throw new Error('Agent not initialized');
		}

		try {
			// Try to read from PostgreSQL checkpointer first
			const msgs = await this.agent.getMessages(sessionId);
			if (msgs.length > 0) {
				const mapped: ChatMessage[] = msgs.map((m): ChatMessage => ({
					role: (m._getType() === 'human' ? 'user' : m._getType() === 'ai' ? 'assistant' : 'system') as 'user' | 'assistant' | 'system',
					content: m.content as string,
					createdAt: new Date().toISOString(),
				}));
				return mapped;
			}
		} catch (error) {
			console.warn('Failed to read from PostgreSQL checkpointer:', error);
		}

		// Fallback: read from local file history
		const histPath = this.historyPath(sessionId);
		if (fs.existsSync(histPath)) {
			try {
				const raw = JSON.parse(fs.readFileSync(histPath, 'utf8')) as ChatMessage[];
				if (Array.isArray(raw) && raw.length > 0) return raw;
			} catch {}
		}

		return [];
	}

	async sendMessage(sessionId: string, input: string): Promise<ChatMessage> {
		if (!this.db || !this.agent) {
			throw new Error('Database or Agent not initialized');
		}

		// Verify chat exists
		const chat = await this.db.getChatById(sessionId);
		if (!chat) {
			throw new Error('Sessão não encontrada');
		}

		try {
			const outputMsg = await this.agent.sendMessage(sessionId, input);

			// Update chat timestamp
			await this.db.updateChatTimestamp(sessionId);

			// Persist history locally as backup
			this.appendToHistory(sessionId, [
				{ role: 'user', content: input, createdAt: new Date().toISOString() },
				{ role: 'assistant', content: outputMsg, createdAt: new Date().toISOString() },
			]);

			return { role: 'assistant', content: outputMsg, createdAt: new Date().toISOString() };

		} catch (error) {
			console.error('Failed to send message:', error);
			throw new Error('Failed to send message - check PostgreSQL connection');
		}
	}

	async sendMessageStream(
		sessionId: string,
		input: string,
		onToken: (token: string) => void
	): Promise<ChatMessage> {
		if (!this.db || !this.agent) {
			throw new Error('Database or Agent not initialized');
		}

		// Verify chat exists
		const chat = await this.db.getChatById(sessionId);
		if (!chat) {
			throw new Error('Sessão não encontrada');
		}

		try {
			// Get prior messages for context
			const prior = await this.getMessages(sessionId);
			const priorAsBase: BaseMessage[] = prior.map((m) => 
				m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
			);

			const finalText = await this.agent.sendMessageStream(
				sessionId, 
				input, 
				onToken, 
				priorAsBase
			);

			// Update chat timestamp
			await this.db.updateChatTimestamp(sessionId);

			// Persist history locally as backup
			this.appendToHistory(sessionId, [
				{ role: 'user', content: input, createdAt: new Date().toISOString() },
				{ role: 'assistant', content: finalText, createdAt: new Date().toISOString() },
			]);

			return { role: 'assistant', content: finalText, createdAt: new Date().toISOString() };

		} catch (error) {
			console.error('Failed to send streaming message:', error);
			throw new Error('Failed to send message - check PostgreSQL connection');
		}
	}

	private historyPath(sessionId: string): string {
		const base = path.join(userDataPath(), 'turodesk', 'history');
		ensureDir(base);
		return path.join(base, `${sessionId}.json`);
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

	async cleanup(): Promise<void> {
		if (this.agent) {
			await this.agent.cleanup();
		}
		if (this.dbPool) {
			await this.dbPool.end();
			console.log('PostgreSQL connection pool closed');
		}
	}
}