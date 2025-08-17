# Turodesk Documentation

## Overview

Turodesk is a modern desktop AI assistant built with Electron, featuring PostgreSQL database integration, GitHub OAuth authentication, and persistent conversation management.

## Quick Start

1. **Prerequisites**
   - Node.js 18+ (recommended 20+)
   - Docker and Docker Compose
   - GitHub account (for OAuth setup)

2. **Installation**
   ```bash
   git clone https://github.com/artcgranja/turodesk.git
   cd turodesk
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your OpenAI API key and GitHub OAuth credentials
   ```

4. **Start Services**
   ```bash
   docker compose up -d
   ```

5. **Run Application**
   ```bash
   npm run dev  # Development mode
   # or
   npm run build && npm start  # Production mode
   ```

## Features

### 🤖 AI-Powered Conversations
- Real-time token streaming
- Context-aware responses
- Long-term memory with embeddings
- ReAct agent architecture with tools

### 👤 User Authentication
- GitHub OAuth integration
- Persistent sessions (30-day expiration)
- Automatic user management
- Secure local state storage

### 💬 Chat Management
- Create, rename, and delete conversations
- User-specific chat history
- PostgreSQL-backed persistence
- Local JSON backup fallback

### 🗄️ Database Integration
- PostgreSQL with pgvector extension
- Relational user and chat management
- LangGraph checkpoint storage
- Automatic schema initialization

## Architecture

### Frontend (Renderer Process)
- **Framework**: Vanilla TypeScript with Tailwind CSS
- **Security**: Context isolation, sandboxed environment
- **UI Components**: Modular sidebar, chat interface, markdown rendering
- **State Management**: Local state with IPC communication

### Backend (Main Process)
- **Chat Manager**: Session coordination and user management
- **AI Agent**: LangGraph-based ReAct agent with PostgreSQL integration
- **Authentication**: GitHub OAuth with persistent sessions
- **Database**: Type-safe queries with relational data modeling

### Data Flow
```
User Input → Renderer → IPC → ChatManager → TurodeskAgent → PostgreSQL
                                    ↓
GitHub OAuth → Authentication → User Context → Database Storage
```

## Configuration

### Required Environment Variables
```env
# OpenAI (required for AI features)
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini

# PostgreSQL (required)
DATABASE_URI=postgresql://turodesk:turodesk@localhost:5432/turodesk
POSTGRES_DB=turodesk
POSTGRES_USER=turodesk
POSTGRES_PASSWORD=turodesk
POSTGRES_PORT=5432

# GitHub OAuth (optional but recommended)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

### Optional Environment Variables
```env
# LangSmith (for debugging)
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your-langsmith-key
LANGSMITH_PROJECT=turodesk
```

## Development

### Project Structure
```
src/
├── main.ts                 # Electron main process
├── preload.ts             # Secure IPC bridge
├── renderer.ts            # UI logic and state management
├── backend/
│   ├── auth/              # GitHub OAuth implementation
│   ├── chat/              # Chat management and types
│   ├── db/                # Database queries and models
│   ├── agent/             # AI agent and system prompts
│   └── tools/             # LangChain tools
├── ui/                    # UI components
└── styles/                # Tailwind CSS
```

### Key Components

#### ChatManager
- Coordinates between authentication, database, and AI agent
- Manages user sessions and chat metadata
- Handles fallback to local storage

#### TurodeskAgent
- LangGraph-based ReAct agent
- PostgreSQL checkpoint integration
- Real-time token streaming
- Tool-based interactions

#### GitHubAuth
- OAuth flow with external browser
- Persistent session management
- Automatic state validation
- 30-day session expiration

### Database Schema

#### Core Tables
- `users`: User profiles with GitHub integration
- `chats`: User-specific conversations with editable titles
- `checkpoints`: LangGraph conversation state
- `long_term_memories`: Embeddings with pgvector

#### Relationships
- Users → Chats (one-to-many)
- Chats → Checkpoints (via thread_id)
- Users/Chats → Memories (many-to-many)

## Deployment

### Development
```bash
docker compose up -d    # Start services
npm run dev            # Start with hot reload
```

### Production
```bash
docker compose up -d    # Start services
npm run build          # Build application
npm start              # Start Electron app
```

### Docker Services
- **PostgreSQL**: Database with pgvector extension
- **Redis**: For LangGraph API (optional)

## Security

### Electron Security
- Context isolation enabled
- Node integration disabled
- Sandboxed renderer process
- Content Security Policy

### Authentication Security
- OAuth credentials stored locally only
- No permanent token storage
- Session expiration (30 days)
- Automatic state validation

### Database Security
- Parameterized queries prevent SQL injection
- UUID primary keys for security
- CASCADE deletes maintain referential integrity
- Connection pooling with timeouts

## Troubleshooting

### Common Issues

**Application won't start**
- Check if Docker services are running: `docker compose ps`
- Verify `.env` file exists and has required variables
- Run `npm run build` before `npm start`

**Authentication not working**
- Verify GitHub OAuth app configuration
- Check callback URL: `http://localhost:3000/callback`
- Ensure port 3000 is available

**Database connection errors**
- Restart Docker services: `docker compose restart`
- Check `DATABASE_URI` in `.env`
- Verify PostgreSQL container health

**No AI responses**
- Verify `OPENAI_API_KEY` is set correctly
- Check network connectivity
- Review console logs for errors

### Logs and Debugging
- Main process logs appear in terminal
- Renderer logs in DevTools console (F12)
- Database logs: `docker logs turodesk_postgres`
- Enable LangSmith tracing for AI debugging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Update documentation
5. Submit a pull request

### Code Style
- TypeScript with strict mode
- ESLint and Prettier configuration
- Conventional commit messages
- Comprehensive error handling

## License

MIT License - see LICENSE file for details.