# n8n Workflows

Import one of these JSON files into n8n:

| File | MCP endpoint | Use case |
|------|--------------|----------|
| `discord-shopify-mcp-agent.json` | `http://localhost:3000/sse` | Local n8n + MCP on your machine |
| `discord-shopify-mcp-agent.docker.json` | `http://mcp:3000/sse` | Docker Compose stack |

After import: add Google Vertex credentials, set your GCP project ID, update the MCP URL if using n8n Cloud, then **activate** the workflow.

**Full setup guide:** [docs/n8n-setup.md](../docs/n8n-setup.md) — covers local self-hosted n8n and n8n Cloud.