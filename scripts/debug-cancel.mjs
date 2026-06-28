import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { shopifyGraphQL } from "../lib/shopify-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const orderId = process.argv[2] || "gid://shopify/Order/7863733387454";

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

try {
  const data = await shopifyGraphQL(mutation, {
    orderId,
    reason: "OTHER",
    refund: true,
    restock: true,
    notifyCustomer: false,
  });
  console.log(JSON.stringify(data, null, 2));
} catch (err) {
  console.error("FAIL:", err.message);
  process.exit(1);
}