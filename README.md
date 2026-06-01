# Antom × Vercel — One-time Payment Demo

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fant-intl%2Fantom-nextjs-template&env=ANTOM_CLIENT_ID,ANTOM_PRIVATE_KEY,ANTOM_PUBLIC_KEY,ANTOM_GATEWAY_URL,NEXT_PUBLIC_ANTOM_ENV,NEXT_PUBLIC_SITE_URL&envDescription=Get%20credentials%20from%20Antom%20Dashboard&envLink=https%3A%2F%2Fgithub.com%2Fant-intl%2Fantom-nextjs-template%23environment-variables&project-name=antom-payment-demo&repository-name=antom-payment-demo)

Accept global payments via **Antom Checkout Page (Embedded)**, powered by Next.js 14 App Router.

## Features

- 100+ global payment methods via a single integration
- RSA2 (SHA256withRSA) request signing — no third-party SDK dependency
- CKP Embedded mode — checkout stays in your page
- One-click deploy to Vercel with pre-configured environment variables
- Webhook signature verification + idempotent processing

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
| `ANTOM_PUBLIC_KEY` | ✅ | No | Antom platform public key for webhook verification |
| `ANTOM_GATEWAY_URL` | ✅ | No | `https://open-sea-global.alipay.com` (Asia) |
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
| Asia (default) | `https://open-sea-global.alipay.com` |
| Europe | `https://open-eu-global.alipay.com` |
| Americas | `https://open-us-global.alipay.com` |
| Global | `https://open-global.alipay.com` |

## Quick Start

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

# 6. Run
pnpm dev   # http://localhost:3000
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
│   ├── page.tsx                       # Inline checkout (single product)
│   ├── checkout-embedded/page.tsx     # CKP container
│   ├── result/page.tsx                # Inquiry + status
│   └── api/
│       ├── create-payment-session/    # POST: create session
│       ├── inquiry-payment/           # GET: query status
│       └── webhooks/antom/            # POST: verify + update
├── lib/
│   ├── antom/                         # config, sign, client, types, errors
│   └── orders/                        # store interface + memory impl
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

The default order store is **in-memory** (`lib/orders/memory.ts`). For production:

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
| CKP shows blank | Session expired (~30 min) | Create a new session |
| `Missing required env` | Env var not set | Check `.env.local` or Vercel Settings |

## Learn More

- [Antom Documentation](https://docs.antom.com)
- [Antom Dashboard](https://dashboard.antom.com)
- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Templates](https://vercel.com/templates)

## License

MIT
