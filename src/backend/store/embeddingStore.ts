import fs from 'node:fs';
import path from 'node:path';

export interface EmbeddedRecord {
  id: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export class JSONEmbeddingStore {
  private readonly filePath: string;
  private cache: EmbeddedRecord[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        this.cache = JSON.parse(raw);
      } catch {
        this.cache = [];
      }
    } else {
      this.persist();
    }
  }

  add(record: EmbeddedRecord): void {
    this.cache.push(record);
    this.persist();
  }

  addMany(records: EmbeddedRecord[]): void {
    this.cache.push(...records);
    this.persist();
  }

  query(embedding: number[], topK = 5, filter?: (rec: EmbeddedRecord) => boolean): EmbeddedRecord[] {
    const source = filter ? this.cache.filter(filter) : this.cache;
    const scored = source.map((r) => ({ r, score: cosineSimilarity(embedding, r.embedding) }));
    return scored.sort((a, b) => b.score - a.score).slice(0, topK).map((s) => s.r);
  }

  clear(filter?: (rec: EmbeddedRecord) => boolean): void {
    this.cache = filter ? this.cache.filter((r) => !filter(r)) : [];
    this.persist();
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf8');
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}
