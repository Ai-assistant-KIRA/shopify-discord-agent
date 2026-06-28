# Shopify Setup

## Dev store

1. Create a [Shopify Partner](https://partners.shopify.com/) account
2. Create a **development store**
3. Note the domain: `your-store.myshopify.com`

## Custom app and Admin API token

1. In Shopify Admin: **Settings → Apps and sales channels → Develop apps**
2. Create an app → **Configure Admin API scopes**
3. Required scopes:

   **Read (always):**
   - `read_products`, `read_inventory`, `read_orders`, `read_customers`
   - `read_discounts`, `read_draft_orders`, `read_checkouts`

   **Write (only if `SHOPIFY_READ_ONLY=false`):**
   - `write_discounts`, `write_draft_orders`, `write_orders`
   - `write_inventory`, `write_products`
   - `write_merchant_managed_fulfillment_orders` (fulfill orders)
   - `write_returns` (refunds)

4. Install the app and copy the **Admin API access token** (`shpat_...`)

## Environment

```env
SHOPIFY_DOMAIN=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxx
SHOPIFY_API_VERSION=2025-01
SHOPIFY_MOCK_MODE=false
SHOPIFY_READ_ONLY=true
```

## Verify credentials

```bash
npm run verify:shopify
```

You should see shop name, email, domain, and currency code.

## Read-only vs write mode

- `SHOPIFY_READ_ONLY=true` (default) — safe for demos; hides write tools
- `SHOPIFY_READ_ONLY=false` — enables discounts, draft orders, invoices, and inventory adjustments

High-risk inventory writes still require the user to reply `CONFIRM <token>` in Discord even in write mode.

## Token types

| Prefix | Use |
|--------|-----|
| `shpat_` | Admin API custom app token (required) |
| `shpss_` | Session token (not for server-side Admin API) |