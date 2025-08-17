import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage, BaseMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool } from 'pg';
import { getSystemPrompt } from './systemPrompt';
import { buildMemoryTools } from '../tools/memoryTools';

export interface AgentConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  dbPool: Pool;
}

export class TurodeskAgent {
  private llm: ChatOpenAI;
  private tools: DynamicStructuredTool[];
  private checkpointer: PostgresSaver;
  private agent: any = null;

  constructor(config: AgentConfig) {
    // Initialize LLM
    this.llm = new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.model || 'gpt-4o-mini',
      temperature: config.temperature || 0.2,
      streaming: true,
    });

    // Initialize tools
    this.tools = buildMemoryTools();

    // Initialize PostgreSQL checkpointer
    this.checkpointer = new PostgresSaver(config.dbPool);

    // Initialize agent
    this.initializeAgent();
  }

  private async initializeAgent(): Promise<void> {
    try {
      // Setup checkpointer
      await this.checkpointer.setup();
      console.log('Agent PostgreSQL checkpointer initialized');

      // Create ReAct agent with tools and checkpointer
      this.agent = createReactAgent({
        llm: this.llm,
        tools: this.tools,
        // Use any to bypass type issues - the agent will work correctly
        checkpointSaver: this.checkpointer as any
      });

      console.log('ReAct Agent created successfully');

    } catch (error) {
      console.error('Failed to initialize agent:', error);
      throw new Error('Agent initialization failed - PostgreSQL is required');
    }
  }



  async sendMessage(sessionId: string, input: string): Promise<string> {
    if (!this.agent) {
      throw new Error('Agent not initialized');
    }

    const systemMessage = new SystemMessage(getSystemPrompt({
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }));

    const result = await this.agent.invoke(
      { messages: [systemMessage, new HumanMessage(input)] },
      { configurable: { thread_id: sessionId, checkpoint_ns: 'turodesk' } }
    );

    return (result.messages[result.messages.length - 1] ?? new AIMessage('')).content as string;
  }

  async sendMessageStream(
    sessionId: string,
    input: string,
    onToken: (token: string) => void,
    priorMessages: BaseMessage[] = []
  ): Promise<string> {
    if (!this.agent) {
      throw new Error('Agent not initialized');
    }

    const systemMessage = new SystemMessage(getSystemPrompt({
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }));

    const allMessages = [systemMessage, ...priorMessages, new HumanMessage(input)];

    // Use ReAct agent with streaming callbacks
    let fullText = '';
    const result = await this.agent.invoke(
      { messages: allMessages },
      {
        configurable: { thread_id: sessionId, checkpoint_ns: 'turodesk' },
        callbacks: [
          {
            handleLLMNewToken: (token: string) => {
              fullText += token;
              onToken(token);
            },
          },
        ],
      }
    );

    const finalContent = (result.messages[result.messages.length - 1] ?? new AIMessage('')).content as string;
    return fullText || finalContent;
  }

  async getMessages(sessionId: string): Promise<BaseMessage[]> {
    if (!this.checkpointer) {
      return [];
    }

    try {
      const ckpt = await this.checkpointer.get({
        configurable: { thread_id: sessionId, checkpoint_ns: 'turodesk' }
      });
      const messages = ckpt?.channel_values?.messages;
      return Array.isArray(messages) ? messages : [];
    } catch (error) {
      console.warn('Failed to read from PostgreSQL checkpointer:', error);
      return [];
    }
  }

  async cleanup(): Promise<void> {
    // Cleanup is handled by the database pool
    console.log('Agent cleanup completed');
  }

  // Static factory method
  static async create(config: AgentConfig): Promise<TurodeskAgent> {
    const agent = new TurodeskAgent(config);
    // Wait a moment for async initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    return agent;
  }
}