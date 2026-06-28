import { registerTool } from "../lib/tool-registry.mjs";
import { shopifyGraphQL } from "../lib/shopify-client.mjs";
import { resolveVariantIdBySku } from "../lib/variant-resolver.mjs";

async function resolveLineItems(lineItems) {
  const resolved = [];
  for (const item of lineItems) {
    if (item.variantId) {
      resolved.push({ variantId: item.variantId, quantity: parseInt(item.quantity, 10) });
      continue;
    }
    if (item.sku) {
      const variant = await resolveVariantIdBySku(shopifyGraphQL, item.sku);
      if (!variant) throw new Error(`SKU "${item.sku}" not found.`);
      resolved.push({ variantId: variant.id, quantity: parseInt(item.quantity, 10) });
      continue;
    }
    throw new Error("Each line item needs sku or variantId.");
  }
  return resolved;
}

registerTool({
  name: "create_draft_order",
  description:
    "Create a draft order for a customer email with line items (sku + quantity). Optionally apply order-level discount.",
  inputSchema: {
    type: "object",
    properties: {
      customerEmail: { type: "string", description: "Customer email address" },
      lineItems: {
        type: "array",
        description: "Array of { sku, quantity } or { variantId, quantity }",
        items: {
          type: "object",
          properties: {
            sku: { type: "string" },
            variantId: { type: "string" },
            quantity: { type: "integer" },
          },
          required: ["quantity"],
        },
      },
      note: { type: "string", description: "Optional order note" },
      tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
      appliedDiscountValue: { type: "number", description: "Order-level discount value" },
      appliedDiscountType: {
        type: "string",
        enum: ["percentage", "fixed_amount"],
        description: "Discount type for order-level discount",
      },
    },
    required: ["customerEmail", "lineItems"],
  },
  readOnly: false,
  riskTier: "low",
  handler: async (args) => {
    const lineItems = await resolveLineItems(args.lineItems);
    const input = {
      email: args.customerEmail,
      lineItems,
      note: args.note,
      tags: args.tags,
    };

    if (args.appliedDiscountValue && args.appliedDiscountType) {
      input.appliedDiscount = {
        value: parseFloat(args.appliedDiscountValue),
        valueType: args.appliedDiscountType === "percentage" ? "PERCENTAGE" : "FIXED_AMOUNT",
        title: "Discord discount",
      };
    }

    const mutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            totalPrice
            invoiceUrl
            status
          }
          userErrors { field message }
        }
      }
    `;

    const data = await shopifyGraphQL(mutation, { input });
    const response = data.draftOrderCreate;

    if (response.userErrors?.length) {
      throw new Error(`Shopify Error: ${JSON.stringify(response.userErrors)}`);
    }

    const d = response.draftOrder;
    return `Draft order created
Name: ${d.name}
ID: ${d.id}
Customer: ${args.customerEmail}
Total: ${d.totalPrice}
Status: ${d.status}
Invoice URL: ${d.invoiceUrl ?? "N/A"}`;
  },
});

registerTool({
  name: "list_draft_orders",
  description: "List open draft orders with customer email, total, and status.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "integer", description: "Max drafts to return (default 10)" },
    },
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const limit = args?.limit || 10;
    const query = `
      query listDraftOrders($first: Int!) {
        draftOrders(first: $first, query: "status:open") {
          edges {
            node {
              id
              name
              email
              createdAt
              status
              totalPrice
              invoiceUrl
            }
          }
        }
      }
    `;
    const data = await shopifyGraphQL(query, { first: limit });
    const drafts = data.draftOrders?.edges ?? [];

    if (drafts.length === 0) {
      return "No open draft orders found.";
    }

    let text = "--- OPEN DRAFT ORDERS ---\n";
    for (const { node: d } of drafts) {
      text += `\n• ${d.name} — ${d.email ?? "no email"}`;
      text += `\n  Total: ${d.totalPrice}, Status: ${d.status}`;
      text += `\n  ID: ${d.id}`;
      if (d.invoiceUrl) text += `\n  Invoice: ${d.invoiceUrl}`;
    }
    return text;
  },
});

registerTool({
  name: "send_draft_order_invoice",
  description: "Send a draft order invoice email to the customer.",
  inputSchema: {
    type: "object",
    properties: {
      draftOrderId: { type: "string", description: "DraftOrder GID" },
      to: { type: "string", description: "Override recipient email" },
      subject: { type: "string", description: "Email subject line" },
      customMessage: { type: "string", description: "Custom message in the invoice email" },
    },
    required: ["draftOrderId"],
  },
  readOnly: false,
  riskTier: "low",
  handler: async (args) => {
    const mutation = `
      mutation draftOrderInvoiceSend($id: ID!, $email: EmailInput) {
        draftOrderInvoiceSend(id: $id, email: $email) {
          draftOrder { id name }
          userErrors { field message }
        }
      }
    `;

    const email = {};
    if (args.to) email.to = args.to;
    if (args.subject) email.subject = args.subject;
    if (args.customMessage) email.customMessage = args.customMessage;

    const variables = { id: args.draftOrderId };
    if (Object.keys(email).length) variables.email = email;

    const data = await shopifyGraphQL(mutation, variables);
    const response = data.draftOrderInvoiceSend;

    if (response.userErrors?.length) {
      throw new Error(`Shopify Error: ${JSON.stringify(response.userErrors)}`);
    }

    return `Draft order invoice sent
Draft: ${response.draftOrder?.name ?? args.draftOrderId}
Recipient: ${args.to ?? "customer email on draft"}`;
  },
});