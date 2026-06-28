export async function resolveVariantIdBySku(shopifyGraphQL, sku) {
  const query = `
    query resolveVariant($query: String!) {
      productVariants(first: 1, query: $query) {
        edges {
          node {
            id
            sku
            title
            product { id title }
          }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, { query: `sku:${sku}` });
  return data.productVariants?.edges?.[0]?.node ?? null;
}

export async function resolveProductIdsByQuery(shopifyGraphQL, productQuery) {
  const query = `
    query resolveProducts($query: String!) {
      products(first: 5, query: $query) {
        edges {
          node { id title }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, { query: `title:*${productQuery}*` });
  return (data.products?.edges ?? []).map((e) => e.node);
}