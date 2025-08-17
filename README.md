## Turodesk

Aplicação desktop minimalista construída com Electron, TypeScript e Tailwind CSS, focada em conversas assistidas por IA com memória local. O app oferece:

- Interface de chat com sessões (criar, listar, renomear, apagar)
- Respostas por streaming de tokens
- Memória longa baseada em embeddings armazenada em disco (JSON)
- Integração opcional com OpenAI via LangGraph

### Stack
- Electron (Main/Preload/Renderer)
- TypeScript
- Tailwind CSS (build via `tailwindcss`)
- Bundler: `esbuild`
- LangGraph (`@langchain/langgraph`) com OpenAI (`@langchain/openai`)
- Renderização de Markdown: `marked` + sanitização com `dompurify`

---

## Requisitos
- Node.js 18+ (recomendado 20+)
- npm 9+
- macOS/Windows/Linux
- Docker + Docker Compose (para PostgreSQL e Redis)
- PostgreSQL 15+ (se não usar Docker)

---

## Instalação
```bash
npm install
```

Crie um arquivo `.env` na raiz (copie de `.env.example`):
```env
# OpenAI (obrigatório para IA)
OPENAI_API_KEY=coloque_sua_chave_aqui
OPENAI_MODEL=gpt-4o-mini

# PostgreSQL (obrigatório)
DATABASE_URI=postgresql://turodesk:turodesk@localhost:5432/turodesk
POSTGRES_DB=turodesk
POSTGRES_USER=turodesk
POSTGRES_PASSWORD=turodesk
POSTGRES_PORT=5432
```

**Importante**: PostgreSQL é agora obrigatório para o funcionamento completo do app, pois armazena o histórico de conversas via LangGraph checkpoint.

---

## Scripts

### Desenvolvimento
```bash
# 1. Subir PostgreSQL e Redis
docker compose up -d

# 2. Instalar dependências
npm install

# 3. Criar arquivo .env (copiar de .env.example)
cp .env.example .env

# 4. Iniciar desenvolvimento
npm run dev
```

### Produção
```bash
# 1. Subir serviços
docker compose up -d

# 2. Build da aplicação
npm run build

# 3. Iniciar aplicação
npm start
```

### Scripts disponíveis
- `npm run build`: limpa e gera `dist/` para main, preload, renderer e CSS
- `npm run dev`: modo desenvolvimento com watch e Electron em hot reload
- `npm start`: inicia apenas o Electron com os artefatos já compilados em `dist/`

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

## Arquitetura e fluxo
- `src/main.ts` cria a janela, configura `preload.js` com `contextIsolation: true` e registra IPC.
- `src/preload.ts` expõe, via `contextBridge`, a API `window.turodesk.chats` (list/create/delete/rename/messages/send/sendStream) sem habilitar `nodeIntegration` no renderer.
- `src/backend/ipc.ts` recebe as chamadas do renderer e delega para `ChatManager`.
- `src/backend/chat/manager.ts`:
  - Gerencia sessões (arquivo `sessions.json` em `userData/turodesk/`)
  - **Histórico persistente via PostgreSQL**: usando `PostgresSaver` do LangGraph para checkpoint
  - **Fallback local**: arquivos JSON como backup quando PostgreSQL não está disponível
  - Memória longa: embeddings via OpenAI (`text-embedding-3-small`) armazenados no PostgreSQL
  - Geração de respostas com LangGraph (`StateGraph` + `ChatPromptTemplate`)
  - Streaming real de tokens quando `OPENAI_API_KEY` está definido

### Persistência de dados:
1. **Primário**: PostgreSQL via LangGraph checkpoint (histórico de conversas)
2. **Secundário**: Arquivos JSON locais (sessões e backup)
3. **Memória longa**: PostgreSQL com pgvector (embeddings)

---

## Estilos (Tailwind)
- Entrada: `src/styles/tailwind.css`
- Saída: `dist/styles.css` via `npm run build:css` (parte do `npm run build`)
- `tailwind.config.js` inclui `@tailwindcss/typography` e escaneia `index.html` e `src/**/*.{ts,tsx,js,jsx,html}`

---

## Segurança
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- `preload.ts` expõe API mínima e tipada para o renderer
- CSP no `index.html`
- Conteúdo markdown sanitizado com `dompurify`

---

## Variáveis de ambiente
- `OPENAI_API_KEY`: chave da OpenAI (opcional, mas necessária para respostas inteligentes)
- `OPENAI_MODEL`: modelo (opcional, padrão `gpt-4o-mini`)
- (Docker) `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` (apenas para o serviço opcional)

Exemplo `.env`:
```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
POSTGRES_PORT=5432
```

---

## Banco de dados (obrigatório)
O `docker-compose.yml` provisiona PostgreSQL e Redis necessários para o funcionamento do app.

### Subir os serviços:
```bash
docker compose up -d
```

### Credenciais padrão:
```
Host: localhost
Port: 5432
User: turodesk
Password: turodesk
Database: turodesk
```

### Personalizar porta (se necessário):
```bash
POSTGRES_PORT=5433 docker compose up -d
```

### Verificar status:
```bash
docker compose ps
```

---

## Dicas de uso
- Crie uma conversa e envie mensagens. Com `OPENAI_API_KEY` configurada, você verá tokens chegando em tempo real.
- Pesquise e gerencie sessões na barra lateral (renomear/apagar).
- Blocos de código nas respostas têm botão de copiar.

---

## Troubleshooting
- **Tela em branco**: rode `npm run build` antes de `npm start` (ou use `npm run dev`).
- **Sem respostas de IA**: verifique `.env` e conectividade de rede.
- **Estilos não aplicados**: cheque se `dist/styles.css` foi gerado (`npm run build:css`).
- **Erro de conexão PostgreSQL**: 
  - Verifique se o Docker está rodando: `docker compose ps`
  - Verifique se a `DATABASE_URI` no `.env` está correta
  - Reinicie os serviços: `docker compose restart`
- **Histórico perdido**: o app faz fallback para arquivos JSON locais se PostgreSQL falhar.

---

## Licença
MIT

