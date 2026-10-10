# Fields, buttons and views

Create the two tables below with the exact field names. CSV import does not install formulas, default values, select options, buttons or views. The application connects to the Orders table ID configured on its server.

## Orders

| Field | Airtable type | Meaning |
| --- | --- | --- |
| Order ID | Single line text; primary field | Unique merchant order reference. Distinct from Airtable `RECORD_ID()` and an Antom payment request ID. Keep it stable across the life of the order. |
| Description | Long text | Description shown to the operator before session creation. |
| Amount minor | Number; integer precision | Positive integer in the currency's smallest unit. For example, 2500 USD is USD 25.00. It is not a decimal display amount. |
| Currency | Single line text | Uppercase currency code permitted by the deployment and the merchant's Antom configuration. |
| Checkout state | Single select | **Not configured**, **Ready to confirm**, **Creating**, **Session ready**, **Needs investigation**, **Expired**, **Rejected**. Default **Not configured** until setup is complete. These are application session states, not proof of payment. |
| Checkout URL | URL | Server output from a verified, permitted Antom `normalUrl`. Initially blank. Do not enter a static Payment Link. |
| Payment request ID | Single line text | Server-generated identifier for the saved attempt. Initially blank. The database, not this cell, retains complete attempt history. |
| Payment session ID | Single line text | Verified Antom session identifier. Initially blank. |
| Session expires at | Date; include time | Verified Antom session expiry. Use a consistent display timezone. Initially blank. |
| Payment result | Single line text | Verified PAYMENT_RESULT: Success, Failed or Processing. Blank before notifications. For cards, Success can mean authorization; check Capture result. |
| Capture result | Single line text | Verified CAPTURE_RESULT: Success, Failed, Processing or Not received. Not received is not a failure; non-card methods such as Alipay do not require a separate capture notification. |
| Antom payment ID | Single line text | Payment identity from the verified notification, automatically filled by the backend. |
| Last error | Long text | Sanitized operational description. Initially blank. Never paste credentials or raw gateway payloads. |
| Buyer ID | Single line text; optional | The actual merchant's buyer identifier when required for the selected method. Initially blank. No Demo buyer is injected. |
| Buyer first name | Single line text; optional | Actual buyer given name when applicable. Initially blank. |
| Buyer last name | Single line text; optional | Actual buyer family name when applicable. Initially blank. |
| Buyer email | Email; optional | Actual buyer email when applicable. Initially blank. |

