import { log } from "./logger.mjs";

const MOCK_VARIANT = {
  id: "gid://shopify/ProductVariant/43729076",
  title: "Premium Cotton Merchant Tee - Black / M",
  sku: "SKU-123",
  price: "29.99",
  product: { id: "gid://shopify/Product/123456", title: "Premium Cotton Merchant Tee" },
  inventoryItem: {
    id: "gid://shopify/InventoryItem/4567890",
    inventoryLevels: {
      edges: [
        {
          node: {
            quantities: [{ name: "available", quantity: 42 }],
            location: { id: "gid://shopify/Location/123456", name: "Main Warehouse" },
          },
        },
      ],
    },
  },
};

function mockOrderNode(orderName, query = "") {
  const node = {
    id: "gid://shopify/Order/17181286",
    name: orderName,
    createdAt: new Date().toISOString(),
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "UNFULFILLED",
    email: "customer@example.com",
    cancelledAt: null,
    totalPriceSet: { shopMoney: { amount: "150.00", currencyCode: "USD" } },
    customer: { id: "gid://shopify/Customer/1", email: "customer@example.com", displayName: "Jane Doe" },
    lineItems: {
      edges: [
        {
          node: {
            id: "gid://shopify/LineItem/1",
            title: "Premium Cotton Merchant Tee",
            quantity: 2,
            sku: "SKU-123",
          },
        },
      ],
    },
  };

  if (query.includes("fulfillmentOrders") || query.includes("fulfillments")) {
    node.fulfillments = [];
    node.fulfillmentOrders = {
      edges: [
        {
          node: {
            id: "gid://shopify/FulfillmentOrder/1",
            status: "OPEN",
            lineItems: {
              edges: [{ node: { id: "gid://shopify/FulfillmentOrderLineItem/1", remainingQuantity: 2 } }],
            },
          },
        },
      ],
    };
  }

  if (query.includes("transactions")) {
    node.transactions = [
      {
        id: "gid://shopify/OrderTransaction/1",
        kind: "SALE",
        status: "SUCCESS",
        gateway: "shopify_payments",
        amountSet: { shopMoney: { amount: "150.00", currencyCode: "USD" } },
      },
    ];
  }

  return node;
}

