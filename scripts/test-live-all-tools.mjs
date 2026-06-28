/**
 * Live MCP tool test against real Shopify store (no mock).
 * Usage: SHOPIFY_READ_ONLY=false node scripts/test-live-all-tools.mjs
 */
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const MCP_PORT = Number(process.env.PORT || 3000);
const MCP_HOST = process.env.MCP_TEST_HOST || "localhost";
const TEST_SKU = process.env.TEST_SKU || "BB-TONER-200";
const TEST_PRODUCT_QUERY = process.env.TEST_PRODUCT_QUERY || "Artemisia";

let mcpPath = "/message";
const sseMessages = [];
const results = [];

function record(tool, status, detail) {
  results.push({ tool, status, detail: detail?.slice?.(0, 400) ?? detail });
  const icon = status === "PASS" ? "✓" : status === "SKIP" ? "○" : "✗";
  console.log(`${icon} ${tool}: ${status}${detail ? ` — ${String(detail).slice(0, 120)}` : ""}`);
}

function httpRequest({ method, path, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: MCP_HOST, port: MCP_PORT, path, method, headers: body ? { "Content-Type": "application/json" } : {} },
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

function waitForJsonRpcResponse(id, timeoutMs = 30000) {
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

async function callMcp(method, params, id) {
  const postRes = await httpRequest({
    method: "POST",
    path: mcpPath,
    body: { jsonrpc: "2.0", id, method, params },
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

async function callTool(name, args, id) {
  return callMcp("tools/call", { name, arguments: args }, id);
}

function toolText(parsed) {
  if (parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error));
  const text = parsed.result?.content?.[0]?.text || "";
  if (parsed.result?.isError) throw new Error(text || "tool error");
  return text;
}

function extractConfirmToken(text) {
  const m = text.match(/CONFIRM\s+([A-F0-9]+)/i);
  return m?.[1] ?? null;
}

async function testTool(name, args, { expectConfirm = false, id = name } = {}) {
  try {
    const parsed = await callTool(name, args, id);
    const text = toolText(parsed);
    if (expectConfirm) {
      if (!text.includes("CONFIRMATION REQUIRED")) throw new Error("expected CONFIRMATION REQUIRED");
      record(name, "PASS", "confirm flow");
      return { text, confirmToken: extractConfirmToken(text) };
    }
    if (!text) throw new Error("empty response");
    record(name, "PASS", text.split("\n")[0]);
    return { text };
  } catch (err) {
    record(name, "FAIL", err.message);
    return null;
  }
}

async function connectSse() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${MCP_HOST}:${MCP_PORT}/sse`, (res) => {
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
            /* ignore */
          }
        }
      });
      setTimeout(resolve, 2000);
    });
    req.on("error", reject);
  });
}

async function discoverStoreFacts() {
  const health = await httpRequest({ method: "GET", path: "/health" });
  const h = JSON.parse(health.body);
  if (h.mockMode) throw new Error("MCP is in mock mode — set SHOPIFY_MOCK_MODE=false");
  return h;
}

async function main() {
  console.log("=== Live Shopify MCP Tool Test ===\n");
  await discoverStoreFacts();
  await connectSse();

  const list = await callMcp("tools/list", {}, "list");
  const toolNames = list.result?.tools?.map((t) => t.name) ?? [];
  console.log(`Tools available: ${toolNames.length}\n`);

  // --- Read tools ---
  await testTool("get_inventory_by_sku", { sku: TEST_SKU });
  await testTool("search_products", { query: TEST_PRODUCT_QUERY });
  await testTool("get_daily_orders", {});
  await testTool("get_revenue_summary", {});
  await testTool("get_revenue_by_period", { days: 30 });
  await testTool("list_discount_codes", { limit: 5 });
  await testTool("list_draft_orders", { limit: 5 });
  await testTool("search_orders", { limit: 5 });
  await testTool("get_low_stock_products", { threshold: 50 });
  await testTool("list_inventory_by_location", { limit: 10 });
  await testTool("search_customers", { query: "@" });
  await testTool("get_abandoned_checkouts", { limit: 5 });

  const orders = await testTool("search_orders", { limit: 3 });
  let orderName = null;
  if (orders?.text) {
    const m = orders.text.match(/#(\d+)/);
    orderName = m ? `#${m[1]}` : null;
  }
  if (orderName) {
    await testTool("get_order_by_name", { orderName });
    await testTool("get_fulfillment_status", { orderName });
  } else {
    record("get_order_by_name", "SKIP", "no orders in store");
    record("get_fulfillment_status", "SKIP", "no orders in store");
    record("resend_order_invoice", "SKIP", "no orders in store");
  }

  const inv = await testTool("get_inventory_by_sku", { sku: TEST_SKU });
  let inventoryItemId, locationId;
  if (inv?.text) {
    inventoryItemId = inv.text.match(/inventoryItemId:\s*(.+)/)?.[1]?.trim();
    locationId = inv.text.match(/locationId:\s*(.+)/)?.[1]?.trim();
  }

  await testTool("shopify_graphql_query", {
    query: "{ shop { name currencyCode } }",
  });

  // --- Low-risk writes ---
  const code = `MCPTEST${Date.now().toString().slice(-6)}`;
  const discount = await testTool("create_discount_code", {
    code,
    value: 5,
    valueType: "percentage",
    productQuery: TEST_PRODUCT_QUERY,
    title: `MCP live test ${code}`,
  });

  await testTool("list_discount_codes", { limit: 10 });

  if (discount?.text) {
    const list2 = await callTool("list_discount_codes", { limit: 10 }, "list-after-create");
    const listText = toolText(list2);
    const idMatch = listText.match(new RegExp(`${code}[\\s\\S]*?ID:\\s*(gid://shopify/DiscountCodeNode/\\d+)`, "i"));
    if (idMatch) {
      await testTool("deactivate_discount_code", { discountId: idMatch[1] });
    } else {
      record("deactivate_discount_code", "SKIP", "could not find new discount ID");
    }
  }

  const draft = await testTool("create_draft_order", {
    customerEmail: "mcp-live-test@example.com",
    lineItems: [{ sku: TEST_SKU, quantity: 1 }],
    note: "MCP live test draft — safe to delete",
  });

  let draftOrderId = draft?.text?.match(/ID:\s*(gid:\/\/shopify\/DraftOrder\/\d+)/)?.[1];
  if (draftOrderId) {
    await testTool("send_draft_order_invoice", {
      draftOrderId,
      subject: "MCP live test invoice",
      customMessage: "Test invoice from MCP live test",
    });
  }

  if (orderName) {
    await testTool("resend_order_invoice", { orderName, subject: `Invoice ${orderName}` });
  }

  // --- High-risk: confirm flow + safe reversible execution ---
  if (inventoryItemId && locationId) {
    const pending = await testTool(
      "update_inventory_quantity",
      { inventoryItemId, locationId, availableDelta: 1 },
      { expectConfirm: true }
    );
    if (pending?.confirmToken) {
      await testTool("confirm_pending_write", { confirmToken: pending.confirmToken });
      const pending2 = await testTool(
        "update_inventory_quantity",
        { inventoryItemId, locationId, availableDelta: -1 },
        { expectConfirm: true }
      );
      if (pending2?.confirmToken) {
        await testTool("confirm_pending_write", { confirmToken: pending2.confirmToken });
      }
    }
  } else {
    record("update_inventory_quantity", "SKIP", "missing inventory IDs");
    record("confirm_pending_write", "SKIP", "no inventory test");
  }

  const pricePending = await testTool(
    "set_variant_price",
    { sku: TEST_SKU, price: "39.99" },
    { expectConfirm: true }
  );
  if (pricePending?.confirmToken) {
    record("set_variant_price", "SKIP", "confirm available — skipped price change to avoid altering live price");
    record("confirm_pending_write (price)", "SKIP", "intentionally not executed");
  }

  await testTool(
    "set_product_status",
    { productQuery: TEST_PRODUCT_QUERY, status: "ACTIVE" },
    { expectConfirm: true }
  );

  if (orderName) {
    await testTool("fulfill_order", { orderName, trackingNumber: "MCP-TEST-1Z" }, { expectConfirm: true });
    await testTool("cancel_order", { orderName }, { expectConfirm: true });
    await testTool("create_refund", { orderName }, { expectConfirm: true });
  } else {
    record("fulfill_order", "SKIP", "no orders");
    record("cancel_order", "SKIP", "no orders");
    record("create_refund", "SKIP", "no orders");
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;

  console.log(`\n=== Summary: ${passed} passed, ${failed} failed, ${skipped} skipped ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});