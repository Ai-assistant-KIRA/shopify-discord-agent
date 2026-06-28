/**
 * Create a fake customer + paid order in the live dev store for MCP tool testing.
 * Usage: node scripts/seed-test-order.mjs
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { shopifyGraphQL } from "../lib/shopify-client.mjs";
import { resolveVariantIdBySku } from "../lib/variant-resolver.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const TEST_SKU = process.env.TEST_SKU || "BB-TONER-200";
const stamp = Date.now().toString().slice(-6);
const customerEmail = `mcp-test-${stamp}@example.com`;
const customerFirst = "MCP";
const customerLast = `TestUser${stamp}`;

async function createCustomer() {
  const mutation = `
    mutation customerCreate($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id email displayName }
        userErrors { field message }
      }
    }
  `;
  const data = await shopifyGraphQL(mutation, {
    input: {
      email: customerEmail,
      firstName: customerFirst,
      lastName: customerLast,
      tags: ["mcp-test", "seed-script"],
      addresses: [
        {
          firstName: customerFirst,
          lastName: customerLast,
          address1: "123 Test Street",
          city: "Riga",
          province: "Riga",
          country: "LV",
          zip: "LV-1010",
          phone: "+37120000000",
        },
      ],
    },
  });
  const response = data.customerCreate;
  if (response.userErrors?.length) {
    throw new Error(`customerCreate: ${JSON.stringify(response.userErrors)}`);
  }
  return response.customer;
}

async function createAndCompleteOrder(customerId, { paymentPending = false } = {}) {
  const variant = await resolveVariantIdBySku(shopifyGraphQL, TEST_SKU);
  if (!variant) throw new Error(`SKU not found: ${TEST_SKU}`);

  const draftMutation = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name status totalPrice }
        userErrors { field message }
      }
    }
  `;
  const draftData = await shopifyGraphQL(draftMutation, {
    input: {
      email: customerEmail,
      customerId,
      lineItems: [{ variantId: variant.id, quantity: 1 }],
      note: "MCP seed order — safe for fulfill/cancel/refund testing",
      tags: ["mcp-test", "seed-script"],
      shippingAddress: {
        firstName: customerFirst,
        lastName: customerLast,
        address1: "123 Test Street",
        city: "Riga",
        province: "Riga",
        country: "LV",
        zip: "LV-1010",
        phone: "+37120000000",
      },
      billingAddress: {
        firstName: customerFirst,
        lastName: customerLast,
        address1: "123 Test Street",
        city: "Riga",
        province: "Riga",
        country: "LV",
        zip: "LV-1010",
        phone: "+37120000000",
      },
    },
  });
  const draft = draftData.draftOrderCreate;
  if (draft.userErrors?.length) {
    throw new Error(`draftOrderCreate: ${JSON.stringify(draft.userErrors)}`);
  }

  const draftOrderId = draft.draftOrder.id;
  console.log(`Draft created: ${draft.draftOrder.name} (${draftOrderId})`);

  const completeMutation = `
    mutation draftOrderComplete($id: ID!, $paymentPending: Boolean) {
      draftOrderComplete(id: $id, paymentPending: $paymentPending) {
        draftOrder {
          id
          order { id name displayFinancialStatus displayFulfillmentStatus }
        }
        userErrors { field message }
      }
    }
  `;
  const completeData = await shopifyGraphQL(completeMutation, {
    id: draftOrderId,
    paymentPending,
  });
  const complete = completeData.draftOrderComplete;
  if (complete.userErrors?.length) {
    throw new Error(`draftOrderComplete: ${JSON.stringify(complete.userErrors)}`);
  }

  const order = complete.draftOrder.order;
  if (!order) throw new Error("draftOrderComplete returned no order");

  if (!paymentPending && order.displayFinancialStatus !== "PAID") {
    const markPaidMutation = `
      mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
        orderMarkAsPaid(input: $input) {
          order { id name displayFinancialStatus }
          userErrors { field message }
        }
      }
    `;
    const paidData = await shopifyGraphQL(markPaidMutation, {
      input: { id: order.id },
    });
    const paid = paidData.orderMarkAsPaid;
    if (paid.userErrors?.length) {
      console.warn("orderMarkAsPaid warning:", paid.userErrors);
    } else {
      order.displayFinancialStatus = paid.order.displayFinancialStatus;
    }
  }

  return order;
}

async function main() {
  const paymentPending = process.argv.includes("--pending-payment");
  console.log("=== Seeding test customer + order ===\n");
  const customer = await createCustomer();
  console.log(`Customer: ${customer.displayName} <${customer.email}>`);
  console.log(`Customer ID: ${customer.id}\n`);

  const order = await createAndCompleteOrder(customer.id, { paymentPending });
  console.log(`\nOrder: ${order.name}`);
  console.log(`Order ID: ${order.id}`);
  console.log(`Payment: ${order.displayFinancialStatus}`);
  console.log(`Fulfillment: ${order.displayFulfillmentStatus}`);
  console.log("\nUse these in MCP tests:");
  console.log(`  TEST_CUSTOMER_EMAIL=${customerEmail}`);
  console.log(`  TEST_ORDER_NAME=${order.name}`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});