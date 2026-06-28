/**
 * Test order MCP tool handlers directly (no SSE) against seeded orders.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getToolEntry } from "../lib/tool-registry.mjs";
import "../tools/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const ORDER = args.order;
const EMAIL = args.email;
const WRITES = args.writes || "none";

function record(tool, status, detail = "") {
  const icon = status === "PASS" ? "✓" : "✗";
  console.log(`${icon} ${tool}: ${status}${detail ? ` — ${detail.slice(0, 120)}` : ""}`);
}

async function runTool(name, toolArgs) {
  const tool = getToolEntry(name);
  if (!tool?.handler) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(toolArgs);
}

async function testRead(name, toolArgs) {
  try {
    const text = await runTool(name, toolArgs);
    record(name, "PASS", text.split("\n")[0]);
    return text;
  } catch (err) {
    record(name, "FAIL", err.message);
    return null;
  }
}

async function testConfirmWrite(name, toolArgs) {
  try {
    const tool = getToolEntry(name);
    const { createPendingWrite } = await import("../lib/confirm-store.mjs");
    const token = createPendingWrite(name, toolArgs);
    const text = await runTool("confirm_pending_write", { confirmToken: token });
    record(name, "PASS", text.split("\n")[0]);
    return text;
  } catch (err) {
    record(name, "FAIL", err.message);
    return null;
  }
}

console.log(`=== Direct order tool tests: ${ORDER} (${EMAIL}) writes=${WRITES} ===\n`);

await testRead("get_order_by_name", { orderName: ORDER });
await testRead("get_fulfillment_status", { orderName: ORDER });
await testRead("get_customer_orders", { email: EMAIL });
await testRead("search_orders", { orderName: ORDER });
await testRead("search_customers", { query: EMAIL });

try {
  const text = await runTool("resend_order_invoice", { orderName: ORDER, subject: `Invoice ${ORDER}` });
  record("resend_order_invoice", "PASS", text.split("\n")[0]);
} catch (err) {
  record("resend_order_invoice", "FAIL", err.message);
}

if (WRITES === "fulfill") {
  await testConfirmWrite("fulfill_order", { orderName: ORDER, trackingNumber: "MCP-TEST-1Z999" });
} else if (WRITES === "cancel") {
  await testConfirmWrite("cancel_order", { orderName: ORDER, reason: "OTHER", refund: true });
} else if (WRITES === "refund") {
  await testConfirmWrite("create_refund", { orderName: ORDER, note: "MCP test refund" });
}

console.log("\nDone.");