Use only the buyer information needed for the selected payment method, and keep it in private merchant copies. Empty buyer fields omit the buyer object. Some methods require buyer fields or other information beyond this template; validate the selected method against the [Antom API contract](https://docs.antom.com/ac/ams/session_cashier) before testing it.

Order inputs are loaded and validated on the server, then frozen with a fingerprint for confirmation. Base writers are trusted price authors in this version. Do not grant untrusted users edit access and assume hidden fields, views or the button can protect the price. Editing Checkout state or a URL cell cannot change the server's saved payment attempt or prove payment.

## Start checkout

Add a **Button** field named **Start checkout**, choose **Open URL**, and use:

```text
BLANK()
```

Leave this disabled during setup. After completing [the application guide](../docs/airtable.md), replace the placeholder in the following formula with the exact HTTPS origin of **your own tested deployment**:

```text
"https://YOUR-DEPLOYMENT.example/airtable?recordId=" & ENCODE_URL_COMPONENT(RECORD_ID())
```

Do not use the placeholder as a destination. Do not point the button at the Antom API, documentation, public Demo or another merchant's application. Pass only the record ID; never append amount, currency, buyer details, passwords, keys or tokens.

The button only opens an authenticated confirmation page. Opening it or refreshing the order never creates a payment. The operator must check the order and explicitly create checkout. A saved valid checkout is reused; unknown or expired attempts require review and do not produce an automatic new attempt.

If saving the returned link to Airtable fails, use **Retry saving to Airtable** in the application. It saves the same persisted session. Do not clear order history or create another payment to recover a table update.

## Open checkout (optional)

A separate Open URL button named **Open checkout** can open a saved link:

```text
IF(
  {Session expires at},
  IF(
    AND(
      {Checkout state} = "Session ready",
      LEN({Checkout URL}) > 8,
      LEFT(LOWER({Checkout URL}), 8) = "https://",
      IS_AFTER({Session expires at}, NOW())
    ),
    {Checkout URL},
    BLANK()
  ),
  BLANK()
)
```

All supplied examples yield no destination. This formula is a convenience check only: it does not enforce host permissions, authorize operators, detect payment status or reliably track expiry because formula refresh can lag. The server is authoritative. Reopening **Start checkout** reads the current saved state before presenting the link; use that path whenever a status is uncertain.

Suggested grid views: **All orders** (no filter), **Needs setup** (Not configured), **Ready to confirm** (Ready to confirm), **Sessions ready** (Session ready), **Needs investigation** (Needs investigation), **Expired or rejected** (Expired OR Rejected). Filters are not payment verification or security controls.

## Payment review

| Field | Airtable type | Meaning |
| --- | --- | --- |
| Review ID | Single line text; primary field | Unique reference for this human review. |
| Order ID | Single line text | Matching merchant order reference from Orders. Check the association manually. |
| Antom payment ID | Single line text | Exact identifier from the authoritative Antom transaction. Initially blank. |
| Amount checked | Number; appropriate decimal precision | Display amount checked against Antom evidence. Unlike Amount minor, USD 25.00 is recorded as 25.00. Initially blank. |
| Currency | Single line text | Currency of the checked transaction. Initially blank. Do not aggregate amounts across currencies. |
| Review status | Single select | **Pending review**, **Verified paid**, **Verified unpaid**, **Needs investigation**. Default **Pending review**. |
| Verification source | Long text | Identifying reference for the checked transaction/report. No credentials or unnecessary buyer/payment details. |
| Verified at | Date; include time | When the check was completed. Initially blank. |
| Verified by | Single line text | Merchant-chosen reviewer identifier. Initially blank. A collaborator field is not required. |
| Notes | Long text | Matching evidence, capture result if applicable, discrepancies or follow-up. |

The application does not automatically update this table. Mark **Verified paid** only after matching order/payment identity, amount, currency and the relevant final transaction result in Antom. For authorization-and-capture methods, confirm successful capture. **Verified unpaid** requires an authoritative final unsuccessful outcome for the intended payment; no record, an expired link or a timeout alone is insufficient. Keep uncertainty pending or under investigation.

Suggested grid views: **All reviews**, **Pending review**, **Needs investigation**, **Verified paid** and **Verified unpaid**, filtered by the corresponding status except All reviews.

## Check a copied Base

1. Verify field names and types, select options and defaults. New review rows begin Pending review; no sample claims a payment occurred.
2. Confirm payment/session outputs, buyer fields and review evidence are blank in the supplied examples.
3. Keep Start checkout disabled until the adopting merchant has deployed and configured their own application.
4. Rebind that application's Base/table IDs and PAT to the copy. Never retain a publisher's token, merchant keys or URL.
5. Perform the application guide's Sandbox and independent-copy checks before distributing a template as working.

Only the Base's fields, views and Open URL button live in Airtable. The Next.js application and its PostgreSQL database run externally. No paid Airtable script or Extension is needed for this design, but neither CSV import nor copying a Base completes that external setup.

## Payment result synchronization

Add the three single-line text fields above when upgrading an existing Base; no database migration is needed. Verified notifications are saved durably and then automatically projected to Orders. Payment review is never changed. The application clears Checkout URL once payment evidence exists; Checkout state describes the earlier session creation, while Payment result and Capture result describe notifications.

On a failed Airtable write, fix the field names/types or access problem, then open Start checkout and select **Sync payment result to Airtable**. This copies the latest saved result without creating a payment or querying Antom. GET/Refresh order remains read-only. A changed order snapshot blocks synchronization; investigate the original payment before correcting order data. No background retry queue is supplied, so do not rely on Sandbox webhook retries.
