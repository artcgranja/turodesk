import pg from 'pg';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { OpenAIEmbeddings } from '@langchain/openai';

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
    // Remove anteriores com a mesma chave para o usuário
    await this.deleteUserFactByKey(userId, key);
    // Adiciona novo documento com embeddings
    await this.addMemory({
      threadId: `user:${userId}`,
      userId,
      content,
      category: 'user_profile',
      tags: tags ?? ['user_fact'],
      importanceScore: 0.8,
    });
  }
}


