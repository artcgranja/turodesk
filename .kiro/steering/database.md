# Database Schema

## Overview

Turodesk uses PostgreSQL with pgvector extension for complete data persistence. The database handles user management, chat sessions, conversation history, and long-term memory with embeddings.

## Core Tables

### users
Stores user information and provides the foundation for all user-related data.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Features:**
- UUID primary key for security and scalability
- Optional username and email (can be null)
- Automatic timestamp management
- Unique constraints on username and email

### chats
Manages chat sessions with proper user relationships and title management.

```sql
CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Features:**
- Foreign key relationship to users with CASCADE delete
- Editable chat titles
- Automatic timestamp updates
- Indexed by user_id and updated_at for performance

### LangGraph Checkpoint Tables
Standard LangGraph tables for conversation persistence:

- `checkpoints`: Main checkpoint data
- `checkpoint_blobs`: Binary data storage
- `checkpoint_writes`: Write operations tracking

### long_term_memories
Enhanced memory storage with user and chat relationships:

```sql
CREATE TABLE long_term_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  importance_score FLOAT DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Database Operations

### DatabaseQueries Class
Located in `src/backend/db/queries.ts`, this class provides:

**User Operations:**
- `createUser()`: Create new user
- `getUserById()`: Retrieve user by ID
- `ensureUserExists()`: Get or create user

**Chat Operations:**
- `createChat()`: Create new chat session
- `getChatsByUserId()`: List user's chats
- `updateChatTitle()`: Rename chat
- `deleteChat()`: Remove chat and related data
- `updateChatTimestamp()`: Update last activity

**Utility Methods:**
- `getChatWithUser()`: Join query for chat with user data

## Data Flow

1. **User Initialization**: App creates or retrieves user on startup
2. **Chat Management**: All chats linked to authenticated user
3. **Conversation Storage**: LangGraph checkpoints use chat IDs as thread IDs
4. **Memory Integration**: Long-term memories linked to both user and chat
5. **Backup Strategy**: Local JSON files maintained as fallback

## Migration Strategy

The system maintains backward compatibility:
- Local user.json file provides stable user ID
- Existing chat history migrated on first run
- Graceful fallback to local storage if database unavailable

## Performance Considerations

**Indexes:**
- `idx_chats_user_id`: Fast user chat lookups
- `idx_chats_updated_at`: Ordered chat lists
- `idx_memories_user_id`: User memory queries
- `idx_memories_chat_id`: Chat-specific memories
- `idx_memories_embedding`: Vector similarity search

**Relationships:**
- CASCADE deletes ensure data consistency
- Foreign key constraints maintain referential integrity
- JSONB metadata for flexible storage without schema changes