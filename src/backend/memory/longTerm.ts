import pg from 'pg';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { OpenAIEmbeddings } from '@langchain/openai';
import { vectorLiteral } from '../db';

export type AddMemoryInput = {
  threadId: string;
  content: string;
  category?: string;
  tags?: string[];
  importanceScore?: number;
  userId?: string;
};

export class LongTermMemory {
  private vectorStore: PGVectorStore | null = null;
  private embeddings: OpenAIEmbeddings | null = null;
  private pool: pg.Pool | null = null;

  constructor(private readonly poolOptions: pg.PoolConfig, private readonly tableName = 'long_term_memories') {}

  private ensureEmbeddings(): OpenAIEmbeddings {
    if (!this.embeddings) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY não configurada para embeddings');
      this.embeddings = new OpenAIEmbeddings({ apiKey, model: 'text-embedding-3-small' });
    }
    return this.embeddings;
  }

  async ensureStore(): Promise<PGVectorStore> {
    if (this.vectorStore) return this.vectorStore;
    const embeddings = this.ensureEmbeddings();
    this.vectorStore = await PGVectorStore.initialize(embeddings, {
      postgresConnectionOptions: this.poolOptions,
      tableName: this.tableName,
      columns: {
        idColumnName: 'id',
        contentColumnName: 'content',
        vectorColumnName: 'embedding',
        metadataColumnName: 'metadata',
      },
    });
    return this.vectorStore;
  }

  private ensurePool(): pg.Pool {
    if (!this.pool) {
      this.pool = new pg.Pool(this.poolOptions);
    }
    return this.pool;
  }

  async addMemory(input: AddMemoryInput): Promise<void> {
    const vs = await this.ensureStore();
    const { threadId, content } = input;
    const importance = typeof input.importanceScore === 'number' ? input.importanceScore : 0.5;
    await vs.addDocuments([
      {
        pageContent: content,
        metadata: {
          thread_id: threadId,
          user_id: input.userId || 'local_user',
          category: input.category || 'conversation',
          tags: input.tags || [],
          importance_score: importance,
          timestamp: new Date().toISOString(),
          source_type: 'conversation',
        },
      },
    ]);
  }

  async search(
    query: string,
    topK = 5,
    filters?: Record<string, unknown>
  ): Promise<Array<{ content: string; metadata: Record<string, unknown> }>> {
    const vs = await this.ensureStore();
    const results = await vs.similaritySearch(query, topK, filters as any);
    return results.map((d) => ({ content: d.pageContent, metadata: d.metadata ?? {} }));
  }

  async listUserFacts(userId: string, limit = 50): Promise<Array<{ id: string; content: string; metadata: Record<string, unknown> }>> {
    const pool = this.ensurePool();
    const res = await pool.query(`SELECT id, content, metadata FROM ${this.tableName} WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`, [userId, limit]);
    return res.rows.map((r) => ({ id: r.id as string, content: r.content as string, metadata: (r.metadata as any) ?? {} }));
  }

  async deleteUserFactByKey(userId: string, key: string): Promise<number> {
    const pool = this.ensurePool();
    const res = await pool.query(`DELETE FROM ${this.tableName} WHERE user_id = $1 AND metadata->>'key' = $2`, [userId, key]);
    // rowCount is number of deleted rows
    return (res.rowCount as number) || 0;
  }

  async deleteByCategory(userId: string, category: string): Promise<number> {
    const pool = this.ensurePool();
    const res = await pool.query(`DELETE FROM ${this.tableName} WHERE user_id = $1 AND (metadata->>'category' = $2 OR $2 IS NULL)`, [userId, category]);
    return (res.rowCount as number) || 0;
  }

  async upsertUserFact(userId: string, key: string, content: string, tags?: string[]): Promise<void> {
    // Novo comportamento: atualizar o resumo único de perfil com uma frase completa
    await this.updateUserProfileSummaryFromFact(userId, key, content, tags);
  }

  // ========== Novo modelo de memória de perfil único ==========
  private canonicalizeKey(key: string): string {
    return key
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_\s-]/g, '')
      .replace(/\s+/g, '_')
      .trim();
  }

  private renderSentenceForKey(rawKey: string, value: string): string {
    const key = this.canonicalizeKey(rawKey);
    const v = (value || '').toString().trim();
    const templates: Record<string, (x: string) => string> = {
      nome: (x) => `O nome do usuário é ${x}.`,
      name: (x) => `O nome do usuário é ${x}.`,
      idade: (x) => `A idade do usuário é ${x}.`,
      age: (x) => `A idade do usuário é ${x}.`,
      cidade: (x) => `O usuário mora em ${x}.`,
      cidade_atual: (x) => `O usuário mora em ${x}.`,
      localizacao: (x) => `O usuário mora em ${x}.`,
      location: (x) => `O usuário mora em ${x}.`,
      idioma: (x) => `O idioma preferido do usuário é ${x}.`,
      linguagem: (x) => `A linguagem preferida do usuário é ${x}.`,
      idioma_preferido: (x) => `O idioma preferido do usuário é ${x}.`,
      email: (x) => `O e-mail do usuário é ${x}.`,
      horario_preferido: (x) => `O horário preferido do usuário é ${x}.`,
      tema: (x) => `O tema preferido do usuário é ${x}.`,
      tema_preferido: (x) => `O tema preferido do usuário é ${x}.`,
      timezone: (x) => `O fuso horário do usuário é ${x}.`,
      fuso_horario: (x) => `O fuso horário do usuário é ${x}.`,
    };
    const fn = templates[key];
    if (fn) return fn(v);
    return `Sobre ${rawKey}: ${v}.`;
  }

  private async getProfileSummaryRow(userId: string): Promise<
    | { id: string; content: string; metadata: Record<string, any> }
    | null
  > {
    const pool = this.ensurePool();
    const res = await pool.query(
      `SELECT id, content, metadata FROM ${this.tableName} WHERE user_id = $1 AND metadata->>'key' = 'user_profile_summary' LIMIT 1`,
      [userId]
    );
    if ((res.rowCount || 0) > 0) {
      const r = res.rows[0];
      return { id: r.id as string, content: r.content as string, metadata: (r.metadata as any) ?? {} };
    }
    return null;
  }

  async getUserProfileSummary(userId: string): Promise<string> {
    const row = await this.getProfileSummaryRow(userId);
    return row?.content || '';
  }

  async getUserProfileKeys(userId: string): Promise<Record<string, string>> {
    const row = await this.getProfileSummaryRow(userId);
    const keys = (row?.metadata?.profile_keys as Record<string, string>) || {};
    return keys;
  }

  async updateUserProfileSummaryFromFact(
    userId: string,
    key: string,
    value: string,
    tags?: string[]
  ): Promise<void> {
    const pool = this.ensurePool();
    const sentence = this.renderSentenceForKey(key, value);
    const canonicalKey = this.canonicalizeKey(key);

    const existing = await this.getProfileSummaryRow(userId);
    const metadataBase = {
      key: 'user_profile_summary',
      category: 'user_profile',
      tags: Array.from(new Set([...(tags ?? []), 'user_profile', 'summary'])),
      importance_score: 0.9,
      source_type: 'tool',
    } as Record<string, any>;

    let nextProfileKeys: Record<string, string> = {};
    let nextContent = '';
    if (existing) {
      const existingKeys = (existing.metadata?.profile_keys as Record<string, string>) || {};
      nextProfileKeys = { ...existingKeys, [canonicalKey]: sentence };
      nextContent = Object.values(nextProfileKeys).join(' ');
      const embeddings = this.ensureEmbeddings();
      const [vec] = await embeddings.embedDocuments([nextContent]);
      await pool.query(
        `UPDATE ${this.tableName}
         SET content = $1,
             embedding = ${vectorLiteral(vec)},
             metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{profile_keys}', $2::jsonb, true),
             updated_at = NOW()
         WHERE id = $3`,
        [nextContent, JSON.stringify(nextProfileKeys), existing.id]
      );
    } else {
      nextProfileKeys = { [canonicalKey]: sentence };
      nextContent = sentence;
      const embeddings = this.ensureEmbeddings();
      const [vec] = await embeddings.embedDocuments([nextContent]);
      const metadata = { ...metadataBase, profile_keys: nextProfileKeys };
      await pool.query(
        `INSERT INTO ${this.tableName} (user_id, content, embedding, metadata, importance_score, access_count, last_accessed, created_at, updated_at)
         VALUES ($1, $2, ${vectorLiteral(vec)}, $3::jsonb, $4, 0, NOW(), NOW(), NOW())`,
        [userId, nextContent, JSON.stringify(metadata), 0.9]
      );
    }
  }

  async removeUserProfileFact(userId: string, key: string): Promise<boolean> {
    const pool = this.ensurePool();
    const existing = await this.getProfileSummaryRow(userId);
    if (!existing) return false;
    const canonicalKey = this.canonicalizeKey(key);
    const existingKeys = (existing.metadata?.profile_keys as Record<string, string>) || {};
    if (!(canonicalKey in existingKeys)) return false;
    delete existingKeys[canonicalKey];
    const nextContent = Object.values(existingKeys).join(' ');
    const embeddings = this.ensureEmbeddings();
    const [vec] = await embeddings.embedDocuments([nextContent]);
    await pool.query(
      `UPDATE ${this.tableName}
       SET content = $1,
           embedding = ${vectorLiteral(vec)},
           metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{profile_keys}', $2::jsonb, true),
           updated_at = NOW()
       WHERE id = $3`,
      [nextContent, JSON.stringify(existingKeys), existing.id]
    );
    return true;
  }
}


