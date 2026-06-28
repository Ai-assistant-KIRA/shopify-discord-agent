import { shopifyGraphQL } from "./shopify-client.mjs";

export async function fetchOrderByName(orderName, fields = "basic") {
  const basicFields = `
    id
    name
    createdAt
    displayFinancialStatus
    displayFulfillmentStatus
    email
    cancelledAt
    totalPriceSet { shopMoney { amount currencyCode } }
    customer { id email displayName }
    lineItems(first: 20) {
      edges {
        node { id title quantity sku }
      }
    }
  `;

  const fulfillmentFields = `
    fulfillments(first: 10) {
      status
      createdAt
      trackingInfo { number url company }
    }
    fulfillmentOrders(first: 10) {
      edges {
        node {
          id
          status
          lineItems(first: 20) {
            edges {
              node { id remainingQuantity }
            }
          }
        }
      }
    }
  `;

  const refundFields = `
    transactions(first: 10) {
      id
      kind
      status
      gateway
      amountSet { shopMoney { amount currencyCode } }
    }
  `;

  let extra = "";
  if (fields === "fulfillment" || fields === "full") extra += fulfillmentFields;
  if (fields === "refund" || fields === "full") extra += refundFields;

  const query = `
    query getOrder($query: String!) {
      orders(first: 1, query: $query) {
        edges {
          node {
            ${basicFields}
            ${extra}
          }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, { query: `name:${orderName}` });
  return data.orders?.edges?.[0]?.node ?? null;
}

export async function searchOrders({ queryParts = [], limit = 20, cursor = null }) {
  const searchQuery = queryParts.filter(Boolean).join(" ");
  const gql = `
    query searchOrders($first: Int!, $after: String, $query: String!) {
      orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            email
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { email }
          }
        }
      }
    }
  `;
  const data = await shopifyGraphQL(gql, {
    first: limit,
    after: cursor || null,
    query: searchQuery || "status:any",
  });
  return data.orders;
}

export function formatOrderSummary(order) {
  const { amount, currencyCode } = order.totalPriceSet.shopMoney;
  const customer = order.customer?.email || order.email || "N/A";
  return `${order.name} — ${amount} ${currencyCode} — ${order.displayFinancialStatus}/${order.displayFulfillmentStatus} — ${customer}`;
}