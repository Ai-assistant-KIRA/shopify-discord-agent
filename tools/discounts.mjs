import { registerTool } from "../lib/tool-registry.mjs";
import { shopifyGraphQL, getShopCurrency } from "../lib/shopify-client.mjs";
import { resolveProductIdsByQuery } from "../lib/variant-resolver.mjs";

async function buildDiscountItems(args) {
  if (args.collectionId) {
    return { collections: { add: [args.collectionId] } };
  }
  if (args.productQuery) {
    const products = await resolveProductIdsByQuery(shopifyGraphQL, args.productQuery);
    if (products.length === 0) {
      throw new Error(`No products found for "${args.productQuery}".`);
    }
    return { products: { productsToAdd: products.map((p) => p.id) } };
  }
  return { all: true };
}

registerTool({
  name: "create_discount_code",
  description:
    "Create a discount code (percentage or fixed). Store-wide by default; pass productQuery or collectionId to scope.",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "Coupon code name, e.g. 'SAVE15'" },
      value: { type: "number", description: "Numeric value, e.g. 15 for 15%" },
      valueType: {
        type: "string",
        enum: ["percentage", "fixed_amount"],
        description: "percentage or fixed_amount",
      },
      title: { type: "string", description: "Optional discount title" },
      productQuery: { type: "string", description: "Product title keyword to limit discount scope" },
      collectionId: { type: "string", description: "Collection GID to limit discount scope" },
      usageLimit: { type: "integer", description: "Max number of times the code can be used" },
      startsAt: { type: "string", description: "ISO start datetime (defaults to now)" },
      endsAt: { type: "string", description: "Optional ISO end datetime" },
    },
    required: ["code", "value", "valueType"],
  },
  readOnly: false,
  riskTier: "low",
  handler: async (args) => {
    const { code, value, valueType, title, usageLimit, startsAt, endsAt } = args;
    const currency = await getShopCurrency();
    const items = await buildDiscountItems(args);

    const mutation = `
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
            codeDiscount {
              ... on DiscountCodeBasic { title summary }
            }
          }
          userErrors { field message }
        }
      }
    `;

    const basicCodeDiscount = {
      title: title || `${code} Code Discount`,
      code,
      startsAt: startsAt || new Date().toISOString(),
      endsAt: endsAt || undefined,
      usageLimit: usageLimit || undefined,
      customerSelection: { all: true },
      customerGets: {
        value: {
          percentage: valueType === "percentage" ? parseFloat(value) / 100 : undefined,
          discountAmount:
            valueType === "fixed_amount"
              ? { amount: parseFloat(value), currencyCode: currency }
              : undefined,
        },
        items,
      },
    };

    const data = await shopifyGraphQL(mutation, { basicCodeDiscount });
    const response = data.discountCodeBasicCreate;

    if (response.userErrors?.length) {
      throw new Error(`Shopify Error: ${JSON.stringify(response.userErrors)}`);
    }

    const scope = args.productQuery
      ? `product search: "${args.productQuery}"`
      : args.collectionId
        ? `collection: ${args.collectionId}`
        : "store-wide";
    const summary = response.codeDiscountNode?.codeDiscount?.summary || "Discount created";

    return `Discount created
Code: ${code}
Title: ${basicCodeDiscount.title}
Scope: ${scope}
Summary: ${summary}
ID: ${response.codeDiscountNode?.id}`;
  },
});

registerTool({
  name: "list_discount_codes",
  description: "List active discount codes with usage counts and summaries.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "integer", description: "Max codes to return (default 10)" },
    },
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const limit = args?.limit || 10;
    const query = `
      query listDiscounts($first: Int!) {
        codeDiscountNodes(first: $first) {
          edges {
            node {
              id
              codeDiscount {
                ... on DiscountCodeBasic {
                  title
                  summary
                  status
                  codes(first: 1) {
                    nodes { code asyncUsageCount }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const data = await shopifyGraphQL(query, { first: limit });
    const nodes = data.codeDiscountNodes?.edges ?? [];

    if (nodes.length === 0) {
      return "No discount codes found.";
    }

    let text = "--- ACTIVE DISCOUNT CODES ---\n";
    for (const { node } of nodes) {
      const d = node.codeDiscount;
      const codeNode = d?.codes?.nodes?.[0];
      text += `\n• ${codeNode?.code ?? d?.title} — ${d?.summary ?? "no summary"}`;
      text += `\n  Status: ${d?.status ?? "unknown"}, Uses: ${codeNode?.asyncUsageCount ?? 0}`;
      text += `\n  ID: ${node.id}`;
    }
    return text;
  },
});

registerTool({
  name: "deactivate_discount_code",
  description: "Deactivate a discount code by its DiscountCodeNode GID.",
  inputSchema: {
    type: "object",
    properties: {
      discountId: { type: "string", description: "DiscountCodeNode GID from list_discount_codes" },
    },
    required: ["discountId"],
  },
  readOnly: false,
  riskTier: "low",
  handler: async (args) => {
    const mutation = `
      mutation discountCodeDeactivate($id: ID!) {
        discountCodeDeactivate(id: $id) {
          codeDiscountNode { id }
          userErrors { field message }
        }
      }
    `;
    const data = await shopifyGraphQL(mutation, { id: args.discountId });
    const response = data.discountCodeDeactivate;

    if (response.userErrors?.length) {
      throw new Error(`Shopify Error: ${JSON.stringify(response.userErrors)}`);
    }

    return `Discount deactivated: ${response.codeDiscountNode?.id}`;
  },
});