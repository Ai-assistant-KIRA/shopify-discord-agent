import { registerTool } from "../lib/tool-registry.mjs";
import { shopifyGraphQL, getShopCurrency } from "../lib/shopify-client.mjs";
import { fetchOrderByName } from "../lib/order-helpers.mjs";

registerTool({
  name: "get_order_by_name",
  description:
    "Look up a single order by name, e.g. '#1001'. Returns customer email, fulfillment status, line items, and order ID.",
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
    const order = await fetchOrderByName(args?.orderName);
    if (!order) {
      return `Order ${args?.orderName} not found.`;
    }

    const { amount, currencyCode } = order.totalPriceSet.shopMoney;
    const customerEmail = order.customer?.email || order.email || "N/A";
    const lines =
      order.lineItems?.edges
        ?.map((e) => `- ${e.node.quantity}x ${e.node.title} (${e.node.sku || "no-sku"})`)
        .join("\n") || "No line items";

    return `--- ORDER ${order.name} ---
ID: ${order.id}
Date: ${order.createdAt}
Payment: ${order.displayFinancialStatus}
Fulfillment: ${order.displayFulfillmentStatus}
Customer: ${customerEmail}
Total: ${amount} ${currencyCode}

Line items:
${lines}`;
  },
});

registerTool({
  name: "get_daily_orders",
  description: "Get the number of orders and details of orders placed today.",
  inputSchema: { type: "object", properties: {} },
  readOnly: true,
  riskTier: "none",
  handler: async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isoToday = today.toISOString().split("T")[0];

    const query = `
      query getOrders($query: String!) {
        orders(first: 50, query: $query) {
          edges {
            node {
              name
              createdAt
              totalPriceSet { shopMoney { amount currencyCode } }
            }
          }
        }
      }
    `;
    const data = await shopifyGraphQL(query, { query: `created_at:>=${isoToday}` });
    const orders = data.orders.edges.map((edge) => edge.node);

    if (orders.length === 0) {
      return `No orders placed today (${isoToday}).`;
    }

    let text = `--- DAILY ORDERS (${isoToday}) ---\nTotal: ${orders.length}\n\nRecent:\n`;
    orders.slice(0, 10).forEach((o) => {
      const { amount, currencyCode } = o.totalPriceSet.shopMoney;
      text += `- ${o.name}: ${amount} ${currencyCode}\n`;
    });
    return text;
  },
});

registerTool({
  name: "get_revenue_summary",
  description: "Get total revenue generated today.",
  inputSchema: { type: "object", properties: {} },
  readOnly: true,
  riskTier: "none",
  handler: async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isoToday = today.toISOString().split("T")[0];

    const query = `
      query getOrders($query: String!) {
        orders(first: 50, query: $query) {
          edges {
            node {
              totalPriceSet { shopMoney { amount currencyCode } }
            }
          }
        }
      }
    `;
    const data = await shopifyGraphQL(query, { query: `created_at:>=${isoToday}` });
    const orders = data.orders.edges.map((edge) => edge.node);

    let totalRevenue = 0;
    let currency = await getShopCurrency();
    if (orders.length > 0) {
      currency = orders[0].totalPriceSet.shopMoney.currencyCode;
      totalRevenue = orders.reduce(
        (sum, order) => sum + parseFloat(order.totalPriceSet.shopMoney.amount),
        0
      );
    }

    return `--- REVENUE SUMMARY ---
Date: ${isoToday}
Total Revenue: ${totalRevenue.toFixed(2)} ${currency}
Total Orders: ${orders.length}`;
  },
});

export { fetchOrderByName };