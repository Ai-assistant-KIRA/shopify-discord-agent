import { registerTool } from "../lib/tool-registry.mjs";
import { shopifyGraphQL } from "../lib/shopify-client.mjs";
import { fetchOrderByName, formatOrderSummary, searchOrders } from "../lib/order-helpers.mjs";

registerTool({
  name: "search_orders",
  description:
    "Search orders by date, status, customer email, or order name. Supports pagination via cursor.",
  inputSchema: {
    type: "object",
    properties: {
      customerEmail: { type: "string", description: "Filter by customer email" },
      financialStatus: {
        type: "string",
        description: "e.g. paid, pending, refunded",
      },
      fulfillmentStatus: {
        type: "string",
        description: "e.g. unfulfilled, fulfilled, partial",
      },
      sinceDate: { type: "string", description: "ISO date YYYY-MM-DD" },
      orderName: { type: "string", description: "Exact order name e.g. '#1001'" },
      limit: { type: "integer", description: "Max results (default 20)" },
      cursor: { type: "string", description: "Pagination cursor from previous search" },
    },
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const parts = [];
    if (args.orderName) parts.push(`name:${args.orderName}`);
    if (args.customerEmail) parts.push(`email:${args.customerEmail}`);
    if (args.financialStatus) parts.push(`financial_status:${args.financialStatus}`);
    if (args.fulfillmentStatus) parts.push(`fulfillment_status:${args.fulfillmentStatus}`);
    if (args.sinceDate) parts.push(`created_at:>=${args.sinceDate}`);

    const result = await searchOrders({
      queryParts: parts,
      limit: args.limit || 20,
      cursor: args.cursor,
    });
    const orders = result?.edges?.map((e) => e.node) ?? [];

    if (orders.length === 0) {
      return "No orders matched your search.";
    }

    let text = `--- ORDER SEARCH (${orders.length} results) ---\n`;
    for (const o of orders) {
      text += `\n• ${formatOrderSummary(o)}`;
    }
    if (result.pageInfo?.hasNextPage) {
      text += `\n\nNext page cursor: ${result.pageInfo.endCursor}`;
    }
    return text;
  },
});

registerTool({
  name: "get_fulfillment_status",
  description: "Get fulfillment status, tracking numbers, and open fulfillment orders for an order.",
  inputSchema: {
    type: "object",
    properties: {
      orderName: { type: "string", description: "Order name including #, e.g. '#1001'" },
    },
    required: ["orderName"],
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const order = await fetchOrderByName(args.orderName, "fulfillment");
    if (!order) return `Order ${args.orderName} not found.`;

    let text = `--- FULFILLMENT: ${order.name} ---
Status: ${order.displayFulfillmentStatus}\n`;

    const fulfillments = order.fulfillments ?? [];
    if (fulfillments.length === 0) {
      text += "\nNo fulfillments yet.";
    } else {
      text += "\nShipments:\n";
      for (const f of fulfillments) {
        const tracking = f.trackingInfo?.[0];
        text += `- ${f.status} (${f.createdAt})`;
        if (tracking?.number) {
          text += ` — ${tracking.company ?? "carrier"}: ${tracking.number}`;
          if (tracking.url) text += ` (${tracking.url})`;
        }
        text += "\n";
      }
    }

    const openFo = order.fulfillmentOrders?.edges?.filter(
      (e) => e.node.status === "OPEN" || e.node.status === "IN_PROGRESS"
    );
    if (openFo?.length) {
      text += `\nOpen fulfillment orders: ${openFo.length}`;
    }
    return text;
  },
});

registerTool({
  name: "fulfill_order",
  description:
    "Mark an order as fulfilled with optional tracking. Fulfills all remaining items. Requires CONFIRM (high-risk).",
  inputSchema: {
    type: "object",
    properties: {
      orderName: { type: "string", description: "Order name e.g. '#1001'" },
      trackingNumber: { type: "string", description: "Tracking number" },
      trackingCompany: { type: "string", description: "Carrier name e.g. 'UPS'" },
      trackingUrl: { type: "string", description: "Tracking URL" },
      notifyCustomer: { type: "boolean", description: "Email customer (default true)" },
    },
    required: ["orderName"],
  },
  readOnly: false,
  riskTier: "high",
  confirmationSummary: (args) =>
    `Fulfill order ${args.orderName}${args.trackingNumber ? ` with tracking ${args.trackingNumber}` : ""}`,
  handler: async (args) => {
    const order = await fetchOrderByName(args.orderName, "fulfillment");
    if (!order) throw new Error(`Order ${args.orderName} not found.`);

    const fulfillmentOrders = order.fulfillmentOrders?.edges ?? [];
    const lineItemsByFulfillmentOrder = fulfillmentOrders
      .filter((e) => ["OPEN", "IN_PROGRESS"].includes(e.node.status))
      .map((e) => ({
        fulfillmentOrderId: e.node.id,
        fulfillmentOrderLineItems: e.node.lineItems.edges
          .filter((li) => li.node.remainingQuantity > 0)
          .map((li) => ({ id: li.node.id, quantity: li.node.remainingQuantity })),
      }))
      .filter((fo) => fo.fulfillmentOrderLineItems.length > 0);

    if (lineItemsByFulfillmentOrder.length === 0) {
      throw new Error(`No open fulfillment items for ${args.orderName}.`);
    }

    const fulfillment = {
      lineItemsByFulfillmentOrder,
      notifyCustomer: args.notifyCustomer !== false,
    };

    if (args.trackingNumber) {
      fulfillment.trackingInfo = {
        number: args.trackingNumber,
        company: args.trackingCompany,
        url: args.trackingUrl,
      };
    }

    const mutation = `
      mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment {
            id
            status
            trackingInfo { number url company }
          }
          userErrors { field message }
        }
      }
    `;

    const data = await shopifyGraphQL(mutation, { fulfillment });
    const response = data.fulfillmentCreate;
    if (response.userErrors?.length) {
      throw new Error(`Shopify Error: ${JSON.stringify(response.userErrors)}`);
    }

    const f = response.fulfillment;
    const tracking = f.trackingInfo?.[0];
    return `Order fulfilled
Order: ${args.orderName}
Fulfillment ID: ${f.id}
Status: ${f.status}${tracking?.number ? `\nTracking: ${tracking.company ?? ""} ${tracking.number}` : ""}`;
  },
});

