#!/usr/bin/env node
/**
 * Pre-flight checks before production use.
 * Usage: npm run verify:production
 */
import fs from "fs";
import { loadEnv, configExists, getConfigEnvPath } from "../lib/load-env.mjs";

loadEnv();

let errors = 0;
let warnings = 0;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`WARN:  ${msg}`);
  warnings++;
}

function pass(msg) {
  console.log(`OK:    ${msg}`);
}

console.log("\nProduction pre-flight check\n");

if (!configExists()) {
  fail("config/.env missing — run: npm run setup");
} else {
  pass(`config/.env found (${getConfigEnvPath()})`);
}

const mockMode = process.env.SHOPIFY_MOCK_MODE === "true";
const readOnly = process.env.SHOPIFY_READ_ONLY !== "false";
const domain = process.env.SHOPIFY_DOMAIN?.trim();
const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
const cliAuth = process.env.SHOPIFY_CLI_AUTH === "true";
const appExecute = process.env.SHOPIFY_USE_APP_EXECUTE === "true";
const discordToken = process.env.DISCORD_BOT_TOKEN?.trim();
const channelIds = process.env.DISCORD_ALLOWED_CHANNEL_IDS?.trim();
const mcpKey = process.env.MCP_API_KEY?.trim();
const webhookUrl = process.env.N8N_WEBHOOK_URL?.trim() || "";

if (!discordToken) {
  fail("DISCORD_BOT_TOKEN is not set");
} else {
  pass("DISCORD_BOT_TOKEN is set");
}

if (mockMode) {
  warn("SHOPIFY_MOCK_MODE=true — using sample data, not a live store");
} else if (!domain) {
  fail("SHOPIFY_DOMAIN is required for live mode");
} else if (shopifyToken) {
  pass(`Shopify configured: ${domain} (Admin API token)`);
} else if (cliAuth) {
  pass(`Shopify configured: ${domain} (Shopify CLI auth)`);
} else if (appExecute) {
  pass(`Shopify configured: ${domain} (app execute)`);
} else {
  fail("Set SHOPIFY_ACCESS_TOKEN, SHOPIFY_CLI_AUTH=true, or SHOPIFY_USE_APP_EXECUTE=true");
}

if (!channelIds) {
  warn("DISCORD_ALLOWED_CHANNEL_IDS is empty — bot responds in ALL channels");
} else {
  pass(`Discord limited to ${channelIds.split(",").length} channel(s)`);
}

if (readOnly) {
  pass("SHOPIFY_READ_ONLY=true — write tools hidden (recommended for pilot)");
} else {
  warn("SHOPIFY_READ_ONLY=false — write tools enabled; ensure team knows CONFIRM flow");
}

if (!mcpKey) {
  warn("MCP_API_KEY is empty — OK for local Docker; required if MCP is public");
} else {
  pass("MCP_API_KEY is set");
}

if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
  pass("N8N_WEBHOOK_URL points to local n8n (private stack)");
} else if (webhookUrl.startsWith("https://")) {
  pass("N8N_WEBHOOK_URL points to remote n8n");
} else {
  warn(`N8N_WEBHOOK_URL may be misconfigured: ${webhookUrl || "(empty)"}`);
}

try {
  const health = await fetch(`http://localhost:${process.env.PORT || 3000}/health`, {
    signal: AbortSignal.timeout(3000),
  }).then((r) => r.json());
  if (health.status === "ok") {
    pass(`MCP server reachable (mock=${health.mockMode}, tools=${health.tools?.length ?? 0})`);
  } else {
    warn("MCP /health returned unexpected response — is docker up?");
  }
} catch {
  warn("MCP server not reachable at localhost:3000 — run: npm run docker:up");
}

console.log(`\nResult: ${errors} error(s), ${warnings} warning(s)\n`);

if (errors > 0) {
  console.log("Fix errors before production use. See docs/production-checklist.md\n");
  process.exit(1);
}

if (warnings > 0) {
  console.log("Review warnings. See docs/production-checklist.md for hardening steps.\n");
} else {
  console.log("All checks passed. Complete n8n workflow setup if not done yet.\n");
}