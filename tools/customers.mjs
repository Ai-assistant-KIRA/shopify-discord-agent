import { registerTool } from "../lib/tool-registry.mjs";
import { shopifyGraphQL, getShopCurrency } from "../lib/shopify-client.mjs";
import { formatOrderSummary } from "../lib/order-helpers.mjs";

registerTool({
  name: "search_customers",
  description: "Search customers by email or name. Returns order count and total spent.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Email or name fragment" },
      limit: { type: "integer", description: "Max results (default 10)" },
    },
    required: ["query"],
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const gql = `
      query searchCustomers($query: String!, $first: Int!) {
        customers(first: $first, query: $query) {
          edges {
            node {
              id
              email
              displayName
              numberOfOrders
              amountSpent { amount currencyCode }
            }
          }
        }
      }
    `;
    const data = await shopifyGraphQL(gql, { query: args.query, first: args.limit || 10 });
    const customers = data.customers?.edges?.map((e) => e.node) ?? [];

    if (customers.length === 0) {
      return `No customers found for "${args.query}".`;
    }

    let text = `--- CUSTOMERS: "${args.query}" ---\n`;
    for (const c of customers) {
      const spent = c.amountSpent;
      text += `\n• ${c.displayName ?? "Unknown"} — ${c.email ?? "no email"}`;
      text += `\n  Orders: ${c.numberOfOrders}, Spent: ${spent.amount} ${spent.currencyCode}`;
      text += `\n  ID: ${c.id}`;
    }
    return text;
  },
});

registerTool({
  name: "get_customer_orders",
  description: "Get recent orders for a customer by email.",
  inputSchema: {
    type: "object",
    properties: {
      email: { type: "string", description: "Customer email" },
      limit: { type: "integer", description: "Max orders (default 10)" },
    },
    required: ["email"],
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const gql = `
      query customerOrders($query: String!, $first: Int!) {
        orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              displayFinancialStatus
              displayFulfillmentStatus
              email
              totalPriceSet { shopMoney { amount currencyCode } }
              customer { email }
            }
          }
        }
      }
    `;
    const data = await shopifyGraphQL(gql, {
      query: `email:${args.email}`,
      first: args.limit || 10,
    });
    const orders = data.orders?.edges?.map((e) => e.node) ?? [];

    if (orders.length === 0) {
      return `No orders found for ${args.email}.`;
    }

    let text = `--- ORDERS FOR ${args.email} ---\n`;
    for (const o of orders) {
      text += `\n• ${formatOrderSummary(o)} (${o.createdAt})`;
    }
    return text;
  },
});

registerTool({
  name: "get_revenue_by_period",
  description: "Get revenue and order count for the last N days (default 7).",
  inputSchema: {
    type: "object",
    properties: {
      days: { type: "integer", description: "Number of days to look back (default 7)" },
    },
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const days = args.days || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const isoSince = since.toISOString().split("T")[0];

    const gql = `
      query periodOrders($query: String!) {
        orders(first: 250, query: $query) {
          edges {
            node {
              totalPriceSet { shopMoney { amount currencyCode } }
            }
          }
        }
      }
    `;
    const data = await shopifyGraphQL(gql, { query: `created_at:>=${isoSince}` });
    const orders = data.orders?.edges?.map((e) => e.node) ?? [];

    let totalRevenue = 0;
    let currency = await getShopCurrency();
    if (orders.length > 0) {
      currency = orders[0].totalPriceSet.shopMoney.currencyCode;
      totalRevenue = orders.reduce(
        (sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount),
        0
      );
    }

    return `--- REVENUE (${days} days) ---
Since: ${isoSince}
Total Revenue: ${totalRevenue.toFixed(2)} ${currency}
Total Orders: ${orders.length}`;
  },
});

registerTool({
  name: "get_abandoned_checkouts",
  description: "List recent abandoned checkouts with recovery URLs.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "integer", description: "Max checkouts (default 10)" },
    },
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const gql = `
      query abandoned($first: Int!) {
        abandonedCheckouts(first: $first, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              createdAt
              abandonedCheckoutUrl
              customer { email }
              totalPriceSet { shopMoney { amount currencyCode } }
            }
          }
        }
      }
    `;
    const data = await shopifyGraphQL(gql, { first: args.limit || 10 });
    const checkouts = data.abandonedCheckouts?.edges?.map((e) => e.node) ?? [];

    if (checkouts.length === 0) {
      return "No abandoned checkouts found.";
    }

    let text = "--- ABANDONED CHECKOUTS ---\n";
    for (const c of checkouts) {
      const { amount, currencyCode } = c.totalPriceSet.shopMoney;
      text += `\n• ${c.customer?.email ?? "guest"} — ${amount} ${currencyCode} (${c.createdAt})`;
      text += `\n  Recovery: ${c.abandonedCheckoutUrl}`;
    }
    return text;
  },
});