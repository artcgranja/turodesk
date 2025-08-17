# Project Structure

## Directory Organization

```
turodesk/
├── src/                    # Source code
│   ├── main.ts            # Electron main process
│   ├── preload.ts         # Secure bridge between main and renderer
│   ├── renderer.ts        # UI logic and chat interface
│   ├── global.d.ts        # Global type definitions
│   ├── backend/           # Backend logic
│   │   ├── ipc.ts         # IPC handlers registration
│   │   ├── db.ts          # Database utilities
│   │   ├── agent/         # AI agent configuration
│   │   ├── chat/          # Chat management
│   │   ├── memory/        # Memory storage (unused currently)
│   │   ├── store/         # Data persistence (unused currently)
│   │   └── tools/         # LangChain tools
│   ├── styles/            # CSS source files
│   │   └── tailwind.css   # Tailwind entry point
│   └── ui/                # UI components and utilities
│       ├── chat.ts        # Chat interface logic
│       ├── dom.ts         # DOM utilities
│       ├── home.ts        # Home screen logic
│       ├── markdown.ts    # Markdown rendering
│       └── sidebar.ts     # Sidebar management
├── dist/                  # Build output (generated)
├── scripts/               # Database and setup scripts
│   └── db/init/          # Database initialization
├── .kiro/                 # Kiro IDE configuration
└── node_modules/          # Dependencies
```

## Architecture Patterns

### Electron Process Architecture
- **Main Process** (`src/main.ts`): Window management, IPC registration, app lifecycle
- **Preload Script** (`src/preload.ts`): Secure API bridge with `contextIsolation: true`
- **Renderer Process** (`src/renderer.ts`): UI logic, DOM manipulation, user interactions

### Backend Organization
- **IPC Layer** (`src/backend/ipc.ts`): Handles all inter-process communication
- **Chat Manager** (`src/backend/chat/manager.ts`): Session management and coordination with agent
- **Agent System** (`src/backend/agent/index.ts`): Complete AI agent with PostgreSQL integration
- **System Prompts** (`src/backend/agent/systemPrompt.ts`): Dynamic system prompt generation
- **Tools** (`src/backend/tools/`): LangChain tools for memory and functionality

### Data Storage Patterns
- **PostgreSQL (Primary)**: LangGraph checkpoints for conversation history
- **Local Files (Backup)**: JSON-based fallback storage in user data directory
- **Session Management**: Persistent session metadata in `sessions.json`
- **Chat History Backup**: Per-session history files in `history/` subdirectory
- **User Identity**: Stable UUID stored in `user.json`
- **Long-term Memory**: PostgreSQL with pgvector for embeddings

## File Naming Conventions

- **TypeScript files**: Use camelCase (e.g., `chatManager.ts`)
- **Component files**: Descriptive names matching functionality (e.g., `sidebar.ts`)
- **Configuration files**: Standard names (e.g., `tsconfig.json`, `package.json`)
- **Build outputs**: Match source structure in `dist/` directory

## Import/Export Patterns

- Use ES6 imports/exports throughout
- Relative imports for local modules
- Absolute imports for node_modules
- Type-only imports when appropriate: `import type { ... }`

## Security Architecture

- **Context Isolation**: Enabled with secure preload bridge
- **Sandboxing**: Renderer process runs in sandbox mode
- **Node Integration**: Disabled in renderer for security
- **CSP**: Content Security Policy defined in `index.html`
- **Sanitization**: All markdown content sanitized with DOMPurify

## Development Workflow

1. **Source files** in `src/` are written in TypeScript
2. **Build process** compiles to `dist/` using esbuild
3. **CSS compilation** processes Tailwind to `dist/styles.css`
4. **Development mode** uses concurrent watchers for hot reload
5. **Production builds** create optimized bundles for distribution