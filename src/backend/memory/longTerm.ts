import pg from 'pg';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { OpenAIEmbeddings } from '@langchain/openai';

export type AddMemoryInput = {
  userId: string;
  threadId: string;
  content: string;
  category?: string;
  tags?: string[];
  importanceScore?: number;
};

export class LongTermMemory {
  private vectorStore: PGVectorStore | null = null;
  private embeddings: OpenAIEmbeddings | null = null;

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

  async addMemory(input: AddMemoryInput): Promise<void> {
    const vs = await this.ensureStore();
    const { userId, threadId, content } = input;
    const importance = typeof input.importanceScore === 'number' ? input.importanceScore : 0.5;
    await vs.addDocuments([
      {
        pageContent: content,
        metadata: {
          user_id: userId,
          thread_id: threadId,
          category: input.category || 'conversation',
          tags: input.tags || [],
          importance_score: importance,
          timestamp: new Date().toISOString(),
          source_type: 'conversation',
        },
      },
    ]);
  }

  async search(query: string, userId: string, topK = 5): Promise<Array<{ content: string; metadata: Record<string, unknown> }>> {
    const vs = await this.ensureStore();
    const results = await vs.similaritySearch(query, topK, { user_id: userId });
    return results.map((d) => ({ content: d.pageContent, metadata: d.metadata ?? {} }));
  }
}


