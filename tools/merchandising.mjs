import { registerTool } from "../lib/tool-registry.mjs";
import { shopifyGraphQL } from "../lib/shopify-client.mjs";
import { resolveVariantIdBySku } from "../lib/variant-resolver.mjs";

registerTool({
  name: "get_low_stock_products",
  description: "List products with total inventory below a threshold (default 10).",
  inputSchema: {
    type: "object",
    properties: {
      threshold: { type: "integer", description: "Stock threshold (default 10)" },
      limit: { type: "integer", description: "Max products (default 20)" },
    },
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const threshold = args.threshold ?? 10;
    const limit = args.limit ?? 20;
    const query = `
      query lowStock($first: Int!) {
        products(first: $first, sortKey: INVENTORY_TOTAL) {
          edges {
            node {
              title
              status
              totalInventory
              variants(first: 3) {
                edges { node { sku price } }
              }
            }
          }
        }
      }
    `;
    const data = await shopifyGraphQL(query, { first: Math.min(limit * 3, 60) });
    const low = (data.products?.edges ?? [])
      .map((e) => e.node)
      .filter((p) => p.totalInventory < threshold)
      .slice(0, limit);

    if (low.length === 0) {
      return `No products below ${threshold} units in stock.`;
    }

    let text = `--- LOW STOCK (below ${threshold}) ---\n`;
    for (const p of low) {
      const skus = p.variants.edges.map((v) => v.node.sku || "no-sku").join(", ");
      text += `\n• ${p.title} — ${p.totalInventory} left (${p.status}), SKUs: ${skus}`;
    }
    return text;
  },
});

registerTool({
  name: "list_inventory_by_location",
  description: "List inventory levels at a location. Pass locationName or uses first location.",
  inputSchema: {
    type: "object",
    properties: {
      locationName: { type: "string", description: "Location name e.g. 'Main Warehouse'" },
      limit: { type: "integer", description: "Max items (default 20)" },
    },
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const limit = args.limit ?? 20;
    const locQuery = `
      query locations {
        locations(first: 10) {
          edges { node { id name } }
        }
      }
    `;
    const locData = await shopifyGraphQL(locQuery);
    const locations = locData.locations?.edges?.map((e) => e.node) ?? [];
    const location = args.locationName
      ? locations.find((l) => l.name.toLowerCase().includes(args.locationName.toLowerCase()))
      : locations[0];

    if (!location) {
      throw new Error(args.locationName ? `Location "${args.locationName}" not found.` : "No locations found.");
    }

    const invQuery = `
      query locationInventory($id: ID!, $first: Int!) {
        location(id: $id) {
          name
          inventoryLevels(first: $first) {
            edges {
              node {
                quantities(names: ["available"]) { name quantity }
                item { sku variant { product { title } } }
              }
            }
          }
        }
      }
    `;
    const data = await shopifyGraphQL(invQuery, { id: location.id, first: limit });
    const levels = data.location?.inventoryLevels?.edges ?? [];

    if (levels.length === 0) {
      return `No inventory at ${location.name}.`;
    }

    let text = `--- INVENTORY: ${data.location.name} ---\n`;
    for (const { node } of levels) {
      const qty = node.quantities?.find((q) => q.name === "available")?.quantity ?? 0;
      const sku = node.item?.sku ?? "no-sku";
      const product = node.item?.variant?.product?.title ?? "Unknown";
      text += `\n• ${product} (${sku}): ${qty} available`;
    }
    return text;
  },
});

registerTool({
  name: "set_variant_price",
  description: "Update a variant price by SKU. Requires CONFIRM (high-risk).",
  inputSchema: {
    type: "object",
    properties: {
      sku: { type: "string", description: "Variant SKU" },
      price: { type: "string", description: "New price e.g. '29.99'" },
    },
    required: ["sku", "price"],
  },
  readOnly: false,
  riskTier: "high",
  confirmationSummary: (args) => `Set price of ${args.sku} to ${args.price}`,
  handler: async (args) => {
    const variant = await resolveVariantIdBySku(shopifyGraphQL, args.sku);
    if (!variant) throw new Error(`SKU "${args.sku}" not found.`);

    const mutation = `
      mutation productVariantUpdate($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant { id sku price product { title } }
          userErrors { field message }
        }
      }
    `;

    const data = await shopifyGraphQL(mutation, {
      input: { id: variant.id, price: String(args.price) },
    });
    const response = data.productVariantUpdate;
    if (response.userErrors?.length) {
      throw new Error(`Shopify Error: ${JSON.stringify(response.userErrors)}`);
    }

    const v = response.productVariant;
    return `Price updated
Product: ${v.product?.title}
SKU: ${v.sku}
New price: ${v.price}`;
  },
});

registerTool({
  name: "set_product_status",
  description: "Publish (ACTIVE) or unpublish (DRAFT) a product by title search. Requires CONFIRM (high-risk).",
  inputSchema: {
    type: "object",
    properties: {
      productQuery: { type: "string", description: "Product title keyword" },
      status: {
        type: "string",
        enum: ["ACTIVE", "DRAFT", "ARCHIVED"],
        description: "Target status",
      },
    },
    required: ["productQuery", "status"],
  },
  readOnly: false,
  riskTier: "high",
  confirmationSummary: (args) => `Set "${args.productQuery}" status to ${args.status}`,
  handler: async (args) => {
    const searchQuery = `
      query findProduct($query: String!) {
        products(first: 1, query: $query) {
          edges { node { id title status } }
        }
      }
    `;
    const found = await shopifyGraphQL(searchQuery, { query: `title:*${args.productQuery}*` });
    const product = found.products?.edges?.[0]?.node;
    if (!product) throw new Error(`No product found for "${args.productQuery}".`);

    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title status }
          userErrors { field message }
        }
      }
    `;

    const data = await shopifyGraphQL(mutation, {
      input: { id: product.id, status: args.status },
    });
    const response = data.productUpdate;
    if (response.userErrors?.length) {
      throw new Error(`Shopify Error: ${JSON.stringify(response.userErrors)}`);
    }

    const p = response.product;
    return `Product status updated
Title: ${p.title}
Status: ${p.status}`;
  },
});