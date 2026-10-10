# Antom order checkout for Airtable

This folder contains a **rebuildable Base draft**, not an installed plugin or a published Universe template. It accompanies the optional Airtable integration in this Next.js project. Using the payment flow requires an externally deployed application, PostgreSQL and your own authorized Antom Sandbox/Airtable configuration.

## Build your private Base

1. Create a Base in your own Airtable workspace.
2. Import [orders.csv](orders.csv) as **Orders** and [payment-review.csv](payment-review.csv) as **Payment review**, with the first row used as field names.
3. Apply the field types, select values and views in [field-guide.md](field-guide.md). CSV files do not preserve these settings.
4. Add **Start checkout** as an Open URL button with `BLANK()` until your deployment is configured and tested.
5. Follow [the application installation guide](../docs/airtable.md), then bind the button to your own deployed `/airtable` page.

The synthetic examples are 2500 USD minor units (25.00 USD) and 5000 EUR minor units (50.00 EUR). They are not real transactions, do not establish merchant eligibility and have no payment identifiers, checkout URLs or verified results. Optional buyer fields are empty. Remove the examples before entering merchant orders.

## Operator flow

**Open an order → sign in to the merchant application → check its amount and currency → confirm checkout creation → open the saved checkout link → manually review the transaction in Antom.**

Checkout URL is a backend output from Antom `normalUrl`, not a Payment Link the operator is expected to paste. Payment review is a separate human record. A created session, checkout link, expired session or browser return does not prove whether an order was paid. For methods requiring capture, verify successful capture before marking **Verified paid**.

This design uses ordinary Airtable fields, views and an Open URL button. It does not require an Airtable paid script action, Extension or AI field. The external application's hosting, database and payment costs are separate; do not interpret Airtable Free compatibility as a promise that the complete service is free.

Do not enable the button before authenticated access, server configuration, migration and your Sandbox flow have been checked. A public copy must contain only synthetic information and blank buyer/payment/review outputs. Copies do not automatically receive template or application updates.

No Sandbox payment, independent Free-workspace acceptance, external deployment or public listing is asserted by these files. See [the installation and acceptance steps](../docs/airtable.md) for the remaining verification.
