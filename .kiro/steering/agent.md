# Agent Architecture

## TurodeskAgent Class

The `TurodeskAgent` class in `src/backend/agent/index.ts` is the core AI component that handles all conversation logic and integrates with PostgreSQL for persistent memory.

## Key Features

### PostgreSQL Integration
- **Required Dependency**: Agent cannot function without PostgreSQL connection
- **LangGraph Checkpointer**: Uses `PostgresSaver` for conversation persistence
- **Automatic Setup**: Initializes database tables and connections on startup

### Dual Agent Architecture
- **ReAct Agent**: For tool-based interactions and complex reasoning
- **Simple Graph**: For direct conversation without tools
- **Streaming Support**: Real-time token streaming with callbacks

### Configuration
```typescript
interface AgentConfig {
  apiKey: string;        // OpenAI API key (required)
  model?: string;        // Model name (default: gpt-4o-mini)
  temperature?: number;  // Temperature (default: 0.2)
  dbPool: Pool;         // PostgreSQL connection pool (required)
}
```

## Core Methods

### `sendMessage(sessionId, input)`
- Simple message sending for basic conversations
- Uses the simple graph architecture
- Automatically persists to PostgreSQL checkpointer

### `sendMessageStream(sessionId, input, onToken, priorMessages)`
- Streaming message with real-time token callbacks
- Uses ReAct agent with tool support
- Includes conversation context from prior messages
- System prompt injection with timezone awareness

### `getMessages(sessionId)`
- Retrieves conversation history from PostgreSQL checkpointer
- Returns array of `BaseMessage` objects
- Handles errors gracefully

## Error Handling

### Initialization Failures
- Throws error if PostgreSQL connection fails
- Throws error if OpenAI API key is missing
- No fallback modes - PostgreSQL is mandatory

### Runtime Failures
- Logs warnings for checkpoint read/write failures
- Graceful degradation where possible
- Clear error messages for debugging

## Integration with ChatManager

The `ChatManager` creates and manages the `TurodeskAgent` instance:

1. **Initialization**: Creates agent with PostgreSQL pool after user authentication
2. **Message Routing**: Delegates all AI operations to agent with user context
3. **Session Management**: Links conversations to authenticated users
4. **Backup Storage**: Maintains local JSON files as backup
5. **Authentication Integration**: Validates user state before agent operations

## Development Guidelines

### Adding New Tools
1. Implement tools in `src/backend/tools/`
2. Register in `buildMemoryTools()` function
3. Tools automatically available to ReAct agent
4. Consider user context in tool implementations

### Modifying System Prompts
- Edit `src/backend/agent/systemPrompt.ts`
- Supports dynamic context (timezone, location, user info)
- Applied automatically to streaming conversations
- Can include user-specific context from authentication

### Database Schema Changes
- Update `scripts/db/init/01-init.sql`
- Restart containers to apply changes
- Agent handles schema setup automatically
- Consider user relationships in new tables

### Authentication Integration
- Agent operations require valid user context
- Tools can access user information via ChatManager
- Session persistence handled automatically
- Graceful fallback to local user when needed