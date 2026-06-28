import { Client, GatewayIntentBits } from "discord.js";
import { loadEnv } from "../lib/load-env.mjs";

loadEnv();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/discord";
const ALLOWED_CHANNELS = (process.env.DISCORD_ALLOWED_CHANNEL_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const FALLBACK_REPLY =
  "Sorry, I couldn't get a reply from the workflow. Check that n8n is running, the workflow is **active**, MCP is healthy (`curl localhost:3000/health`), and re-import the latest workflow JSON.";

if (!DISCORD_BOT_TOKEN) {
  console.error("DISCORD_BOT_TOKEN is required. Copy .env.example to .env and add your bot token.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

function log(level, message, meta = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta }));
}

function extractAgentOutput(body) {
  if (!body) return null;

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return null;
    try {
      return extractAgentOutput(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }

  if (body.output) return String(body.output).trim() || null;
  if (body.json?.output) return String(body.json.output).trim() || null;

  if (Array.isArray(body)) {
    for (const item of body) {
      const text = extractAgentOutput(item?.json ?? item);
      if (text) return text;
    }
  }

  if (body.data?.output) return String(body.data.output).trim() || null;
  if (body.error?.message) return `Sorry, workflow error: ${body.error.message}`;

  return null;
}

async function replyToChannel(channel, text) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 1900));
    remaining = remaining.slice(1900);
  }
  for (const chunk of chunks) {
    await channel.send(chunk);
  }
}

async function forwardToN8n(message) {
  const payload = {
    content: message.content,
    channel_id: message.channel.id,
    user_id: message.author.id,
    username: message.author.username,
  };

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000),
    });

    const raw = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }

    if (!response.ok) {
      log("warn", "n8n webhook returned non-OK status", {
        status: response.status,
        body: raw.slice(0, 300),
      });
      return { ok: false, output: null };
    }

    const output = extractAgentOutput(parsed);
    log("info", "n8n workflow completed", {
      user: message.author.username,
      hasOutput: Boolean(output),
    });
    return { ok: true, output };
  } catch (error) {
    log("error", "Failed to reach n8n webhook", { error: error.message });
    return { ok: false, output: null };
  }
}

client.once("ready", () => {
  log("info", "Discord bridge online", {
    user: client.user.tag,
    webhook: N8N_WEBHOOK_URL,
    replyPath: "bridge-only (workflow returns JSON; n8n does not post to Discord)",
    allowedChannels: ALLOWED_CHANNELS.length ? ALLOWED_CHANNELS : "all",
  });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (ALLOWED_CHANNELS.length && !ALLOWED_CHANNELS.includes(message.channel.id)) {
    return;
  }

  log("info", "Message received", { user: message.author.username, channel: message.channel.id });

  try {
    await message.channel.sendTyping();
  } catch {
    // typing indicator is best-effort
  }

  const result = await forwardToN8n(message);
  const reply = result.output || (result.ok ? FALLBACK_REPLY : null);

  if (!reply) {
    await replyToChannel(
      message.channel,
      "I couldn't reach the n8n workflow. Check that n8n is running, the workflow is **active**, and the webhook path is `discord`."
    );
    return;
  }

  await replyToChannel(message.channel, reply);
});

client.login(DISCORD_BOT_TOKEN).catch((err) => {
  log("error", "Discord login failed", { error: err.message });
  process.exit(1);
});