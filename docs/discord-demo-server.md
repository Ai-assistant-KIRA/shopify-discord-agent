# Customer Demo Discord Server

Set up a clean Discord server for showing the Shopify agent to a customer.

## Option A — Automated (recommended)

```bash
npm run discord:demo-setup
```

This will:
1. Log in as your bot
2. Create **Shopify Agent Demo** category + **#store-ops** channel (if bot has Manage Channels)
3. Save the channel ID to `config/.env` as `DISCORD_ALLOWED_CHANNEL_IDS`

If the bot lacks permissions, the script prints a re-invite link and lets you pick an existing channel.

## Option B — Manual server creation

### 1. Create the server (in Discord app)

1. Click **+** in the server list
2. **Create My Own** → **For me and my friends**
3. Name it: **Shopify Agent Demo**

### 2. Invite the bot

Run `npm run discord:demo-setup` — if the bot is not in any server, it prints an invite URL.

Or build the link manually (replace `CLIENT_ID`):

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=68624&scope=bot
```

Required permissions: **View Channels**, **Send Messages**, **Read Message History**, **Manage Channels**.

### 3. Create channels

| Channel | Purpose |
|---------|---------|
| `#store-ops` | Live demo — customer types Shopify questions here |
| `#setup-notes` | Optional — paste your talking points (private to you) |

### 4. Lock the bot to the demo channel

After setup, `config/.env` contains:

```
DISCORD_ALLOWED_CHANNEL_IDS=123456789012345678
```

Only messages in that channel reach the agent.

### 5. Invite the customer

**Server Settings → Invites → Create Invite** → set channel to `#store-ops`, expiry 24h, limit 5 uses.

---

## Demo day checklist

- [ ] `npm run docker:up` — stack running
- [ ] n8n workflow **active**
- [ ] Bot online (check `docker compose logs bridge`)
- [ ] Test message in `#store-ops` before screen share
- [ ] Customer invite link ready

## Suggested demo flow in `#store-ops`

```
What's the stock for [their SKU]?
How much revenue did we make today?
Show unfulfilled orders
List our products
```