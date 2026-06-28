# Architecture

## Overview

This project connects Discord chat to a Shopify store through three components:

1. **Discord bridge** (`scripts/discord-bridge.mjs`) — forwards user messages to n8n
2. **n8n workflow** (`n8n-workflows/discord-shopify-mcp-agent.json`) — AI agent orchestration
3. **Shopify MCP server** (`shopify-mcp-server.mjs`) — exposes Shopify Admin API as MCP tools

## MCP tools (28 total in write mode)

| Tool | Type | Risk |
|------|------|------|
| `get_inventory_by_sku` | Read | — |
| `search_products` | Read | — |
| `get_daily_orders` | Read | — |
| `get_revenue_summary` | Read | — |
| `get_revenue_by_period` | Read | — |
| `get_order_by_name` | Read | — |
| `search_orders` | Read | — |
| `get_fulfillment_status` | Read | — |
| `list_discount_codes` | Read | — |
| `list_draft_orders` | Read | — |
| `get_low_stock_products` | Read | — |
| `list_inventory_by_location` | Read | — |
| `search_customers` | Read | — |
| `get_customer_orders` | Read | — |
| `get_abandoned_checkouts` | Read | — |
| `confirm_pending_write` | Read | — |
| `shopify_graphql_query` | Read | — |
| `create_discount_code` | Write | low |
| `deactivate_discount_code` | Write | low |
| `create_draft_order` | Write | low |
| `send_draft_order_invoice` | Write | low |
| `resend_order_invoice` | Write | low |
| `update_inventory_quantity` | Write | **high** |
| `fulfill_order` | Write | **high** |
| `cancel_order` | Write | **high** |
| `create_refund` | Write | **high** |
| `set_variant_price` | Write | **high** |
| `set_product_status` | Write | **high** |

## Write safety tiers

- **Low-risk** — discounts, draft orders, invoices: execute immediately.
- **High-risk** — inventory, fulfillment, cancel, refund, pricing, publish: return `CONFIRM <token>`; user replies and agent calls `confirm_pending_write`.

## Layout

```
shopify-discord-agent/
├── shopify-mcp-server.mjs
├── lib/          # client, mock, registry, order-helpers, variant-resolver
└── tools/        # inventory, orders, order-ops, merchandising, customers, ...
```