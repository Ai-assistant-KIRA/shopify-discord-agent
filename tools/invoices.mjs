import { registerTool } from "../lib/tool-registry.mjs";
import { shopifyGraphQL } from "../lib/shopify-client.mjs";
import { fetchOrderByName } from "../lib/order-helpers.mjs";

registerTool({
  name: "resend_order_invoice",
  description: "Resend the invoice email for an existing order by order name (e.g. '#1001').",
  inputSchema: {
    type: "object",
    properties: {
      orderName: { type: "string", description: "Order name including #, e.g. '#1001'" },
      to: { type: "string", description: "Override recipient email" },
      subject: { type: "string", description: "Email subject line" },
      customMessage: { type: "string", description: "Custom message in the invoice email" },
    },
    required: ["orderName"],
  },
  readOnly: false,
  riskTier: "low",
  handler: async (args) => {
    const order = await fetchOrderByName(args.orderName);
    if (!order) {
      throw new Error(`Order ${args.orderName} not found.`);
    }

    const mutation = `
      mutation orderInvoiceSend($id: ID!, $email: EmailInput) {
        orderInvoiceSend(id: $id, email: $email) {
          order { id name }
          userErrors { field message }
        }
      }
    `;

    const email = {};
    if (args.to) email.to = args.to;
    else if (order.customer?.email || order.email) email.to = order.customer?.email || order.email;
    if (args.subject) email.subject = args.subject;
    if (args.customMessage) email.customMessage = args.customMessage;

    const variables = { id: order.id };
    if (Object.keys(email).length) variables.email = email;

    const data = await shopifyGraphQL(mutation, variables);
    const response = data.orderInvoiceSend;

    if (response.userErrors?.length) {
      throw new Error(`Shopify Error: ${JSON.stringify(response.userErrors)}`);
    }

    return `Order invoice sent
Order: ${response.order?.name ?? args.orderName}
Recipient: ${email.to ?? "customer email on order"}`;
  },
});