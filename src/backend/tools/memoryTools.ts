import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { LongTermMemory } from '../memory/longTerm';

export type MemoryToolsDeps = {
  longTerm: LongTermMemory | null;
  getUserId: () => string;
};

export function buildMemoryTools(deps: MemoryToolsDeps): DynamicStructuredTool[] {
  const { longTerm, getUserId } = deps;

  const upsertUserFact = new DynamicStructuredTool({
    name: 'upsert_user_fact',
    description: 'Atualiza ou cria um fato de perfil do usuário (ex: nome, preferência). Use chave curta e descritiva.',
    schema: z.object({ key: z.string(), content: z.string(), tags: z.array(z.string()).optional() }),
    func: async ({ key, content, tags }) => {
      if (longTerm) await longTerm.upsertUserFact(getUserId(), key, content, tags);
      return `Fato salvo: ${key}`;
    },
  });

  const deleteUserFact = new DynamicStructuredTool({
    name: 'delete_user_fact',
    description: 'Remove um fato de perfil do usuário por chave exata.',
    schema: z.object({ key: z.string() }),
    func: async ({ key }) => {
      if (!longTerm) return 'Memória desabilitada';
      const removed = await longTerm.deleteUserFactByKey(getUserId(), key);
      return removed > 0 ? `Removido ${removed} registro(s) para ${key}` : `Nenhum registro para ${key}`;
    },
  });

  const listUserFacts = new DynamicStructuredTool({
    name: 'list_user_facts',
    description: 'Lista fatos de perfil do usuário mais recentes.',
    schema: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
    func: async ({ limit }) => {
      if (!longTerm) return 'Memória desabilitada';
      const facts = await longTerm.listUserFacts(getUserId(), limit ?? 50);
      return JSON.stringify(facts);
    },
  });

  const searchUserMemories = new DynamicStructuredTool({
    name: 'search_user_memories',
    description: 'Busca memórias relevantes do usuário (long-term) por similaridade semântica. Use apenas quando necessário para responder à pergunta atual e evite trazer informações pessoais não solicitadas.',
    schema: z.object({ query: z.string(), topK: z.number().int().min(1).max(20).default(5) }),
    func: async ({ query, topK }) => {
      if (!longTerm) return 'Memória desabilitada';
      const results = await longTerm.search(query, topK ?? 5, { user_id: getUserId() });
      return JSON.stringify(results);
    },
  });

  const deleteConversationMemories = new DynamicStructuredTool({
    name: 'delete_conversation_memories',
    description: 'Apaga memórias antigas de categoria conversation/chat para reduzir ruído. Use quando o usuário pedir limpeza de histórico de memórias.',
    schema: z.object({ category: z.enum(['conversation', 'chat']).default('conversation') }),
    func: async ({ category }) => {
      if (!longTerm) return 'Memória desabilitada';
      const removed = await longTerm.deleteByCategory(getUserId(), category);
      return `Removidos ${removed} itens de categoria ${category}`;
    },
  });

  return [upsertUserFact, deleteUserFact, listUserFacts, searchUserMemories, deleteConversationMemories];
}


