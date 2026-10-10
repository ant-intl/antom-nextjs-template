/** Synthetic display data only. Never passed to the payment service. */
export const PREVIEW_ORDER = {
  recordId: 'recPreview00000001',
  orderId: 'PREVIEW-001',
  description: 'Sample order · Premium headphones',
  amountMinor: '12900',
  currency: 'USD',
  // Intentionally invalid for the real checkout API's confirmation format.
  fingerprint: 'local-preview-not-a-payment-fingerprint',
};

export function localPreviewEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.NODE_ENV === 'development' && env.AIRTABLE_LOCAL_PREVIEW === 'true'
    && env.AIRTABLE_ENABLED !== 'true';
}
