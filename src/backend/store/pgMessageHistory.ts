import { pool } from '../db';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

export class PostgresChatMessageHistory {
	private readonly sessionId: string;

	constructor(sessionId: string) {
		this.sessionId = sessionId;
	}

	async getMessages(): Promise<BaseMessage[]> {
		const res = await pool.query(
			'SELECT role, content FROM messages WHERE session_id=$1 ORDER BY created_at ASC',
			[this.sessionId]
		);
		return res.rows.map((r: { role: string; content: string }) => toMessage(r.role, r.content));
	}

	async addMessage(message: BaseMessage): Promise<void> {
		const role = fromMessageType(message);
		const content = message.content as string;
		await pool.query(
			'INSERT INTO messages(id, session_id, role, content) VALUES (gen_random_uuid(), $1, $2, $3)',
			[this.sessionId, role, content]
		);
	}
}

function toMessage(role: string, content: string): BaseMessage {
	if (role === 'user') return new HumanMessage(content);
	if (role === 'assistant' || role === 'ai') return new AIMessage(content);
	return new SystemMessage(content);
}

function fromMessageType(msg: BaseMessage): 'user' | 'assistant' | 'system' {
	const t = msg._getType();
	if (t === 'human') return 'user';
	if (t === 'ai') return 'assistant';
	return 'system';
}


