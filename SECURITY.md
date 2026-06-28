# Security

## Before publishing

If this project was ever committed with hardcoded tokens, **rotate them immediately**:

1. **Discord bot token** — Developer Portal → Bot → Reset Token
2. **Shopify Admin API token** — Regenerate in your custom app settings
3. **n8n API keys** — Revoke and create new keys in n8n Settings

## Secrets policy

- Never commit `.env`
- Use `.env.example` with empty placeholder values only
- Store production secrets in your host's secret manager or n8n credentials UI

## Safe defaults

- `SHOPIFY_MOCK_MODE=true` — no live API calls
- `SHOPIFY_READ_ONLY=true` — write tools hidden from the agent
- `MCP_API_KEY` — optional bearer auth on MCP SSE endpoints

## Reporting

If you find a security issue, open a private issue or contact the maintainer directly. Do not post live tokens in public issues.