registerTool({
  name: "cancel_order",
  description: "Cancel an unfulfilled order. Optionally refund and notify customer. Requires CONFIRM (high-risk).",
  inputSchema: {
    type: "object",
    properties: {
      orderName: { type: "string", description: "Order name e.g. '#1001'" },
      reason: {
        type: "string",
        enum: ["CUSTOMER", "FRAUD", "INVENTORY", "DECLINED", "OTHER"],
        description: "Cancel reason (default OTHER)",
      },
      refund: { type: "boolean", description: "Issue refund (default true)" },
      restock: { type: "boolean", description: "Restock inventory (default true)" },
      notifyCustomer: { type: "boolean", description: "Notify customer (default true)" },
    },
    required: ["orderName"],
  },
  readOnly: false,
  riskTier: "high",
  confirmationSummary: (args) => `Cancel order ${args.orderName}`,
  handler: async (args) => {
    const order = await fetchOrderByName(args.orderName);
    if (!order) throw new Error(`Order ${args.orderName} not found.`);
    if (order.cancelledAt) throw new Error(`Order ${args.orderName} is already cancelled.`);

    const mutation = `
      mutation orderCancel(
        $orderId: ID!
        $reason: OrderCancelReason!
        $refund: Boolean!
        $restock: Boolean!
        $notifyCustomer: Boolean!
      ) {
        orderCancel(
          orderId: $orderId
          reason: $reason
          refund: $refund
          restock: $restock
          notifyCustomer: $notifyCustomer
        ) {
          job { id done }
          orderCancelUserErrors { field message }
        }
      }
    `;

    const data = await shopifyGraphQL(mutation, {
      orderId: order.id,
      reason: args.reason || "OTHER",
      refund: args.refund !== false,
      restock: args.restock !== false,
      notifyCustomer: args.notifyCustomer !== false,
    });

    const errors = data.orderCancel?.orderCancelUserErrors;
    if (errors?.length) {
      throw new Error(`Shopify Error: ${JSON.stringify(errors)}`);
    }

    return `Order cancellation started
Order: ${args.orderName}
Job ID: ${data.orderCancel?.job?.id ?? "queued"}`;
  },
});

registerTool({
  name: "create_refund",
  description: "Create a full refund for a paid order. Requires CONFIRM (high-risk).",
  inputSchema: {
    type: "object",
    properties: {
      orderName: { type: "string", description: "Order name e.g. '#1001'" },
      note: { type: "string", description: "Optional refund note" },
      notifyCustomer: { type: "boolean", description: "Notify customer (default true)" },
      restock: { type: "boolean", description: "Restock items (default true)" },
    },
    required: ["orderName"],
  },
  readOnly: false,
  riskTier: "high",
  confirmationSummary: (args) => `Full refund for order ${args.orderName}`,
  handler: async (args) => {
    const order = await fetchOrderByName(args.orderName, "refund");
    if (!order) throw new Error(`Order ${args.orderName} not found.`);

    const parentTx = order.transactions?.find(
      (t) => t.kind === "SALE" && t.status === "SUCCESS"
    );
    if (!parentTx) {
      throw new Error(`No successful payment transaction found for ${args.orderName}.`);
    }

    const refundLineItems = order.lineItems.edges.map((e) => {
      const item = { lineItemId: e.node.id, quantity: e.node.quantity };
      if (args.restock === false) {
        item.restockType = "NO_RESTOCK";
      }
      return item;
    });

    const amount = parentTx.amountSet.shopMoney.amount;
    const mutation = `
      mutation refundCreate($input: RefundInput!) {
        refundCreate(input: $input) {
          refund { id createdAt }
          userErrors { field message }
        }
      }
    `;

    const input = {
      orderId: order.id,
      note: args.note || "Refund via Discord agent",
      notify: args.notifyCustomer !== false,
      refundLineItems,
      transactions: [
        {
          orderId: order.id,
          parentId: parentTx.id,
          amount: String(amount),
          kind: "REFUND",
          gateway: parentTx.gateway,
        },
      ],
    };

    const data = await shopifyGraphQL(mutation, { input });
    const response = data.refundCreate;
    if (response.userErrors?.length) {
      throw new Error(`Shopify Error: ${JSON.stringify(response.userErrors)}`);
    }

    return `Refund created
Order: ${args.orderName}
Refund ID: ${response.refund?.id}
Amount: ${amount} ${parentTx.amountSet.shopMoney.currencyCode}`;
  },
});