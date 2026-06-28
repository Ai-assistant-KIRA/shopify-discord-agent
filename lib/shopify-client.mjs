import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { log } from "./logger.mjs";
import { getMockData } from "./mock-data.mjs";
import { resolveCliAccessToken } from "./cli-auth.mjs";
import { shopifyGraphQLViaAppExecute } from "./app-execute.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function resolveShopifyAccessToken() {
  const envToken = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (envToken) return envToken;
  if (process.env.SHOPIFY_CLI_AUTH === "true") return resolveCliAccessToken();
  return "";
}

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN?.trim();
const SHOPIFY_ACCESS_TOKEN = resolveShopifyAccessToken();
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const USE_APP_EXECUTE = process.env.SHOPIFY_USE_APP_EXECUTE === "true";
const SHOPIFY_APP_DIR =
  process.env.SHOPIFY_APP_DIR?.trim() ||
  path.resolve(__dirname, "..", "..", "beauty-portfolio", "shopify-app", "baltic-bloom-admin");

export const useMockMode =
  process.env.SHOPIFY_MOCK_MODE === "true" ||
  !SHOPIFY_DOMAIN ||
  (!SHOPIFY_ACCESS_TOKEN && !USE_APP_EXECUTE);

export const shopConfig = {
  domain: SHOPIFY_DOMAIN,
  apiVersion: API_VERSION,
  accessToken: SHOPIFY_ACCESS_TOKEN,
};

let shopCurrencyCache = "USD";

function shopifyAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (SHOPIFY_ACCESS_TOKEN.startsWith("shpat_")) {
    headers["X-Shopify-Access-Token"] = SHOPIFY_ACCESS_TOKEN;
  } else {
    headers.Authorization = `Bearer ${SHOPIFY_ACCESS_TOKEN}`;
  }
  return headers;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function shopifyGraphQL(query, variables = {}, attempt = 0) {
  if (useMockMode) return getMockData(query, variables);

  if (USE_APP_EXECUTE) {
    return shopifyGraphQLViaAppExecute(SHOPIFY_DOMAIN, SHOPIFY_APP_DIR, query, variables, API_VERSION);
  }

  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: shopifyAuthHeaders(),
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 429 && attempt < 3) {
    await sleep(1000 * (attempt + 1));
    return shopifyGraphQL(query, variables, attempt + 1);
  }

  if (response.status === 429) {
    throw new Error("Shopify rate limit hit (429). Retry in a few seconds.");
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`Shopify API Error: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

export async function getShopCurrency() {
  if (useMockMode) return "USD";
  if (shopCurrencyCache !== "USD" || !SHOPIFY_DOMAIN) return shopCurrencyCache;

  const data = await shopifyGraphQL(`query { shop { currencyCode } }`);
  shopCurrencyCache = data?.shop?.currencyCode || "USD";
  return shopCurrencyCache;
}

if (useMockMode) {
  log("warn", "Running in mock mode", {
    reason: process.env.SHOPIFY_MOCK_MODE === "true" ? "SHOPIFY_MOCK_MODE" : "missing_credentials",
  });
} else {
  log("info", "Shopify credentials loaded", {
    domain: SHOPIFY_DOMAIN,
    authMode: USE_APP_EXECUTE
      ? "app_execute"
      : SHOPIFY_ACCESS_TOKEN.startsWith("shpat_")
        ? "admin_token"
        : "bearer",
    cliAuth: process.env.SHOPIFY_CLI_AUTH === "true",
    appDir: USE_APP_EXECUTE ? SHOPIFY_APP_DIR : undefined,
  });
}