import { registerTool } from "../lib/tool-registry.mjs";
import { shopifyGraphQL, getShopCurrency } from "../lib/shopify-client.mjs";


registerTool({
  name: "get_inventory_by_sku",
  description: "Check inventory level, price, inventoryItemId, and locationId for a product SKU.",
  inputSchema: {
    type: "object",
    properties: { sku: { type: "string", description: "The product SKU" } },
    required: ["sku"],
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const sku = args?.sku;
    const detailedQuery = `
      query getInventory($query: String!) {
        productVariants(first: 5, query: $query) {
          edges {
            node {
              title
              sku
              price
              inventoryQuantity
              product { title }
              inventoryItem {
                id
                inventoryLevels(first: 5) {
                  edges {
                    node {
                      quantities(names: ["available"]) { name quantity }
                      location { id name }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const basicQuery = `
      query getInventoryBasic($query: String!) {
        productVariants(first: 5, query: $query) {
          edges {
            node {
              title
              sku
              price
              inventoryQuantity
              product { title }
            }
          }
        }
      }
    `;

    let variant;
    let invLevel;
    try {
      const data = await shopifyGraphQL(detailedQuery, { query: `sku:${sku}` });
      variant = data.productVariants.edges[0]?.node;
      invLevel = variant?.inventoryItem?.inventoryLevels?.edges[0]?.node;
    } catch (err) {
      if (!/read_inventory|inventoryLevels|locations/i.test(err.message)) throw err;
      const data = await shopifyGraphQL(basicQuery, { query: `sku:${sku}` });
      variant = data.productVariants.edges[0]?.node;
    }

    if (!variant) {
      return `Product with SKU "${sku}" was not found.`;
    }

    const qty =
      invLevel?.quantities?.find((q) => q.name === "available")?.quantity ??
      variant.inventoryQuantity ??
      0;
    const currency = await getShopCurrency();

    return `--- PRODUCT INFORMATION ---
SKU: ${variant.sku}
Product: ${variant.product?.title} (${variant.title})
Price: ${variant.price} ${currency}

--- STOCK LEVEL ---
Available Stock: ${qty}
Location: ${invLevel?.location?.name ?? "N/A (read_inventory scope required for location detail)"}

--- API IDENTIFIERS ---
inventoryItemId: ${variant.inventoryItem?.id ?? "N/A (read_inventory scope required)"}
locationId: ${invLevel?.location?.id ?? "N/A"}`;
  },
});

registerTool({
  name: "update_inventory_quantity",
  description:
    "Adjust stock using inventoryItemId and locationId from get_inventory_by_sku. Requires CONFIRM (high-risk).",
  inputSchema: {
    type: "object",
    properties: {
      inventoryItemId: { type: "string" },
      locationId: { type: "string" },
      availableDelta: { type: "integer", description: "Relative adjustment, e.g. +10 or -5" },
    },
    required: ["inventoryItemId", "locationId", "availableDelta"],
  },
  readOnly: false,
  riskTier: "high",
  handler: async (args) => {
    const { inventoryItemId, locationId, availableDelta } = args;
    const mutation = `
      mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup { createdAt }
          userErrors { field message }
        }
      }
    `;

    const input = {
      reason: "correction",
      name: "available",
      changes: [{ inventoryItemId, locationId, delta: parseInt(availableDelta, 10) }],
    };

    const data = await shopifyGraphQL(mutation, { input });
    const response = data.inventoryAdjustQuantities;

    if (response.userErrors?.length) {
      throw new Error(`Shopify Error: ${JSON.stringify(response.userErrors)}`);
    }

    const sign = availableDelta > 0 ? "+" : "";
    return `Stock adjusted
Item: ${inventoryItemId}
Location: ${locationId}
Change: ${sign}${availableDelta} units`;
  },
  confirmationSummary: (args) =>
    `Adjust inventory by ${args.availableDelta} at location ${args.locationId}`,
});