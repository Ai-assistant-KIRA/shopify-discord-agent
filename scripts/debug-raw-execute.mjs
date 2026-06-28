import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const domain = process.env.SHOPIFY_DOMAIN;
const appDir = process.env.SHOPIFY_APP_DIR;
const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-01";

const mutation = `
  mutation orderCancel($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean, $notifyCustomer: Boolean) {
    orderCancel(orderId: $orderId, reason: $reason, refund: $refund, notifyCustomer: $notifyCustomer) {
      job { id done }
      orderCancelUserErrors { field message }
    }
  }
`;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shopify-mcp-"));
const queryFile = path.join(tmpDir, "query.graphql");
const varFile = path.join(tmpDir, "vars.json");
fs.writeFileSync(queryFile, mutation.trim(), "utf8");
fs.writeFileSync(
  varFile,
  JSON.stringify({
    orderId: "gid://shopify/Order/7863733387454",
    reason: "OTHER",
    refund: true,
    notifyCustomer: false,
  }),
  "utf8"
);

const result = spawnSync(
  "shopify",
  ["app", "execute", "--store", domain, "--query-file", queryFile, "--version", apiVersion, "--variable-file", varFile],
  { cwd: appDir, encoding: "utf8", timeout: 120000, shell: process.platform === "win32" }
);

console.log("STATUS:", result.status);
console.log("--- STDOUT ---");
console.log(result.stdout);
console.log("--- STDERR ---");
console.log(result.stderr);