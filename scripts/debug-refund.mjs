import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { fetchOrderByName } from "../lib/order-helpers.mjs";
import { shopifyGraphQL } from "../lib/shopify-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const orderName = process.argv[2] || "#1003";
const order = await fetchOrderByName(orderName, "refund");
if (!order) throw new Error(`Order ${orderName} not found`);

console.log("Order:", order.name, order.displayFinancialStatus);
console.log("Transactions:", JSON.stringify(order.transactions, null, 2));

const parentTx = order.transactions?.find((t) => t.kind === "SALE" && t.status === "SUCCESS");
if (!parentTx) throw new Error("No SALE transaction");

const refundLineItems = order.lineItems.edges.map((e) => ({
  lineItemId: e.node.id,
  quantity: e.node.quantity,
}));

const amount = parentTx.amountSet.shopMoney.amount;
const mutation = `
  mutation refundCreate($input: RefundInput!) {
    refundCreate(input: $input) {
      refund { id createdAt totalRefundedSet { shopMoney { amount currencyCode } } }
      userErrors { field message }
    }
  }
`;

const input = {
  orderId: order.id,
  note: "MCP test refund",
  notify: false,
  refundLineItems,
  transactions: [
    {
      orderId: order.id,
      parentId: parentTx.id,
      amount,
      kind: "REFUND",
      gateway: parentTx.gateway,
    },
  ],
};

console.log("Refund input:", JSON.stringify(input, null, 2));

try {
  const data = await shopifyGraphQL(mutation, { input });
  console.log(JSON.stringify(data, null, 2));
} catch (err) {
  console.error("FAIL:", err.message);
}