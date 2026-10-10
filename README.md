# Antom × Vercel — One-time Payment Demo

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmo-cha-lauren%2Fantom-nextjs-template&env=ANTOM_CLIENT_ID,ANTOM_PRIVATE_KEY,ANTOM_PUBLIC_KEY,ANTOM_GATEWAY_URL,NEXT_PUBLIC_ANTOM_ENV,NEXT_PUBLIC_SITE_URL&envDescription=Get%20credentials%20from%20Antom%20Dashboard&envLink=https%3A%2F%2Fgithub.com%2Fmo-cha-lauren%2Fantom-nextjs-template%23environment-variables&project-name=antom-payment-demo&repository-name=antom-payment-demo&demo-title=Antom%20Payment%20Demo&demo-description=One-time%20checkout%20storefront%20with%20Antom%20CKP%20Embedded&demo-url=https%3A%2F%2Fantom-payment-demo.vercel.app&demo-image=https%3A%2F%2Fantom-payment-demo.vercel.app%2Fimages%2Fheadphones-1.jpg)

**▲ [Original storefront demo](https://antom-payment-demo.vercel.app)** — a single-product storefront with one-time checkout via Antom CKP Embedded. This existing demo is not a deployment of the optional Airtable integration.

Accept global payments via **Antom Checkout Page (Embedded)**, powered by Next.js 14 App Router.

> ⚠️ **For demonstration purposes only.** This template is for demonstration purposes only, is not production-ready, and is provided "as-is" without warranty. To the maximum extent permitted under applicable laws, Antom assumes no liability for any losses arising from its use or deployment. By using this template, you are acknowledging and agreeing to this. See [LEGAL.md](./LEGAL.md) and [LICENSE](./LICENSE) for trademark, AML/KYC, and warranty notices.

## Features

- 100+ global payment methods via a single integration
- RSA2 (SHA256withRSA) request signing — no third-party SDK dependency
- CKP Embedded mode — checkout stays in your page
- One-click deploy to Vercel with pre-configured environment variables
- Webhook signature verification + idempotent processing

## Optional Airtable order checkout — Sandbox

This repository opens the Airtable order page at `/`; `/airtable` remains available for existing order buttons. The original product page and Embedded checkout are available at `/store`. `AIRTABLE_ENABLED=false` is the default; Airtable credentials and a database are required only when enabling the connected integration.

The Airtable flow reads an order from a merchant-owned Base, asks an authenticated merchant operator to confirm it, creates an Antom Hosted Checkout session, and saves the resulting link back to the order. Payment review stays manual. It currently supports **Sandbox only**, one merchant/Base per deployment, a server-side Airtable PAT and a persistent PostgreSQL database.

- [Install and verify the Airtable integration](docs/airtable.md)
- [Rebuild the Airtable Base from CSVs and field instructions](airtable-template/README.md)

The Base uses ordinary fields and Open URL buttons compatible with Airtable Free. The Next.js application and database run outside Airtable. Hosting and processing may have costs; [Vercel Hobby is limited to personal, non-commercial use](https://vercel.com/docs/plans/hobby). The deploy button above clones `mo-cha-lauren/antom-nextjs-template`; it does not configure the additional Airtable variables, apply the database migration or publish a Universe template.

No real Sandbox payment, independent merchant-copy acceptance, deployment or public Airtable listing is asserted by this source. Complete the linked acceptance steps before distribution. Use separate Sandbox notification configuration for Airtable and the original storefront; the [notification setup and recovery limits](docs/airtable.md#notification-configuration-and-recovery-limits) explain why they must not share an unverified merchant callback configuration.

## Architecture

```
Browser ─▶ Next.js App Router (server) ─▶ Antom Gateway (Asia)
   ▲                                            │
   └── CKP Embedded SDK (js.antom.com) ◀────────┘

Webhook: Antom Gateway ─▶ POST /api/webhooks/antom ─▶ verify + update
```

## Environment Variables

| Variable | Required | Exposed to Client | Description |
|----------|:--------:|:-----------------:|-------------|
| `ANTOM_CLIENT_ID` | ✅ | No | Merchant identifier from Antom Dashboard → Developer → Integration Settings |
| `ANTOM_PRIVATE_KEY` | ✅ | No | RSA2048 private key, single-line base64, no PEM headers |
| `ANTOM_PUBLIC_KEY` | ✅ | No | Antom platform public key for API response and webhook verification |
| `ANTOM_GATEWAY_URL` | ✅ | No | Official HTTPS gateway origin for your merchant region; see below |
| `NEXT_PUBLIC_ANTOM_ENV` | ✅ | **Yes** | `sandbox` or `prod` |
| `NEXT_PUBLIC_SITE_URL` | ✅ | **Yes** | Your deployment origin |

### Private Key Format

Must be a **single-line base64 string**, no PEM headers. Convert with:

```bash
awk 'NF{printf "%s",$0}' priv.pem | sed 's/-----[^-]*-----//g'
```

### Gateway URLs by Region

| Region | URL |
|---|---|
| Asia (default) | `https://open-sea-global.alipay.com` (recommended), or `https://open-sea.alipay.com` |
| Europe | `https://open-de-global.alipay.com` |
| North America — non-US merchants | `https://open-na-global.alipay.com` (recommended), or `https://open-na.alipay.com` |
| North America — US merchants | `https://open.antglobal-us.com` |

Select the merchant's correct online-payment gateway using [Antom's API reference](https://docs.antom.com/ac/ams/api); the server does not guess or silently substitute a region. Older example values `open-eu-global.alipay.com`, `open-us-global.alipay.com` and `open-global.alipay.com` are rejected. `ANTOM_GATEWAY_URL` must contain only the HTTPS origin. Sandbox online requests use `/ams/sandbox/api/…`; production uses `/ams/api/…`. This project's transport resolves and signs the environment-specific path before sending it. Use the matching merchant credentials as well as the correct environment value.

## Quick Start

For a local Airtable preview, no credentials, database or `.env.local` are needed:

```bash
pnpm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The default development command enables `AIRTABLE_LOCAL_PREVIEW=true` and binds to loopback. When `AIRTABLE_ENABLED` is not `true`, the page shows a synthetic order and a simulated confirmation. It does not call Airtable or Antom APIs, access a database, create a checkout link or take a payment. Preview mode is unavailable in production. The original storefront remains at `/store`.

To configure connected checkout, use the steps below for the storefront or the [Airtable setup guide](docs/airtable.md) for the order integration. `npm run dev:connected` disables the local preview; real Airtable testing still requires the documented credentials, database and publicly reachable HTTPS callback origin.

```bash
# 1. Install
pnpm install

# 2. Configure env
cp .env.example .env.local

# 3. Generate RSA key pair
openssl genpkey -algorithm RSA -out priv.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in priv.pem -pubout -out pub.pem

# 4. Convert private key to single-line, paste into ANTOM_PRIVATE_KEY
awk 'NF{printf "%s",$0}' priv.pem | sed 's/-----[^-]*-----//g'

# 5. Upload pub.pem to Antom Dashboard; download Antom platform public key
#    → paste into ANTOM_PUBLIC_KEY

# 6. Run without the synthetic Airtable preview
npm run dev:connected   # http://127.0.0.1:3000/store
```

## How It Works

1. User clicks **Pay** → frontend POSTs to `/api/create-payment-session`
2. Server signs request with RSA2, calls Antom `createPaymentSession`
3. Returns `paymentSessionData` to frontend
4. Frontend loads `ams-checkout.js` → mounts CKP Embedded
5. User completes payment inside iframe
6. SDK fires `SDK_PAYMENT_*` events (UI only, **never trust for fulfillment**)
7. Browser redirects to `/result` → server calls `inquiryPayment`
8. **In parallel**: Antom pushes webhook → server verifies RSA → updates order

## Project Structure

```
antom-nextjs-template/
├── app/
│   ├── page.tsx                       # Default Airtable order page
│   ├── store/page.tsx                 # Original inline checkout (single product)
│   ├── checkout-embedded/page.tsx     # CKP container
│   ├── result/page.tsx                # Inquiry + status
│   ├── airtable/page.tsx              # Compatible Airtable order entry
│   └── api/
│       ├── create-payment-session/    # POST: create session
│       ├── inquiry-payment/           # GET: query status
│       ├── airtable/                  # Optional authenticated order flow + separate webhook
│       └── webhooks/antom/            # POST: verify + update
├── lib/
│   ├── antom/                         # config, sign, client, types, errors
│   ├── airtable/                      # Optional Base adapter + durable payment attempts
│   └── orders/                        # store interface + memory impl
├── airtable-template/                 # Synthetic CSVs and Base rebuild guide
├── docs/airtable.md                   # Airtable configuration and acceptance
├── sql/airtable.sql                   # Required schema when enabling Airtable
├── components/                        # CheckoutFrame, InlineCheckout, Badge
├── config/                            # products, env
└── .env.example
```

## Security Checklist

- Private key is **server-only** (`import 'server-only'`)
- Private key never logged, never in client bundle
- Webhook RSA-verified before processing
- Idempotent webhook handling (by `paymentRequestId`)
- SDK events used for UI only, never for order fulfillment
- Result page uses server-side `inquiryPayment` for authority

## Deploy to Production

The steps below concern the original storefront and still require production-readiness work, including its persistence. The optional Airtable integration is Sandbox-only and rejects `NEXT_PUBLIC_ANTOM_ENV=prod`; it has no production-launch procedure in this version.

1. Generate **separate** production RSA key pair
2. Upload public key to Antom Dashboard (Production environment)
3. Update Vercel env vars (scope: Production only):
   - `ANTOM_CLIENT_ID` → production
   - `ANTOM_PRIVATE_KEY` → production
   - `ANTOM_PUBLIC_KEY` → production Antom public key
   - `NEXT_PUBLIC_ANTOM_ENV` → `prod`
4. Whitelist your custom domain in Antom Dashboard
5. Redeploy

## Persistence

The original storefront's default order store is **in-memory** (`lib/orders/memory.ts`). The optional Airtable flow separately requires PostgreSQL and [its migration](docs/airtable.md#3-prepare-persistence-and-deploy); it does not make the storefront's memory store durable. For a production storefront:

- Swap with [`@vercel/kv`](https://vercel.com/docs/storage/vercel-kv) for serverless KV
- Or any Postgres / MySQL via your ORM of choice

Replace the export in `lib/orders/memory.ts`:

```ts
export const orderStore: OrderStore = kvOrderStore; // or postgresOrderStore
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `SIGN_VERIFY_FAILURE` | Sign string mismatch | Body used for signing must equal body sent |
| Webhook returns 401 | Antom public key wrong | Re-download from Dashboard, single-line base64 |
| CKP shows blank | Session may be expired | Inspect the saved expiry and existing payment result before considering another attempt. Airtable does not automatically create a replacement session. |
| `Missing required env` | Env var not set | Check `.env.local` or Vercel Settings |

## Learn More

- [Antom Documentation](https://docs.antom.com)
- [Antom Dashboard](https://dashboard.antom.com)
- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Templates](https://vercel.com/templates)

## License & Legal

MIT — see [LICENSE](./LICENSE).

For trademark, AML/CFT/KYC, demonstration-only, and warranty notices, see [LEGAL.md](./LEGAL.md).
