#!/usr/bin/env node
/**
 * Set up a customer demo Discord server structure.
 * Creates category + #store-ops channel and writes channel ID to config/.env.
 *
 * Usage: npm run discord:demo-setup
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from "discord.js";
import { loadEnv, getConfigEnvPath, configExists } from "../lib/load-env.mjs";

loadEnv();

const token = process.env.DISCORD_BOT_TOKEN?.trim();
if (!token) {
  console.error("DISCORD_BOT_TOKEN missing. Run: npm run setup");
  process.exit(1);
}

const DEMO_CATEGORY = "Shopify Agent Demo";
const DEMO_CHANNEL = "store-ops";

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function upsertConfigEnv(channelId) {
  const configPath = getConfigEnvPath();
  const rootEnv = path.join(path.dirname(configPath), "..", ".env");
  const sourcePath = configExists() ? configPath : fs.existsSync(rootEnv) ? rootEnv : configPath;

  let lines = [];
  if (fs.existsSync(sourcePath)) {
    lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
  } else {
    lines = fs.readFileSync(path.join(path.dirname(configPath), ".env.example"), "utf8").split(/\r?\n/);
  }

  const key = "DISCORD_ALLOWED_CHANNEL_IDS";
  let found = false;
  lines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${channelId}`;
    }
    return line;
  });
  if (!found) lines.push(`${key}=${channelId}`);

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${lines.join("\n")}\n`, { mode: 0o600 });
  console.log(`\nSaved DISCORD_ALLOWED_CHANNEL_IDS=${channelId} to config/.env`);
}

async function ensureDemoStructure(guild) {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error(
      `Bot lacks Manage Channels in "${guild.name}". Re-invite with Manage Channels permission.`
    );
  }

  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === DEMO_CATEGORY
  );

  if (!category) {
    category = await guild.channels.create({
      name: DEMO_CATEGORY,
      type: ChannelType.GuildCategory,
    });
    console.log(`Created category: ${DEMO_CATEGORY}`);
  } else {
    console.log(`Category exists: ${DEMO_CATEGORY}`);
  }

  let channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === DEMO_CHANNEL && c.parentId === category.id
  );

  if (!channel) {
    channel = await guild.channels.create({
      name: DEMO_CHANNEL,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: "Ask the Shopify agent about stock, orders, revenue, and discounts.",
    });
    console.log(`Created channel: #${DEMO_CHANNEL}`);
  } else {
    console.log(`Channel exists: #${DEMO_CHANNEL}`);
  }

  return channel;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", async () => {
  console.log(`\nBot logged in as ${client.user.tag}\n`);

  const guilds = [...client.guilds.cache.values()];
  if (guilds.length === 0) {
    const appId = client.user.id;
    const perms =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.ReadMessageHistory |
      PermissionFlagsBits.ManageChannels;
    const invite = `https://discord.com/oauth2/authorize?client_id=${appId}&permissions=${perms}&scope=bot`;
    console.log("Bot is not in any server yet.\n");
    console.log("1. In Discord: click + → Create My Own → For me and my friends");
    console.log('2. Name it e.g. "Shopify Agent Demo"');
    console.log("3. Open this invite link and add the bot:\n");
    console.log(invite);
    console.log("\n4. Re-run: npm run discord:demo-setup\n");
    client.destroy();
    process.exit(1);
  }

  let guild = guilds[0];
  if (guilds.length > 1) {
    console.log("Servers the bot is in:");
    guilds.forEach((g, i) => console.log(`  [${i + 1}] ${g.name} (${g.id})`));
    const pick = await ask(`\nWhich server to set up? [1-${guilds.length}] (default 1): `);
    const idx = Math.max(0, Math.min(guilds.length - 1, (parseInt(pick, 10) || 1) - 1));
    guild = guilds[idx];
  }

  console.log(`\nSetting up demo in: ${guild.name}\n`);

  try {
    let channel;
    try {
      channel = await ensureDemoStructure(guild);
    } catch (permError) {
      console.warn(`${permError.message}\n`);
      const app = await fetch("https://discord.com/api/v10/oauth2/applications/@me", {
        headers: { Authorization: `Bot ${token}` },
      }).then((r) => r.json());
      const perms =
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ReadMessageHistory |
        PermissionFlagsBits.ManageChannels;
      console.log("Re-invite the bot with Manage Channels, or create a new demo server:\n");
      console.log(
        `https://discord.com/oauth2/authorize?client_id=${app.id}&permissions=${perms}&scope=bot\n`
      );

      const textChannels = [...guild.channels.cache.values()]
        .filter((c) => c.type === ChannelType.GuildText)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (textChannels.length === 0) {
        throw new Error("No text channels available. Create a server and invite the bot first.");
      }

      console.log(`Or use an existing channel in "${guild.name}":`);
      textChannels.forEach((c, i) => console.log(`  [${i + 1}] #${c.name} (${c.id})`));
      const pick = await ask(`\nPick channel for demo [1-${textChannels.length}] (default 1): `);
      const idx = Math.max(0, Math.min(textChannels.length - 1, (parseInt(pick, 10) || 1) - 1));
      channel = textChannels[idx];
      console.log(`Using #${channel.name}`);
    }

    upsertConfigEnv(channel.id);

    console.log("\nDemo server ready!");
    console.log(`  Server:  ${guild.name}`);
    console.log(`  Channel: #${channel.name} (${channel.id})`);
    console.log("\nDemo prompts to try:");
    console.log("  What's the stock for SKU-123?");
    console.log("  How much revenue did we make today?");
    console.log("  Show unfulfilled orders");
    console.log("\nStart the stack: npm run docker:up\n");
  } catch (error) {
    console.error(`Setup failed: ${error.message}`);
    process.exit(1);
  } finally {
    client.destroy();
  }
});

client.login(token).catch((err) => {
  console.error("Discord login failed:", err.message);
  process.exit(1);
});