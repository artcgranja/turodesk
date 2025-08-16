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
    description:
      'Atualiza o resumo único de perfil do usuário com uma frase clara (ex: "O nome do usuário é Arthur."). Use uma chave curta (ex: nome, idioma, tema).',
    schema: z.object({ key: z.string(), content: z.string(), tags: z.array(z.string()).optional() }),
    func: async ({ key, content, tags }) => {
      if (!longTerm) return 'Memória desabilitada';
      await longTerm.updateUserProfileSummaryFromFact(getUserId(), key, content, tags);
      const summary = await longTerm.getUserProfileSummary(getUserId());
      return `Resumo atualizado. Perfil: ${summary}`;
    },
  });

  const deleteUserFact = new DynamicStructuredTool({
    name: 'delete_user_fact',
    description: 'Remove uma informação específica do resumo de perfil do usuário pela chave (ex: nome, idioma).',
    schema: z.object({ key: z.string() }),
    func: async ({ key }) => {
      if (!longTerm) return 'Memória desabilitada';
      await longTerm.removeUserProfileFact(getUserId(), key);
      const summary = await longTerm.getUserProfileSummary(getUserId());
      return summary ? `Atualizado. Perfil: ${summary}` : 'Perfil vazio.';
    },
  });

  const listUserFacts = new DynamicStructuredTool({
    name: 'list_user_facts',
    description: 'Lista o mapa de chaves e a versão textual do resumo de perfil do usuário.',
    schema: z.object({}).optional(),
    func: async (_args) => {
      if (!longTerm) return 'Memória desabilitada';
      const [summary, keys] = await Promise.all([
        longTerm.getUserProfileSummary(getUserId()),
        longTerm.getUserProfileKeys(getUserId()),
      ]);
      return JSON.stringify({ summary, keys });
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


