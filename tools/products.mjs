import { registerTool } from "../lib/tool-registry.mjs";
import { shopifyGraphQL } from "../lib/shopify-client.mjs";

const LIST_ALL_PATTERN = /^(all|\*|list|products?|everything|catalog|our|store)$/i;

function buildShopifyProductQuery(searchQuery) {
  const term = (searchQuery || "").trim();
  if (!term || LIST_ALL_PATTERN.test(term)) {
    return { shopifyQuery: "status:active", label: "all active products" };
  }
  return { shopifyQuery: `title:*${term}*`, label: term };
}

function formatProductList(products, label) {
  if (products.length === 0) {
    return `No products found${label ? ` for "${label}"` : ""}.`;
  }

  let text = `--- PRODUCTS: ${label} ---\n`;
  for (const p of products) {
    const skus = p.variants.edges.map((v) => v.node.sku || "no-sku").join(", ");
    text += `\n• ${p.title} (${p.status}) — stock: ${p.totalInventory}, SKUs: ${skus}`;
  }
  return text;
}

async function fetchProducts({ searchQuery, limit = 10 }) {
  const { shopifyQuery, label } = buildShopifyProductQuery(searchQuery);
  const gql = `
    query searchProducts($query: String!, $first: Int!) {
      products(first: $first, query: $query) {
        edges {
          node {
            id
            title
            status
            totalInventory
            variants(first: 3) {
              edges { node { id sku price } }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(gql, { query: shopifyQuery, first: limit });
  const products = data.products?.edges?.map((e) => e.node) || [];
  return { products, label };
}

registerTool({
  name: "list_products",
  description:
    "List active products in the store. Use for 'list products', 'show catalog', 'what do we sell'. Returns title, status, inventory, and SKUs.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "integer", description: "Max products to return (default 20)" },
    },
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const { products, label } = await fetchProducts({ searchQuery: "all", limit: args?.limit || 20 });
    return formatProductList(products, label);
  },
});

registerTool({
  name: "search_products",
  description:
    "Search products by title or keyword. For a full catalog listing, use list_products instead.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search term, e.g. 'cotton tee'. Omit or use 'all' to list active products." },
      limit: { type: "integer", description: "Max results (default 10)" },
    },
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const { products, label } = await fetchProducts({
      searchQuery: args?.query,
      limit: args?.limit || 10,
    });
    return formatProductList(products, label);
  },
});