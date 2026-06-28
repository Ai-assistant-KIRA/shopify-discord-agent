import { spawn } from "child_process";
import http from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const TEST_PORT = 3001;

const READ_TOOLS = [
  "get_inventory_by_sku",
  "search_products",
  "get_daily_orders",
  "get_revenue_summary",
  "get_order_by_name",
  "list_discount_codes",
  "list_draft_orders",
  "confirm_pending_write",
  "shopify_graphql_query",
  "search_orders",
  "get_fulfillment_status",
  "get_low_stock_products",
  "list_inventory_by_location",
  "search_customers",
  "get_customer_orders",
  "get_revenue_by_period",
  "get_abandoned_checkouts",
];

let failed = false;
let mcpPath = "/message";
const sseMessages = [];

function fail(message) {
  failed = true;
  console.error(`FAIL: ${message}`);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function httpRequest({ method, path, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: TEST_PORT,
        path,
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function waitForJsonRpcResponse(id, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const match = sseMessages.find((msg) => msg.id === id);
      if (match) return resolve(match);
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Timed out waiting for JSON-RPC response id=${id}`));
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function callMcp(method, params, id) {
  const postRes = await httpRequest({
    method: "POST",
    path: mcpPath,
    body: { jsonrpc: "2.0", id, method, params },
  });

  if (postRes.status === 200 && postRes.body) {
    try {
      return JSON.parse(postRes.body);
    } catch {
      // fall through to SSE wait
    }
  }

  if (postRes.status === 202 || postRes.status === 200) {
    return waitForJsonRpcResponse(id);
  }

  throw new Error(`Unexpected status ${postRes.status}: ${postRes.body}`);
}

async function runSuite({ readOnly, label }) {
  const serverProc = spawn("node", ["shopify-mcp-server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      SHOPIFY_MOCK_MODE: "true",
      SHOPIFY_READ_ONLY: readOnly ? "true" : "false",
    },
  });

  serverProc.stderr.on("data", (data) => process.stderr.write(data));
  await new Promise((r) => setTimeout(r, 2000));

  let sseReq;
  sseMessages.length = 0;
  mcpPath = "/message";

  try {
    const health = await httpRequest({ method: "GET", path: "/health" });
    if (health.status !== 200) fail(`[${label}] /health returned ${health.status}`);
    else {
      const json = JSON.parse(health.body);
      if (json.status !== "ok" || !json.mockMode) fail(`[${label}] /health payload invalid`);
      else pass(`[${label}] /health endpoint (${json.tools.length} tools)`);
    }

    sseReq = http.get(`http://localhost:${TEST_PORT}/sse`, (res) => {
      res.on("data", (chunk) => {
        const text = chunk.toString();
        const endpointMatch = text.match(/data:\s+(\/message\S+)/);
        if (endpointMatch) mcpPath = endpointMatch[1];

        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload.startsWith("{")) continue;
          try {
            sseMessages.push(JSON.parse(payload));
          } catch {
            // ignore
          }
        }
      });
    });
    sseReq.on("error", (err) => fail(`[${label}] SSE connection: ${err.message}`));

    await new Promise((r) => setTimeout(r, 2500));

    const listParsed = await callMcp("tools/list", {}, `list-tools-${label}`);
    const names = listParsed.result?.tools?.map((t) => t.name) || [];

    for (const tool of READ_TOOLS) {
      if (!names.includes(tool)) fail(`[${label}] missing tool: ${tool}`);
    }

    if (readOnly) {
      if (names.includes("create_discount_code")) {
        fail(`[${label}] write tool should be hidden in read-only mode`);
      }
    } else {
      const writeTools = [
        "create_discount_code",
        "create_draft_order",
        "resend_order_invoice",
        "fulfill_order",
        "cancel_order",
        "create_refund",
        "set_variant_price",
        "set_product_status",
        "update_inventory_quantity",
      ];
      for (const tool of writeTools) {
        if (!names.includes(tool)) fail(`[${label}] missing write tool: ${tool}`);
      }
    }

    if (!failed) pass(`[${label}] tools/list exposes ${names.length} tools`);

    const readCalls = [
      ["get_inventory_by_sku", { sku: "SKU-999" }, `call-inventory-${label}`],
      ["get_revenue_summary", {}, `call-revenue-${label}`],
      ["get_daily_orders", {}, `call-orders-${label}`],
      ["get_order_by_name", { orderName: "#1001" }, `call-order-name-${label}`],
      ["search_products", { query: "cotton" }, `call-search-${label}`],
      ["list_discount_codes", {}, `call-discounts-${label}`],
      ["list_draft_orders", {}, `call-drafts-${label}`],
      ["search_orders", { sinceDate: "2020-01-01" }, `call-search-orders-${label}`],
      ["get_fulfillment_status", { orderName: "#1001" }, `call-fulfillment-${label}`],
      ["get_low_stock_products", { threshold: 10 }, `call-lowstock-${label}`],
      ["list_inventory_by_location", {}, `call-loc-inv-${label}`],
      ["search_customers", { query: "customer@example.com" }, `call-customers-${label}`],
      ["get_customer_orders", { email: "customer@example.com" }, `call-cust-orders-${label}`],
      ["get_revenue_by_period", { days: 7 }, `call-revenue-period-${label}`],
      ["get_abandoned_checkouts", {}, `call-abandoned-${label}`],
    ];

    for (const [tool, args, id] of readCalls) {
      const parsed = await callMcp("tools/call", { name: tool, arguments: args }, id);
      const text = parsed.result?.content?.[0]?.text || "";
      if (!text) fail(`[${label}] ${tool} returned empty content`);
      else pass(`[${label}] ${tool} returned data`);
    }

    if (!readOnly) {
      const discountParsed = await callMcp(
        "tools/call",
        {
          name: "create_discount_code",
          arguments: { code: "TEST15", value: 15, valueType: "percentage", productQuery: "cotton" },
        },
        `call-discount-create-${label}`
      );
      if (!discountParsed.result?.content?.[0]?.text?.includes("Discount created")) {
        fail(`[${label}] create_discount_code failed`);
      } else pass(`[${label}] create_discount_code returned data`);

      const draftParsed = await callMcp(
        "tools/call",
        {
          name: "create_draft_order",
          arguments: {
            customerEmail: "test@example.com",
            lineItems: [{ sku: "SKU-123", quantity: 2 }],
          },
        },
        `call-draft-create-${label}`
      );
      if (!draftParsed.result?.content?.[0]?.text?.includes("Draft order created")) {
        fail(`[${label}] create_draft_order failed`);
      } else pass(`[${label}] create_draft_order returned data`);

      for (const [tool, args, expectConfirm] of [
        ["update_inventory_quantity", { inventoryItemId: "gid://shopify/InventoryItem/4567890", locationId: "gid://shopify/Location/123456", availableDelta: 5 }, true],
        ["fulfill_order", { orderName: "#1001", trackingNumber: "1Z999" }, true],
        ["cancel_order", { orderName: "#1001" }, true],
        ["set_variant_price", { sku: "SKU-123", price: "24.99" }, true],
      ]) {
        const parsed = await callMcp("tools/call", { name: tool, arguments: args }, `call-${tool}-${label}`);
        const text = parsed.result?.content?.[0]?.text || "";
        if (expectConfirm && !text.includes("CONFIRMATION REQUIRED")) {
          fail(`[${label}] ${tool} should require confirmation`);
        } else if (expectConfirm) {
          pass(`[${label}] ${tool} requires CONFIRM`);
        }
      }
    }
  } catch (err) {
    fail(`[${label}] ${err.message}`);
  } finally {
    serverProc.kill();
    sseReq?.destroy?.();
    await new Promise((r) => setTimeout(r, 1500));
  }
}

await runSuite({ readOnly: true, label: "read-only" });
await runSuite({ readOnly: false, label: "write-mode" });

if (failed) {
  console.error("\nTests failed.");
  process.exit(1);
}

console.log("\nAll tests passed.");
process.exit(0);