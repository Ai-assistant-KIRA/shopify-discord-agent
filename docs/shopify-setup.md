# Shopify Setup

Connect your store **once** — credentials are saved to `config/.env` and loaded permanently on every start.

## One-time setup (recommended)

```bash
npm run setup
```

The wizard will:
1. Ask for your Shopify domain and Admin API token (`shpat_...`)
2. Verify the connection to your store
3. Ask for your Discord bot token
4. Save everything to **`config/.env`**

After that, `npm run docker:up` always uses the same credentials. No re-entry on restart.

To update credentials later, run `npm run setup` again or edit `config/.env` directly.

### What persists where

| Credential | Stored in | Survives `docker compose restart` | Survives `docker compose down` |
|------------|-----------|-------------------------------------|--------------------------------|
| Shopify + Discord | `config/.env` on disk | Yes | Yes |
| n8n + Vertex | Docker volume `n8n_data` | Yes | Yes |
| n8n data reset | — | — | Only if you run `docker compose down -v` |

---

## Dev store

1. Create a [Shopify Partner](https://partners.shopify.com/) account
2. Create a **development store**
3. Note the domain (e.g. `mystore.myshopify.com`)

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

## Manual config (alternative to `npm run setup`)

Copy the template and edit `config/.env`:

```bash
cp config/.env.example config/.env
```

```env
SHOPIFY_DOMAIN=mystore.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_...
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