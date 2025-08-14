# Turodesk

Aplicação desktop com Electron.

## Como rodar

1. Instale as dependências:

```bash
npm install
```

2. Inicie o app em desenvolvimento:

```bash
npm run start
```

Isto abrirá uma janela com a tela inicial contendo um campo de texto centralizado (sem funcionalidades por enquanto).

## Banco de dados (PostgreSQL via Docker)

Pré-requisitos: Docker e Docker Compose.

1. Configure variáveis (opcional): copie `.env.example` para `.env` e ajuste conforme necessário.
2. Suba o container:

```bash
docker compose up -d
```

3. Verifique o status:

```bash
docker compose ps
```

4. Conexão padrão:

```
Host: localhost
Port: 5432
User: turodesk
Password: turodesk
Database: turodesk
```



