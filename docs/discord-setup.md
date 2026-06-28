# Discord Setup

## 1. Create a Discord application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. **New Application** → name it (e.g. "Shopify Agent")
3. Open **Bot** → **Reset Token** → copy the token into `.env` as `DISCORD_BOT_TOKEN`

## 2. Enable intents

Under **Bot → Privileged Gateway Intents**, enable:

- **Message Content Intent** (required to read messages)
- **Server Members Intent** (optional, for member-related features)

## 3. Invite the bot to your server

**OAuth2 → URL Generator**:

- Scopes: `bot`
- Permissions: `Send Messages`, `Read Message History`, `View Channels`

Open the generated URL and add the bot to your test server.

## 4. n8n credential

Only **Google Vertex** is required inside the n8n workflow. Discord replies are sent by `npm run bridge` using `DISCORD_BOT_TOKEN` from `.env` — you do **not** need a Discord credential in n8n.

## 5. Optional channel restriction

Set in `.env`:

```
DISCORD_ALLOWED_CHANNEL_IDS=123456789012345678,987654321098765432
```

Only messages in those channels are forwarded to n8n.

## 6. Start the bridge

```bash
npm run bridge
```

The bridge forwards messages to `N8N_WEBHOOK_URL` (default `http://localhost:5678/webhook/discord`), waits for the workflow to finish (`responseMode: lastNode`), and posts **one** reply in Discord. For **n8n Cloud**, set `N8N_WEBHOOK_URL` to your production webhook URL — see [n8n-setup.md](n8n-setup.md).

Ensure the n8n workflow is **active** and you imported workflow **version 2** (no n8n Discord send nodes).