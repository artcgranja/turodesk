# Technology Stack

## Core Technologies

- **Electron**: Desktop application framework (Main/Preload/Renderer processes)
- **TypeScript**: Primary language with strict type checking
- **Tailwind CSS**: Utility-first CSS framework with custom typography plugin
- **esbuild**: Fast bundler for all TypeScript compilation
- **LangChain/LangGraph**: AI orchestration with OpenAI integration
- **Node.js**: Runtime environment (18+ required, 20+ recommended)

## Key Dependencies

### AI & Language Processing
- `@langchain/langgraph`: State graph orchestration for AI workflows
- `@langchain/openai`: OpenAI API integration
- `@langchain/core`: Core LangChain functionality
- `@langchain/community`: Community tools and integrations

### UI & Rendering
- `marked`: Markdown parsing and rendering
- `dompurify`: HTML sanitization for security
- `@tailwindcss/typography`: Enhanced typography styles

### Data & Storage
- `pg`: PostgreSQL client for database operations
- `@langchain/langgraph-checkpoint-postgres`: PostgreSQL checkpoint storage for LangGraph
- `uuid`: UUID generation for sessions and users
- `dotenv`: Environment variable management
- `zod`: Runtime type validation

## Build System

### Development Commands
```bash
npm run dev          # Start development with hot reload
npm run dev:main     # Watch main process only
npm run dev:preload  # Watch preload script only
npm run dev:renderer # Watch renderer process only
npm run dev:css      # Watch CSS compilation
```

### Production Commands
```bash
npm run build        # Full production build
npm run build:main   # Build main process
npm run build:preload # Build preload script
npm run build:renderer # Build renderer
npm run build:css    # Build and minify CSS
npm start            # Start built application
```

### Build Configuration
- **Bundler**: esbuild with platform-specific targets
- **CSS**: Tailwind CSS with PostCSS and Autoprefixer
- **Output**: All builds go to `dist/` directory
- **Watch Mode**: Concurrent development with automatic rebuilds

## Environment Configuration

Required for full functionality:
```env
# OpenAI (required for AI features)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # Optional, defaults to gpt-4o-mini

# PostgreSQL (required for persistent chat history)
DATABASE_URI=postgresql://turodesk:turodesk@localhost:5432/turodesk
POSTGRES_DB=turodesk
POSTGRES_USER=turodesk
POSTGRES_PASSWORD=turodesk
POSTGRES_PORT=5432
```

Optional services:
```env
REDIS_URI=redis://localhost:6379
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=turodesk
```

## Development Setup

1. Start services: `docker compose up -d`
2. Install dependencies: `npm install`
3. Create `.env` file: `cp .env.example .env`
4. Configure OpenAI API key in `.env`
5. Run development: `npm run dev`
6. For production: `npm run build && npm start`

## Docker Services

Required PostgreSQL and Redis services via `docker-compose.yml`:
- **PostgreSQL**: Stores LangGraph checkpoints and long-term memory
- **Redis**: Used by LangGraph API service
- **LangGraph API**: Optional external API service