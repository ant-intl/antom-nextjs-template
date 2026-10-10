# Airtable order checkout

The repository opens the Airtable merchant order-confirmation page at `/`; `/airtable` remains available for existing order buttons. The original storefront remains available at `/store`. The connected integration is disabled by default and currently supports **Antom Sandbox only**. This source change is not a published Airtable template or evidence of a completed live integration.

The flow is:

```text
Airtable Orders → merchant sign-in and confirmation → Antom Hosted Checkout
       ↑                      Next.js server                 │
       └──────── saved checkout link and session details ───┘
```

Airtable hosts the Base, fields and buttons. Deploy this Next.js application **outside Airtable**, with a persistent PostgreSQL database. Neither a Universe listing nor a Base copy deploys an application or supplies payment credentials. GitHub is an optional source/distribution channel; it is not part of the payment request path.

## Local preview

After installing dependencies, run `npm run dev` and open [http://127.0.0.1:3000](http://127.0.0.1:3000). No credentials, database or `.env.local` are needed. The development command enables `AIRTABLE_LOCAL_PREVIEW=true` and listens on loopback by default. The preview is available only in development while `AIRTABLE_ENABLED` is not `true`.

The page displays a synthetic order and lets you simulate confirmation. It does not call Airtable or Antom APIs, access PostgreSQL, create a checkout link or take a payment. Its result is a UI preview, not a saved order or a Sandbox payment. Production builds never enable this preview.

Use `npm run dev:connected` to disable the preview and debug the connected flow after completing the configuration below. Real Airtable testing still requires a publicly reachable HTTPS origin for callbacks, the merchant's Sandbox configuration, a private Base and PostgreSQL. The original storefront can be opened separately at `/store`.

## Scope and ownership

- One deployment belongs to one merchant and connects to one configured Airtable Base and Orders table. This is not a shared, multi-merchant service.
- The deployment operator manages its hosting, database, Antom configuration and Airtable token. Every adopting merchant supplies their own configuration; never share a publisher's credentials.
- A signed-in checkout operator can process every order in the configured table. The shared operator password is **not Airtable OAuth or the user's Airtable identity**, and it does not provide per-user roles or attribution. Give it only to authorized merchant operators.
- People with write access to the Base are trusted to author order descriptions, amounts, currencies and buyer details. Field hiding, views and editable select values do not enforce prices. If that trust model is inappropriate, do not enable this integration; use a separate authoritative order/pricing source first.
- The database retains frozen order snapshots and payment attempts. It is required even on serverless hosting; local memory and deployment files are not a substitute.
- Payment review remains manual. Session creation, checkout navigation and browser returns never mark an order paid. No automatic fulfillment, refunds, capture requests or payment-result synchronization into the review table are supplied.

## 1. Prepare a private Airtable Base

Create your own Base and follow [the template guide](../airtable-template/README.md). Import both CSVs and configure the exact field types in [field-guide.md](../airtable-template/field-guide.md). CSV import alone does not install buttons, select options, defaults or views.

Keep **Start checkout** at `BLANK()` while configuring the application. All supplied rows are synthetic, and all session and review outputs are blank. Do not copy real customer data or credentials into a public template.

Create a server-side [Airtable personal access token](https://support.airtable.com/docs/creating-personal-access-tokens) with only `data.records:read` and `data.records:write`, restricted to this Base. The token owner must also have the necessary Base permissions. Save the Base ID and Orders table ID in deployment configuration. Copies have different IDs; never retain the publisher's Base/table binding.

The application uses a fixed Base and table from its configuration. It does not accept arbitrary Base IDs, table IDs or Airtable URLs from the browser. It does not need access to the manual Payment review table through a separate API route.

## 2. Configure the application

Install dependencies using the repository's package manager and lockfile. Copy `.env.example` to a local, ignored `.env.local` for development, or use your host's server-side environment settings for a deployed instance. Never commit populated environment files.

The existing Antom variables are required for payment requests: `ANTOM_CLIENT_ID`, `ANTOM_PRIVATE_KEY`, `ANTOM_PUBLIC_KEY`, `ANTOM_GATEWAY_URL`, `NEXT_PUBLIC_ANTOM_ENV` and `NEXT_PUBLIC_SITE_URL`. Use your own Sandbox merchant configuration and Antom platform public key. Verify the correct regional gateway and Sandbox configuration with Antom; changing a browser environment label does not turn production credentials into Sandbox credentials. Do not reuse the public Demo's merchant configuration.

Configure these additions:

| Variable | Value or responsibility |
| --- | --- |
| `AIRTABLE_ENABLED` | `false` by default. Set `true` only after configuring the remaining values and database. |
| `AIRTABLE_PAT` | Server-only personal access token restricted to the intended Base. |
| `AIRTABLE_BASE_ID` | Your private Base's `app…` ID. |
| `AIRTABLE_TABLE_ID` | That Base's Orders table `tbl…` ID. |
| `AIRTABLE_DATABASE_URL` | Server-only PostgreSQL connection string for durable snapshots and attempts. Use your database provider's required TLS configuration. |
| `AIRTABLE_OPERATOR_PASSWORD` | Unique, randomly generated password of at least 32 characters, supplied privately to authorized merchant operators. Do not reuse their Airtable passwords. |
| `AIRTABLE_SESSION_SECRET` | Separate random secret of at least 32 characters for operator sessions. Do not reuse the operator password or Antom key. |
| `AIRTABLE_ALLOWED_CURRENCIES` | Comma-separated currencies explicitly permitted for this merchant and Sandbox test, such as `USD,EUR`. This setting does not establish Antom eligibility. |
| `AIRTABLE_TRUST_BASE_EDITORS` | Set `true` only after accepting the trusted-price-author model described above. |
| `AIRTABLE_CHECKOUT_HOSTS` | Comma-separated, exact Antom checkout hostnames confirmed for your integration. No schemes, paths, wildcard domains or publisher sample hostnames. Obtain these from the documented/approved Antom checkout environment; do not accept arbitrary response domains. |
| `NEXT_PUBLIC_ANTOM_ENV` | Must be `sandbox` for this optional Airtable integration. |
| `NEXT_PUBLIC_SITE_URL` | Your deployed application's HTTPS origin, with no path or query. Set it before configuring callbacks and the Airtable button. |
| `ANTOM_DEFAULT_CURRENCY` | Merchant-supported settlement currency for the session request's `settlementStrategy`; defaults to `USD` only if omitted. Verify that the chosen value matches the merchant contract. |

Only the variables already prefixed `NEXT_PUBLIC_` are intended for client visibility. Keep Antom private keys, Airtable tokens, database credentials, operator password and session secret exclusively on the server. No credential belongs in an Airtable field, button URL, browser storage or screenshots.

The current session request intentionally does not reuse the storefront's sample buyer. Optional **Buyer ID**, **Buyer first name**, **Buyer last name** and **Buyer email** come from the order when present. Some payment methods, regions or merchant configurations require additional buyer/order information or a particular settlement configuration. Check the [createPaymentSession contract](https://docs.antom.com/ac/ams/session_cashier) against the selected Sandbox method before running it; the CSV is not a universal payment-method schema.

## 3. Prepare persistence and deploy

Provision PostgreSQL appropriate for the selected host, including connection limits and backups. The migration script reads `AIRTABLE_DATABASE_URL` from the process environment; it does **not** automatically read `.env.local`. Inject the same database connection value used by the deployment into the migration process through your hosting tools or secret manager, then apply the supplied migration:

```bash
npm run airtable:migrate
```

Do not put a literal connection string into a copied command, shared terminal output or shell history. Supplying `.env.local` to the Next.js application alone does not configure this standalone migration command.

The schema is [sql/airtable.sql](../sql/airtable.sql). Retain the database across deployments. Never erase attempt records to recover a checkout or restore a stale database that could lose an in-flight payment. Set up access controls and a retention policy for merchant/buyer information.

Deploy the Next.js project to an environment that supports its server routes and PostgreSQL connection. Vercel is one option, not a requirement. An Airtable Free Base does not make application hosting, database hosting or Antom processing free. Check your hosting provider's commercial-use terms and costs; [Vercel Hobby is for personal, non-commercial use](https://vercel.com/docs/plans/hobby).

Use the deployed HTTPS origin as `NEXT_PUBLIC_SITE_URL`. The Airtable flow uses **`/api/airtable/webhooks/antom`** on that origin for Antom notifications, separate from the original storefront's notification handler. The session request sets this Airtable-specific callback. Confirm publicly reachable callbacks with your own Sandbox merchant, including any required Dashboard configuration. Do not point them at a documentation URL, localhost, the publisher's deployment, or the original storefront's notification/result route.

Open `/` or `/airtable` on your deployment. A disabled or incomplete configuration must not expose an active checkout. Once configuration and migration are complete, sign in with the operator password. The page should ask you to open an order from Airtable. Sign-in uses a server-set session cookie; the password is cleared from the form and is not stored in browser storage or a URL.

### Notification configuration and recovery limits

For card payments, both payment/authorization and capture notifications must reach the deployed **`/api/airtable/webhooks/antom`** receiver. Non-card payments such as Alipay use PAYMENT_RESULT without a separate CAPTURE_RESULT. The request already supplies paymentNotifyUrl; Dashboard setup is not mandatory unless an existing capture override needs correcting. In particular, a configured Dashboard capture URL takes precedence over the URL supplied by the session API; it must point to the Airtable receiver for the Sandbox merchant configuration used here. Without a separate Dashboard override, capture can use the order's `paymentNotifyUrl`. See [Antom's capture-notification setup](https://docs.antom.com/ac/cashierpay/capture).

The original storefront's `/api/webhooks/antom` receiver and this integration's receiver have separate order stores. This version does not route notifications between them. Use a dedicated Sandbox merchant/application configuration with independently configured notification settings for Airtable. Do not concurrently run the original Demo and Airtable against the same merchant callback configuration unless notification routing has been separately implemented and tested; changing a merchant-wide capture URL can otherwise send one flow's events to the other flow.

Antom documents that Sandbox does **not resend** an asynchronous notification when the receiver returns an acknowledgement in the wrong format. An error response cannot be treated as a recovery mechanism. Verify callback reachability and successful acknowledgement before relying on recorded evidence. See [payment notifications](https://docs.antom.com/ac/ams/paymentrn_online) and [capture notifications](https://docs.antom.com/ac/ams/notify_capture).

This first version associates capture events with a payment ID already recorded from a verified payment notification. If capture arrives first, or that payment mapping is missing, the receiver returns **HTTP 409** and does not invent the association. It does not queue unmatched capture events or automatically query/recover them. A deployment administrator must investigate the existing attempt, check Antom Dashboard or perform an authoritative payment/capture inquiry through the merchant's approved tooling, and record the manual outcome. Do not create another payment to recover a missing notification. Full-amount evidence is supported; partial capture and ambiguous identity/amount events also need manual investigation.

## 4. Enable the order button

After the deployed page is reachable and authenticated, replace the disabled formula with your **own verified deployment origin**. In this example, replace the entire placeholder host before use:

```text
"https://YOUR-DEPLOYMENT.example/airtable?recordId=" & ENCODE_URL_COMPONENT(RECORD_ID())
```

The only order locator in this URL is the Airtable record ID. Do not add amounts, currencies, tokens or keys. A record ID is not authorization. The server authenticates the operator, reads the configured table, validates the order, and confirms the snapshot again before making a payment request.

Click **Start checkout** on a synthetic order. Merely loading the page is read-only. Compare the displayed order reference, description, amount and currency with the intended Sandbox order, check the confirmation box, and explicitly select **Confirm and create checkout**.

On success, the server saves the verified Antom session and writes **Checkout URL**, **Payment request ID**, **Payment session ID**, **Session expires at** and **Checkout state** to the same order. The checkout URL is the returned `normalUrl`; it is not a merchant-entered Payment Link. It is validated against the configured permitted hostnames and delivered without adding parameters.

## 5. Verify the full flow before distribution

Use your own authorized Sandbox configuration and record actual evidence for each check. Static tests or a successful build are not evidence of a completed Antom payment or an Airtable Free account test.

1. Keep `AIRTABLE_ENABLED=false` and run `npm run dev:connected` or a production build. Verify that the existing product page at `/store` and original checkout still work, and that the connected Airtable flow is unavailable at `/` and `/airtable`.
2. Enable and configure the integration. Check unauthenticated order access, invalid passwords and sign-out. A record ID alone must not grant access or create a payment.
3. Import an order in an actual Free workspace. Verify the correct currency minor-unit display, including a supported currency with a different decimal scale if available for the merchant.
4. Confirm once, then repeat/concurrently submit the same order. A valid saved attempt must be reused; retries must not create extra sessions.
5. Change the amount or description after viewing the confirmation. The old fingerprint must be rejected, and the operator must reload and reconfirm the order. Changes after a payment attempt must require investigation, not a new automatic payment.
6. Exercise response timeout, invalid response signature, unknown result, expired session and writeback failure. A failed Airtable update must preserve the existing payment session. Use **Retry saving to Airtable** to save the same session; never recover by creating another checkout.
7. Complete an authorized Sandbox payment and inspect the verified notification evidence. For cards, verify both payment and capture callback destinations, acknowledgement behavior and the capture-before-payment recovery limitation above. Returning to the page is not proof of payment. Check the transaction and, where applicable, successful capture in Antom, then record the human review in Airtable.
8. Copy the Base into an independent merchant test workspace. Rebind the deployment to that copy's Base/table IDs and scoped token. Repeat the flow without any publisher credentials or private setup knowledge.

No real payment, public deployment, independent-copy acceptance or Universe publication is established by adding this source. Those checks remain separate release steps.

## Operating and recovering an order

| Situation | Operator action |
| --- | --- |
| Order is ready for confirmation and has no attempt | Check its details and explicitly create checkout once. |
| A valid checkout is saved | Reopen the same link. Refreshing the order does not create a new session. |
| Link ready, Airtable update pending | Select **Retry saving to Airtable**. The server keeps the same stored session. |
| Request is still creating, unknown, expired, rejected or needs review | Check the saved attempt and authoritative Antom result. No automatic new payment attempt is offered. |
| Browser returned from Antom | Perform the manual review; the return page cannot establish payment success. |
| Order details changed after an attempt | Investigate and reconcile that attempt. Do not delete the database record or change Order ID to bypass it. |

Antom's Hosted Checkout guidance can require a new `paymentRequestId` after an unknown/no-response outcome. A different ID does not itself prevent double collection. This implementation deliberately stops for investigation and does not expose a generic retry-new-session action. Reconcile and document the original attempt before any separately reviewed retry implementation.

For final manual review, match the merchant/order/payment reference, amount and currency with the authoritative Antom transaction. For authorization-and-capture methods, authorization alone is insufficient; require successful capture. Record the evidence in **Payment review**. Keep uncertain outcomes pending or under investigation. Manual review does not remove the need for correctly configured and verified notifications.

## Publishing and updates

Distribute the two parts together: an Airtable Base/template and this deployable application with its installation guide. The Base alone cannot create Antom sessions. Until a tested Universe listing exists, distribute the CSV rebuild guide as a draft rather than claiming an available one-click Airtable template.

Publish only synthetic rows with blank checkout URLs, Antom identifiers, buyer data and review evidence. Each merchant must deploy/configure their own application and bind their own private Base. Specify the tested application version alongside the template version. Base copies and deployed application copies do not update automatically; review migrations and release changes while preserving order history.

References: [Airtable buttons](https://support.airtable.com/docs/button-field), [Airtable API limits](https://support.airtable.com/docs/managing-api-call-limits-in-airtable), [Antom Hosted Checkout](https://docs.antom.com/ac/cashierpay/HOSTEDCKP), [Antom signatures](https://docs.antom.com/ac/ams/digital_signature). Airtable quotas still apply to manual refreshes and writebacks; the UI does not poll the API for payment status.

## Automatic payment results (template upgrade)

Add **Payment result**, **Capture result**, and **Antom payment ID** as single-line text fields to Orders, initially blank. Deploy the updated backend; no database migration or extra PAT scopes are required. Notifications first persist verified evidence, then synchronize the latest results to these fields and clear Checkout URL. Per-attempt PostgreSQL locks serialize session/payment projections and evidence changes so delayed notifications cannot downgrade success. Manual Payment review stays separate.

The order page shows the saved payment/capture result. **Sync payment result to Airtable** is an authenticated, CSRF-protected POST that can backfill older verified events or retry a failed table write. It never calls Antom or creates a new attempt. GET/Refresh order remains read-only. A schema/permission/quota failure retains evidence and returns an error; fix the cause and use this sync action rather than relying on Sandbox notification retries. Changed order snapshots block automatic writes. An unsuccessful capture is shown separately from payment authorization success.

`Capture result = Not received` is not a failure. [Antom distinguishes non-card PAYMENT_RESULT from card PAYMENT_RESULT plus CAPTURE_RESULT](https://docs.antom.com/ac/questions/pay). This template does not infer fulfillment readiness from a payment authorization or initiate capture/refunds.
