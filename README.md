## Turodesk

Minimalist desktop application built with Electron, TypeScript and Tailwind CSS, focused on AI-assisted conversations with local memory. The app offers:

- Chat interface with sessions (create, list, rename, delete)
- Token streaming responses
- Long-term memory based on embeddings stored on disk (JSON)
- Optional OpenAI integration via LangGraph

### Stack
- Electron (Main/Preload/Renderer)
- TypeScript
- Tailwind CSS (build via `tailwindcss`)
- Bundler: `esbuild`
- LangGraph (`@langchain/langgraph`) with OpenAI (`@langchain/openai`)
- Markdown rendering: `marked` + sanitization with `dompurify`

---

## Requirements
- Node.js 18+ (recommended 20+)
- npm 9+
- macOS/Windows/Linux
- Docker + Docker Compose (for PostgreSQL and Redis)
- PostgreSQL 15+ (if not using Docker)

---

## Installation
```bash
npm install
```

Create a `.env` file in the root (copy from `.env.example`):
```env
# OpenAI (required for AI)
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gpt-4o-mini

# PostgreSQL (required)
DATABASE_URI=postgresql://turodesk:turodesk@localhost:5432/turodesk
POSTGRES_DB=turodesk
POSTGRES_USER=turodesk
POSTGRES_PASSWORD=turodesk
POSTGRES_PORT=5432
```

**Important**: PostgreSQL is now mandatory for the complete functioning of the app, as it stores conversation history via LangGraph checkpoint.

---

## Scripts

### Development
```bash
# 1. Start PostgreSQL and Redis
docker compose up -d

# 2. Install dependencies
npm install

# 3. Create .env file (copy from .env.example)
cp .env.example .env

# 4. Start development
npm run dev
```

### Production
```bash
# 1. Start services
docker compose up -d

# 2. Build application
npm run build

# 3. Start application
npm start
```

### Available scripts
- `npm run build`: clean and generate `dist/` for main, preload, renderer and CSS
- `npm run dev`: development mode with watch and Electron hot reload
- `npm start`: start only Electron with artifacts already compiled in `dist/`

---

## Estrutura do projeto
```
turodesk/
├─ index.html                 # HTML raiz (inclui CSP e carrega dist/renderer.js e dist/styles.css)
├─ src/
│  ├─ main.ts                 # Processo principal do Electron (janela, tema, IPC)
│  ├─ preload.ts              # Bridge segura (contextIsolation) expondo API em window.turodesk
│  ├─ renderer.ts             # UI do chat (Tailwind, streaming, markdown, cópia de código)
│  └─ backend/
│     ├─ ipc.ts               # Registra handlers IPC (list/create/delete/rename/send/sendStream)
│     ├─ chat/
│     │  ├─ manager.ts        # ChatManager (LangGraph + OpenAI, memória longa, histórico em disco)
│     │  └─ types.ts          # Tipos de Chat
│     └─ store/
│        └─ embeddingStore.ts # Armazena embeddings em JSON com busca por similaridade (coseno)
├─ scripts/db/init/01-init.sql # Scripts de inicialização do Postgres (opcional)
├─ docker-compose.yml          # Serviço Postgres opcional
├─ tailwind.config.js          # Configuração do Tailwind (inclui plugin typography)
├─ postcss.config.js           # PostCSS (Tailwind + Autoprefixer)
├─ tsconfig.json               # TS config (noEmit, Bundler resolution)
└─ package.json                # Scripts e dependências
```

---

## Architecture and flow
- `src/main.ts` creates the window, configures `preload.js` with `contextIsolation: true` and registers IPC.
- `src/preload.ts` exposes, via `contextBridge`, the API `window.turodesk.chats` (list/create/delete/rename/messages/send/sendStream) without enabling `nodeIntegration` in the renderer.
- `src/backend/ipc.ts` receives calls from the renderer and delegates to `ChatManager`.
- `src/backend/chat/manager.ts`:
  - Manages sessions (`sessions.json` file in `userData/turodesk/`)
  - **Persistent history via PostgreSQL**: using LangGraph's `PostgresSaver` for checkpoint
  - **Local fallback**: JSON files as backup when PostgreSQL is not available
  - Long-term memory: embeddings via OpenAI (`text-embedding-3-small`) stored in PostgreSQL
  - Response generation with LangGraph (`StateGraph` + `ChatPromptTemplate`)
  - Real token streaming when `OPENAI_API_KEY` is defined

### Data persistence:
1. **Primary**: PostgreSQL via LangGraph checkpoint (conversation history)
2. **Secondary**: Local JSON files (sessions and backup)
3. **Long-term memory**: PostgreSQL with pgvector (embeddings)

---

## Styles (Tailwind)
- Input: `src/styles/tailwind.css`
- Output: `dist/styles.css` via `npm run build:css` (part of `npm run build`)
- `tailwind.config.js` includes `@tailwindcss/typography` and scans `index.html` and `src/**/*.{ts,tsx,js,jsx,html}`

---

## Security
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- `preload.ts` exposes minimal and typed API to the renderer
- CSP in `index.html`
- Markdown content sanitized with `dompurify`

---

## Environment variables
- `OPENAI_API_KEY`: OpenAI key (optional, but necessary for intelligent responses)
- `OPENAI_MODEL`: model (optional, default `gpt-4o-mini`)
- (Docker) `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` (only for the optional service)

Example `.env`:
```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
POSTGRES_PORT=5432
```

---

## Database (required)
The `docker-compose.yml` provisions PostgreSQL and Redis necessary for the app to function.

### Start services:
```bash
docker compose up -d
```

### Default credentials:
```
Host: localhost
Port: 5432
User: turodesk
Password: turodesk
Database: turodesk
```

### Customize port (if necessary):
```bash
POSTGRES_PORT=5433 docker compose up -d
```

### Check status:
```bash
docker compose ps
```

---

## Usage tips
- Create a conversation and send messages. With `OPENAI_API_KEY` configured, you'll see tokens arriving in real time.
- Search and manage sessions in the sidebar (rename/delete).
- Code blocks in responses have a copy button.

---

## Troubleshooting
- **Blank screen**: run `npm run build` before `npm start` (or use `npm run dev`).
- **No AI responses**: check `.env` and network connectivity.
- **Styles not applied**: check if `dist/styles.css` was generated (`npm run build:css`).
- **PostgreSQL connection error**: 
  - Check if Docker is running: `docker compose ps`
  - Check if `DATABASE_URI` in `.env` is correct
  - Restart services: `docker compose restart`
- **Lost history**: the app falls back to local JSON files if PostgreSQL fails.

---

## License
MIT

