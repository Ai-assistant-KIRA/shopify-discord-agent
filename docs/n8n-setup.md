# n8n Workflow Setup

Import and run the **Discord Shopify MCP Agent** workflow on **local n8n** (self-hosted) or **n8n Cloud**.

## Workflow files

| File | Use when |
|------|----------|
| `n8n-workflows/discord-shopify-mcp-agent.json` | Local n8n + MCP on `localhost:3000` |
| `n8n-workflows/discord-shopify-mcp-agent.docker.json` | Docker Compose stack (`mcp` service at `http://mcp:3000/sse`) |

Both workflows share the same nodes and logic. The only difference is the **Shopify MCP Tool** endpoint URL.

---

## Local n8n (self-hosted)

Best for development on your machine or a VPS you control.

### Prerequisites

- Node.js 20+
- MCP server running (see [docker-setup.md](docker-setup.md) or local dev below)
- Google Cloud project with Vertex AI enabled
- Discord bot token (for the bridge — see [discord-setup.md](discord-setup.md))

### Option A — Docker (recommended)

```bash
cp .env.docker.example .env
# Add DISCORD_BOT_TOKEN (and Shopify creds if not using mock mode)

npm run docker:mock   # or npm run docker:up for live Shopify
```

1. Open **http://localhost:5678** and create your n8n owner account (first visit only).
2. **Workflows → Import from file** → select `n8n-workflows/discord-shopify-mcp-agent.docker.json`.
3. Open the **Google Vertex Chat Model** node:
   - Create or select a **Google Vertex** credential (service account JSON or OAuth).
   - Set **Project ID** to your GCP project (replace the import default).
4. Open the **Shopify MCP Tool** node — confirm endpoint is `http://mcp:3000/sse` (Docker default).
5. **Save** and toggle the workflow **Active**.
6. Message your Discord bot (bridge runs inside Docker).

### Option B — Manual (no Docker)

Run three terminals from the project root:

```bash
# Terminal 1 — MCP server
npm install
cp .env.example .env
npm run mcp:mock          # or npm run mcp for live Shopify

# Terminal 2 — n8n
npx n8n start             # UI at http://localhost:5678

# Terminal 3 — Discord bridge (after workflow is active)
npm run bridge
```

Import `n8n-workflows/discord-shopify-mcp-agent.json` (uses `http://localhost:3000/sse`).

### Import via API (optional)

After n8n is running, create an API key under **Settings → API**:

```bash
# Bash
export N8N_API_KEY=your_key
export WORKFLOW_FILE=discord-shopify-mcp-agent.docker.json   # or .json for local MCP
npm run import:workflow
```

```powershell
# PowerShell
$env:N8N_API_KEY="your_key"
$env:WORKFLOW_FILE="discord-shopify-mcp-agent.docker.json"
npm run import:workflow
```

Then configure Vertex credentials and project ID in the UI, and activate the workflow.

### Local checklist

- [ ] MCP health: `curl http://localhost:3000/health`
- [ ] Workflow imported and **Active**
- [ ] Vertex credential + GCP project ID set in Chat Model node
- [ ] MCP endpoint matches your setup (`localhost:3000` vs `mcp:3000`)
- [ ] Discord bridge running with `DISCORD_BOT_TOKEN` in `.env`

---

## n8n Cloud

Use [n8n Cloud](https://n8n.io/cloud/) when you want a managed instance. n8n Cloud cannot reach `localhost` — the MCP server must be **publicly reachable over HTTPS**.

### Architecture

```
Discord → bridge (your machine or server) → n8n Cloud webhook
                                              ↓
                                    MCP server (public URL)
                                              ↓
                                         Shopify API
```

| Component | Where it runs |
|-----------|---------------|
| n8n workflow | n8n Cloud |
| MCP server | Your VPS, Railway, Fly.io, or tunneled local dev |
| Discord bridge | Same host as MCP, or any machine with outbound HTTPS |

### Step 1 — Host the MCP server publicly

Deploy `shopify-mcp-server.mjs` to a server with a public HTTPS URL, or expose local dev with a tunnel:

```bash
# Example: local MCP + Cloudflare tunnel
npm run mcp:mock
# In another terminal:
cloudflared tunnel --url http://localhost:3000
```

Note the public base URL (e.g. `https://mcp.example.com`). The SSE endpoint will be `https://mcp.example.com/sse`.

Set environment variables on the host:

```
SHOPIFY_DOMAIN=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_...
SHOPIFY_MOCK_MODE=false
SHOPIFY_READ_ONLY=true
PORT=3000
```

Verify: `curl https://mcp.example.com/health`

### Step 2 — Import workflow on n8n Cloud

1. Sign in to your n8n Cloud instance.
2. **Workflows → Import from file** → `n8n-workflows/discord-shopify-mcp-agent.json`.
3. Open **Shopify MCP Tool** → set **Endpoint URL** to your public SSE URL, e.g. `https://mcp.example.com/sse`.
4. Open **Google Vertex Chat Model**:
   - Add **Google Vertex** credentials (service account recommended for cloud).
   - Set your GCP **Project ID**.
5. **Save** and toggle **Active**.
6. Copy the production webhook URL from the **Discord Webhook** node (e.g. `https://your-instance.app.n8n.cloud/webhook/discord`).

### Step 3 — Point the Discord bridge at n8n Cloud

On the machine running the bridge, set in `.env`:

```
DISCORD_BOT_TOKEN=your_bot_token
N8N_WEBHOOK_URL=https://your-instance.app.n8n.cloud/webhook/discord
```

```bash
npm run bridge
```

### n8n Cloud checklist

- [ ] MCP server reachable at public HTTPS `/sse` and `/health`
- [ ] Workflow imported, Vertex configured, **Active**
- [ ] MCP Tool endpoint updated to public URL (not `localhost`)
- [ ] Bridge `N8N_WEBHOOK_URL` set to n8n Cloud production webhook
- [ ] Test message in Discord returns a reply

---

## Post-import configuration (both environments)

### Google Vertex Chat Model node

| Field | Value |
|-------|-------|
| Credential | Google Vertex (OAuth or service account) |
| Project ID | Your GCP project ID |
| Model | `gemini-2.5-flash` (default) |

### Shopify MCP Tool node

| Environment | Endpoint URL |
|-------------|--------------|
| Local manual | `http://localhost:3000/sse` |
| Docker Compose | `http://mcp:3000/sse` |
| n8n Cloud | `https://your-mcp-host/sse` |

### Discord Webhook node

- Path: `discord` (default)
- Method: `POST`
- Response mode: `lastNode` (bridge waits for the agent reply)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Webhook 404 | Workflow must be **Active**. Use the **production** webhook URL on n8n Cloud. |
| MCP connection failed | Check endpoint URL and that `/health` returns OK. Cloud n8n cannot use `localhost`. |
| Vertex auth error | Re-create Google Vertex credential; confirm project ID and Vertex AI API enabled. |
| No Discord reply | Bridge must be running; check `N8N_WEBHOOK_URL` matches your n8n instance. |
| Empty agent output | Check n8n **Executions** log; verify MCP is up and Shopify creds are valid. |

---

## Related guides

- [Docker Compose setup](docker-setup.md)
- [Discord bot setup](discord-setup.md)
- [Shopify credentials](shopify-setup.md)
- [Architecture & tools](architecture.md)