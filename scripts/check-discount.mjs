import { shopifyGraphQL } from "../lib/shopify-client.mjs";

const code = process.argv[2] || "LOVE";
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
              startsAt
              endsAt
              codes(first: 5) { nodes { code asyncUsageCount } }
              customerGets {
                value {
                  ... on DiscountPercentage { percentage }
                  ... on DiscountAmount { amount { amount currencyCode } }
                }
                items {
                  ... on DiscountProducts {
                    products(first: 5) { edges { node { title id } } }
                  }
                  ... on AllDiscountItems { allItems }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const data = await shopifyGraphQL(query, { first: 50 });
const match = data.codeDiscountNodes?.edges?.find((e) =>
  e.node.codeDiscount?.codes?.nodes?.some((c) => c.code.toUpperCase() === code.toUpperCase())
);

if (!match) {
  console.log(`NOT FOUND: No discount code "${code}" in Shopify.`);
  process.exit(1);
}

const d = match.node.codeDiscount;
const codeNode = d.codes.nodes.find((c) => c.code.toUpperCase() === code.toUpperCase());
const pct = d.customerGets?.value?.percentage;
const products = d.customerGets?.items?.products?.edges?.map((e) => e.node.title) ?? [];

console.log("FOUND — live in Shopify");
console.log("Code:", codeNode.code);
console.log("Status:", d.status);
console.log("Summary:", d.summary);
console.log("Discount:", pct != null ? `${(pct * 100).toFixed(0)}%` : d.customerGets?.value?.amount);
console.log("Product scope:", products.length ? products.join(", ") : "store-wide");
console.log("Uses:", codeNode.asyncUsageCount);
console.log("Starts:", d.startsAt);
console.log("Ends:", d.endsAt || "no end date");
console.log("ID:", match.node.id);