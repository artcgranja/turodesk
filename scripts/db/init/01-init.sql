-- Initial bootstrap for Turodesk Postgres
-- bootstrap base
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT NOT NULL DEFAULT 'ok'
);
INSERT INTO health_check(note) VALUES ('db up');

-- chat messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at);

-- long term memory (pgvector)
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

-- langgraph checkpoints (generic JSON state per sessão)
CREATE TABLE IF NOT EXISTS lg_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_checkpoints_session_created ON lg_checkpoints(session_id, created_at DESC);


