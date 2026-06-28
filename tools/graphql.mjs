import { registerTool, isReadOnlyMode } from "../lib/tool-registry.mjs";
import { shopifyGraphQL } from "../lib/shopify-client.mjs";

registerTool({
  name: "shopify_graphql_query",
  description: "Execute a raw Shopify Admin GraphQL query (mutations blocked in read-only mode).",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "GraphQL query or mutation string" },
      variables: { type: "object", description: "Optional variables object" },
    },
    required: ["query"],
  },
  readOnly: true,
  riskTier: "none",
  handler: async (args) => {
    const q = args?.query || "";
    if (isReadOnlyMode() && /\bmutation\b/i.test(q)) {
      throw new Error("Mutations are disabled in read-only mode.");
    }
    const vars = args?.variables || {};
    const data = await shopifyGraphQL(q, vars);
    return JSON.stringify(data, null, 2);
  },
});