export function getMockData(query, variables) {
  log("debug", "Mock GraphQL query", { variables });

  if (query.includes("fulfillmentCreate")) {
    return {
      fulfillmentCreate: {
        fulfillment: {
          id: "gid://shopify/Fulfillment/1",
          status: "SUCCESS",
          trackingInfo: variables.fulfillment?.trackingInfo
            ? [variables.fulfillment.trackingInfo]
            : [],
        },
        userErrors: [],
      },
    };
  }

  if (query.includes("orderCancel")) {
    return {
      orderCancel: {
        job: { id: "gid://shopify/Job/1", done: true },
        orderCancelUserErrors: [],
      },
    };
  }

  if (query.includes("refundCreate")) {
    return {
      refundCreate: {
        refund: { id: "gid://shopify/Refund/1", createdAt: new Date().toISOString() },
        userErrors: [],
      },
    };
  }

  if (query.includes("productVariantUpdate")) {
    return {
      productVariantUpdate: {
        productVariant: {
          id: MOCK_VARIANT.id,
          sku: variables.input?.sku || MOCK_VARIANT.sku,
          price: variables.input?.price || "29.99",
          product: { title: MOCK_VARIANT.product.title },
        },
        userErrors: [],
      },
    };
  }

  if (query.includes("productUpdate")) {
    return {
      productUpdate: {
        product: {
          id: "gid://shopify/Product/123456",
          title: "Premium Cotton Merchant Tee",
          status: variables.input?.status || "ACTIVE",
        },
        userErrors: [],
      },
    };
  }

  if (query.includes("shop {") && query.includes("currencyCode")) {
    return { shop: { currencyCode: "USD" } };
  }

  if (query.includes("customers(")) {
    return {
      customers: {
        edges: [
          {
            node: {
              id: "gid://shopify/Customer/1",
              email: "customer@example.com",
              displayName: "Jane Doe",
              numberOfOrders: 3,
              amountSpent: { amount: "450.00", currencyCode: "USD" },
            },
          },
        ],
      },
    };
  }

  if (query.includes("abandonedCheckouts")) {
    return {
      abandonedCheckouts: {
        edges: [
          {
            node: {
              id: "gid://shopify/AbandonedCheckout/1",
              createdAt: new Date().toISOString(),
              abandonedCheckoutUrl: "https://checkout.shopify.com/mock-recover",
              email: "guest@example.com",
              totalPriceSet: { shopMoney: { amount: "59.98", currencyCode: "USD" } },
            },
          },
        ],
      },
    };
  }

  if (query.includes("locations(") && !query.includes("location(id")) {
    return {
      locations: {
        edges: [{ node: { id: "gid://shopify/Location/123456", name: "Main Warehouse" } }],
      },
    };
  }

  if (query.includes("location(id")) {
    return {
      location: {
        name: "Main Warehouse",
        inventoryLevels: {
          edges: [
            {
              node: {
                quantities: [{ name: "available", quantity: 42 }],
                item: {
                  sku: "SKU-123",
                  variant: { product: { title: "Premium Cotton Merchant Tee" } },
                },
              },
            },
            {
              node: {
                quantities: [{ name: "available", quantity: 5 }],
                item: {
                  sku: "SKU-456",
                  variant: { product: { title: "Low Stock Beanie" } },
                },
              },
            },
          ],
        },
      },
    };
  }

  if (query.includes("productVariants")) {
    const sku = variables.query?.replace("sku:", "") || "SKU-123";
    return {
      productVariants: {
        edges: [{ node: { ...MOCK_VARIANT, sku: sku.replace("sku:", "") || MOCK_VARIANT.sku } }],
      },
    };
  }

  if (query.includes("products(")) {
    const lowStockSecond = {
      id: "gid://shopify/Product/789",
      title: "Low Stock Beanie",
      status: "ACTIVE",
      totalInventory: 5,
      variants: { edges: [{ node: { id: "gid://shopify/ProductVariant/789", sku: "SKU-456", price: "19.99" } }] },
    };
    return {
      products: {
        edges: [
          {
            node: {
              id: "gid://shopify/Product/123456",
              title: "Premium Cotton Merchant Tee",
              status: "ACTIVE",
              totalInventory: 42,
              variants: { edges: [{ node: { id: MOCK_VARIANT.id, sku: "SKU-123", price: "29.99" } }] },
            },
          },
          { node: lowStockSecond },
        ],
      },
    };
  }

  if (query.includes("codeDiscountNodes")) {
    return {
      codeDiscountNodes: {
        edges: [
          {
            node: {
              id: "gid://shopify/DiscountCodeNode/11223344",
              codeDiscount: {
                title: "SAVE15",
                summary: "15% off all items",
                status: "ACTIVE",
                codes: { edges: [{ node: { code: "SAVE15", usageCount: 3 } }] },
              },
            },
          },
        ],
      },
    };
  }

  if (query.includes("draftOrders")) {
    return {
      draftOrders: {
        edges: [
          {
            node: {
              id: "gid://shopify/DraftOrder/1069920508",
              name: "#D1001",
              email: "test.user@shopify.com",
              createdAt: new Date().toISOString(),
              status: "OPEN",
              totalPrice: "59.98",
              invoiceUrl: "https://checkout.shopify.com/mock-invoice",
            },
          },
        ],
      },
    };
  }

  if (query.includes("searchOrders") || (query.includes("orders(") && query.includes("pageInfo"))) {
    const edges = [
      { node: mockOrderNode("#1001", query) },
      {
        node: {
          ...mockOrderNode("#1002", query),
          totalPriceSet: { shopMoney: { amount: "89.99", currencyCode: "USD" } },
        },
      },
    ];
    return {
      orders: {
        pageInfo: { hasNextPage: false, endCursor: "mock-cursor-end" },
        edges,
      },
    };
  }

  if (query.includes("orders")) {
    const orderName = variables.query?.match(/name:(#\w+)/)?.[1] || "#1001";
    const edges = variables.query?.includes("name:")
      ? [{ node: mockOrderNode(orderName, query) }]
      : [
          { node: mockOrderNode("#1001", query) },
          {
            node: {
              ...mockOrderNode("#1002", query),
              totalPriceSet: { shopMoney: { amount: "89.99", currencyCode: "USD" } },
            },
          },
          {
            node: {
              ...mockOrderNode("#1003", query),
              totalPriceSet: { shopMoney: { amount: "45.50", currencyCode: "USD" } },
            },
          },
        ];
    return { orders: { edges } };
  }

  if (query.includes("discountCodeBasicCreate")) {
    return {
      discountCodeBasicCreate: {
        codeDiscountNode: {
          id: "gid://shopify/DiscountCodeNode/11223344",
          codeDiscount: {
            title: variables.basicCodeDiscount?.title || "MOCK DISCOUNT",
            summary: "15% off all items",
          },
        },
        userErrors: [],
      },
    };
  }

  if (query.includes("discountCodeDeactivate")) {
    return {
      discountCodeDeactivate: {
        codeDiscountNode: { id: variables.id },
        userErrors: [],
      },
    };
  }

  if (query.includes("draftOrderCreate")) {
    return {
      draftOrderCreate: {
        draftOrder: {
          id: "gid://shopify/DraftOrder/1069920508",
          name: "#D1001",
          totalPrice: "59.98",
          invoiceUrl: "https://checkout.shopify.com/mock-invoice",
          status: "OPEN",
        },
        userErrors: [],
      },
    };
  }

  if (query.includes("draftOrderInvoiceSend")) {
    return {
      draftOrderInvoiceSend: {
        draftOrder: { id: variables.id },
        userErrors: [],
      },
    };
  }

  if (query.includes("orderInvoiceSend")) {
    return {
      orderInvoiceSend: {
        order: { id: variables.id },
        userErrors: [],
      },
    };
  }

  if (query.includes("inventoryAdjustQuantities")) {
    return {
      inventoryAdjustQuantities: {
        inventoryAdjustmentGroup: { createdAt: new Date().toISOString() },
        userErrors: [],
      },
    };
  }

  return {};
}