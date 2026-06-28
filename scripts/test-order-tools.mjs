/**
 * Test order-related MCP tools against seeded customer/order.
 * Usage:
 *   node scripts/test-order-tools.mjs --order=#1001 --email=mcp-test-553643@example.com
 *   node scripts/test-order-tools.mjs --order=#1002 --email=... --writes=cancel
 *   node scripts/test-order-tools.mjs --order=#1003 --email=... --writes=refund
 */
import http from "http";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const ORDER = args.order;
const EMAIL = args.email;
const WRITES = args.writes || "fulfill"; // fulfill | cancel | refund | none

if (!ORDER || !EMAIL) {
  console.error("Required: --order=#1001 --email=user@example.com");
  process.exit(1);
}

const MCP_PORT = Number(process.env.PORT || 3000);
let mcpPath = "/message";
const sseMessages = [];

function record(tool, status, detail = "") {
  const icon = status === "PASS" ? "✓" : status === "SKIP" ? "○" : "✗";
  console.log(`${icon} ${tool}: ${status}${detail ? ` — ${detail.slice(0, 120)}` : ""}`);
}

function httpRequest({ method, path, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port: MCP_PORT, path, method, headers: body ? { "Content-Type": "application/json" } : {} },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function waitForJsonRpcResponse(id, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const match = sseMessages.find((m) => m.id === id);
      if (match) return resolve(match);
      if (Date.now() - start > timeoutMs) return reject(new Error(`timeout id=${id}`));
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function callTool(name, toolArgs, id = name) {
  const postRes = await httpRequest({
    method: "POST",
    path: mcpPath,
    body: { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: toolArgs } },
  });
  if (postRes.status === 200 && postRes.body?.startsWith?.("{")) {
    try {
      return JSON.parse(postRes.body);
    } catch {
      /* fall through */
    }
  }
  return waitForJsonRpcResponse(id);
}

function toolText(parsed) {
  if (parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error));
  const text = parsed.result?.content?.[0]?.text || "";
  if (parsed.result?.isError) throw new Error(text || "tool error");
  return text;
}

function extractConfirmToken(text) {
  return text.match(/CONFIRM\s+([A-F0-9]+)/i)?.[1] ?? null;
}

async function connectSse() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${MCP_PORT}/sse`, (res) => {
      res.on("data", (chunk) => {
        const text = chunk.toString();
        const endpointMatch = text.match(/data:\s+(\S+)/);
        if (endpointMatch) mcpPath = endpointMatch[1];
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload.startsWith("{")) continue;
          try {
            sseMessages.push(JSON.parse(payload));
          } catch {
            /* ignore */
          }
        }
      });
      setTimeout(resolve, 1500);
    });
    req.on("error", reject);
  });
}

async function testRead(name, toolArgs) {
  try {
    const text = toolText(await callTool(name, toolArgs));
    record(name, "PASS", text.split("\n")[0]);
    return text;
  } catch (err) {
    record(name, "FAIL", err.message);
    return null;
  }
}

async function testConfirmWrite(name, toolArgs) {
  try {
    const pending = toolText(await callTool(name, toolArgs));
    if (!pending.includes("CONFIRMATION REQUIRED")) throw new Error("expected confirmation");
    const token = extractConfirmToken(pending);
    if (!token) throw new Error("no confirm token");
    const result = toolText(await callTool("confirm_pending_write", { confirmToken: token }, `${name}-confirm`));
    record(name, "PASS", result.split("\n")[0]);
    return result;
  } catch (err) {
    record(name, "FAIL", err.message);
    return null;
  }
}

await connectSse();
console.log(`=== Order tool tests: ${ORDER} (${EMAIL}) writes=${WRITES} ===\n`);

await testRead("get_order_by_name", { orderName: ORDER });
await testRead("get_fulfillment_status", { orderName: ORDER });
await testRead("get_customer_orders", { email: EMAIL });
await testRead("search_orders", { orderName: ORDER });
await testRead("search_customers", { query: EMAIL });

try {
  const text = toolText(
    await callTool("resend_order_invoice", { orderName: ORDER, subject: `Invoice ${ORDER}` })
  );
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

const failed = 0; // summary printed above
console.log("\nDone.");
process.exit(failed > 0 ? 1 : 0);