import dotenv from "dotenv";
import { resolveCliAccessToken } from "../lib/cli-auth.mjs";

dotenv.config();
const token = resolveCliAccessToken();
const domain = process.env.SHOPIFY_DOMAIN;

async function q(query) {
  const r = await fetch(`https://${domain}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

const probes = [
  ['variants', '{ productVariants(first:1,query:"sku:BB-TONER-200"){edges{node{sku inventoryQuantity}}}}'],
  ['inventoryItem', '{ productVariants(first:1,query:"sku:BB-TONER-200"){edges{node{sku inventoryItem{id}}}}'],
  ['inventoryLevels', '{ productVariants(first:1,query:"sku:BB-TONER-200"){edges{node{sku inventoryItem{id inventoryLevels(first:1){edges{node{quantities(names:["available"]){name quantity}}}}}}}}'],
  ['discounts', '{ codeDiscountNodes(first:1){edges{node{id codeDiscount{... on DiscountCodeBasic{title codes(first:1){nodes{code}}}}}}}}'],
  ['locations', '{ locations(first:1){edges{node{id name}}}}'],
  ['abandoned', '{ abandonedCheckouts(first:1){edges{node{id abandonedCheckoutUrl email customer{email}}}}'],
];

for (const [name, query] of probes) {
  const d = await q(query);
  console.log(name, d.errors?.[0]?.message || "OK", JSON.stringify(d.data || "").slice(0, 100));
}