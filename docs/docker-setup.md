# Docker Setup

Run the full stack — **n8n**, **Shopify MCP server**, and **Discord bridge** — with one command.

## Architecture

```
Discord → bridge (container) → n8n (container) → mcp (container) → Shopify API
                ↑                      ↑
         host .env creds        import docker workflow
```

| Service | Port | Role |
|---------|------|------|
| `n8n` | 5678 | Workflow UI + webhook |
| `mcp` | 3000 | Shopify MCP tools (SSE) |
| `bridge` | — | Discord message intake |

Inside Docker, n8n reaches MCP at `http://mcp:3000/sse`. The bridge reaches n8n at `http://n8n:5678/webhook/discord`.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- Discord bot token
- Google Vertex credentials configured in n8n (after first import)

## Quick start (one-time credentials)

```bash
cd shopify-discord-agent
npm install
npm run setup          # saves Shopify + Discord → config/.env (once)
docker compose up -d --build
```

Credentials in `config/.env` persist across restarts. Services use `restart: unless-stopped`.

## Quick start (mock demo)

No Shopify credentials required.

```bash
npm run setup          # choose mock mode when prompted
docker compose -f docker-compose.yml -f docker-compose.mock.yml up -d --build
```

1. Open **http://localhost:5678** and create an n8n owner account (first launch only).
2. Import **`n8n-workflows/discord-shopify-mcp-agent.docker.json`** (uses `http://mcp:3000/sse`).
3. Add **Google Vertex** credential in the workflow (Discord replies use the `bridge` container + `DISCORD_BOT_TOKEN`).
4. Set your GCP project ID in the Vertex Chat Model node.
5. **Activate** the workflow.
6. Message your bot in Discord.

Full n8n instructions (local + cloud): [n8n-setup.md](n8n-setup.md)

Verify MCP: **http://localhost:3000/health**

## Live Shopify store

Run `npm run setup` with your store domain and `shpat_` token, then:

```bash
docker compose up -d --build
```

To enable write tools, edit `config/.env`: set `SHOPIFY_READ_ONLY=false`, then `docker compose restart mcp`.

Import the same **`.docker.json`** workflow file. See [shopify-setup.md](shopify-setup.md) for API scopes.

## Commands

```bash
# Start stack
docker compose up -d --build

# Mock demo overlay
docker compose -f docker-compose.yml -f docker-compose.mock.yml up -d --build

# View logs
docker compose logs -f bridge
docker compose logs -f mcp
docker compose logs -f n8n

# Stop
docker compose down

# Stop and remove n8n data volume
docker compose down -v
```

npm shortcuts (from project root):

```bash
npm run docker:up
npm run docker:mock
npm run docker:down
npm run docker:logs
```

## Workflow import via API (optional)

After n8n is running and you have an API key:

```bash
# Use the Docker workflow (mcp service hostname)
set WORKFLOW_FILE=discord-shopify-mcp-agent.docker.json
npm run import:workflow
```

On PowerShell:

```powershell
$env:WORKFLOW_FILE="discord-shopify-mcp-agent.docker.json"
npm run import:workflow
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Bridge can't reach n8n | `docker compose ps` — n8n must be healthy. Check `docker compose logs n8n`. |
| MCP tool errors in n8n | Workflow must use **`discord-shopify-mcp-agent.docker.json`** (`http://mcp:3000/sse`), not the localhost variant. |
| No Discord reply | Workflow must be **active**. Check `docker compose logs bridge`. |
| MCP unhealthy | `curl http://localhost:3000/health` — check Shopify creds or use mock overlay. |
| Port 5678 in use | Set `N8N_PORT=5679` in `.env` and update `N8N_WEBHOOK_URL`. |

## Volumes

n8n data persists in the `n8n_data` Docker volume (workflows, credentials, executions). Remove with `docker compose down -v` only if you want a clean slate.