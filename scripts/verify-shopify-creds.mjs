import dotenv from "dotenv";
import { resolveCliAccessToken } from "../lib/cli-auth.mjs";

dotenv.config();

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN?.trim();
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";

const SHOPIFY_ACCESS_TOKEN =
  process.env.SHOPIFY_ACCESS_TOKEN?.trim() ||
  (process.env.SHOPIFY_CLI_AUTH === "true" ? resolveCliAccessToken() : "");

if (!SHOPIFY_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.error("SHOPIFY_DOMAIN and a Shopify access token are required in .env");
  console.error("Use SHOPIFY_ACCESS_TOKEN=shpat_... or SHOPIFY_CLI_AUTH=true after `shopify login`");
  process.exit(1);
}

if (!SHOPIFY_ACCESS_TOKEN.startsWith("shpat_") && !SHOPIFY_ACCESS_TOKEN.startsWith("atkn_")) {
  console.warn("Warning: token is not shpat_ (custom app) or atkn_ (Shopify CLI). It may not work.");
}

const query = `
  query {
    shop {
      name
      email
      myshopifyDomain
      currencyCode
    }
  }
`;

const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

try {
  const headers = { "Content-Type": "application/json" };
  if (SHOPIFY_ACCESS_TOKEN.startsWith("shpat_")) {
    headers["X-Shopify-Access-Token"] = SHOPIFY_ACCESS_TOKEN;
  } else {
    headers.Authorization = `Bearer ${SHOPIFY_ACCESS_TOKEN}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(JSON.stringify(data.errors));
  }

  console.log("Shopify credentials are valid:");
  console.log(JSON.stringify(data.data.shop, null, 2));
} catch (error) {
  console.error("Failed to connect to Shopify:", error.message);
  process.exit(1);
}