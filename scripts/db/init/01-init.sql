-- Initial bootstrap for Turodesk Postgres
CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT NOT NULL DEFAULT 'ok'
);

INSERT INTO health_check(note) VALUES ('db up');


