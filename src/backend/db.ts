import { Pool } from 'pg';

const DEFAULTS = {
	host: process.env.POSTGRES_HOST || '127.0.0.1',
	port: Number(process.env.POSTGRES_PORT || 5432),
	user: process.env.POSTGRES_USER || 'turodesk',
	password: process.env.POSTGRES_PASSWORD || 'turodesk',
	database: process.env.POSTGRES_DB || 'turodesk',
};

export const pool = new Pool({
	host: DEFAULTS.host,
	port: DEFAULTS.port,
	user: DEFAULTS.user,
	password: DEFAULTS.password,
	database: DEFAULTS.database,
});

export async function initDb(): Promise<void> {
	try {
		// Only ensure tables/indexes; extensions are handled by init SQL
		await pool.query(`
			CREATE TABLE IF NOT EXISTS messages (
				id UUID PRIMARY KEY,
				session_id TEXT NOT NULL,
				role TEXT NOT NULL,
				content TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at);

			CREATE TABLE IF NOT EXISTS longterm_memory (
				id UUID PRIMARY KEY,
				session_id TEXT,
				text TEXT NOT NULL,
				embedding vector(1536),
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
			DO $$ BEGIN
				CREATE INDEX idx_longterm_memory_embedding ON longterm_memory USING hnsw (embedding vector_cosine_ops);
			EXCEPTION WHEN duplicate_table THEN NULL; END $$;

			CREATE TABLE IF NOT EXISTS lg_checkpoints (
				id UUID PRIMARY KEY,
				session_id TEXT NOT NULL,
				state JSONB NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS idx_lg_checkpoints_session_created ON lg_checkpoints(session_id, created_at DESC);

			-- long-term memory schema (pgvector) per AI Context doc
			CREATE TABLE IF NOT EXISTS long_term_memories (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				user_id TEXT NOT NULL,
				content TEXT NOT NULL,
				embedding vector(1536),
				metadata JSONB DEFAULT '{}',
				importance_score FLOAT DEFAULT 0.5,
				access_count INTEGER DEFAULT 0,
				last_accessed TIMESTAMPTZ DEFAULT NOW(),
				created_at TIMESTAMPTZ DEFAULT NOW(),
				updated_at TIMESTAMPTZ DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS idx_memories_user_id ON long_term_memories(user_id);
			DO $$ BEGIN
				CREATE INDEX idx_memories_embedding ON long_term_memories USING hnsw (embedding vector_cosine_ops);
			EXCEPTION WHEN duplicate_table THEN NULL; END $$;
		`);
	} catch (err) {
		// Swallow init errors to avoid crashing app; init SQL handles bootstrap
		console.warn('DB init skipped or failed:', (err as Error)?.message);
	}
}

export function vectorLiteral(vec: number[]): string {
	// pgvector accepts '[v1, v2, ...]' literal
	return '[' + vec.join(',') + ']';
}


