import type { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { DynamicStructuredTool } from '@langchain/core/tools';

export function createAgent(llm: ChatOpenAI, tools: DynamicStructuredTool[]) {
  return createReactAgent({ llm, tools });
}