-- Init for memory Postgres (only long-term memory schema)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- long-term memory schema
CREATE TABLE IF NOT EXISTS long_term_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
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

