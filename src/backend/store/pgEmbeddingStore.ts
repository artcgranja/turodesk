import { pool, vectorLiteral } from '../db';

export interface PgEmbeddedRecord {
	id: string;
	sessionId?: string | null;
	text: string;
	embedding: number[];
	createdAt?: string;
}

export class PostgresEmbeddingStore {
	async add(rec: PgEmbeddedRecord): Promise<void> {
		await pool.query(
			'INSERT INTO longterm_memory (id, session_id, text, embedding, created_at) VALUES ($1, $2, $3, $4, NOW())',
			[rec.id, rec.sessionId ?? null, rec.text, vectorLiteral(rec.embedding)]
		);
	}

	async query(embedding: number[], topK = 5, sessionId?: string): Promise<PgEmbeddedRecord[]> {
		const base = 'SELECT id, session_id, text, created_at FROM longterm_memory WHERE ($2::text IS NULL OR session_id = $2) ORDER BY embedding <=> $1 LIMIT $3';
		const res = await pool.query(base, [vectorLiteral(embedding), sessionId ?? null, topK]);
		return res.rows.map((r: { id: string; session_id: string | null; text: string; created_at?: Date }) => ({ id: r.id, sessionId: r.session_id || null, text: r.text, embedding: [], createdAt: r.created_at ? (r.created_at as any).toISOString?.() : undefined }));
	}
}


