import { createHash } from 'node:crypto';

export class AirtableError extends Error {
  constructor(public readonly code: string, public readonly status: number, message = code) {
    super(message);
    this.name = 'AirtableError';
  }
}

/** Only an explicitly verified Antom F result may be classified as rejected. */
export class PaymentRejectedError extends Error {}

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

export interface OrderSnapshot {
  recordId: string;
  orderId: string;
  description: string;
  amountMinor: string;
  currency: string;
  buyer?: {
    referenceBuyerId?: string;
    buyerName?: { firstName?: string; lastName?: string };
    buyerEmail?: string;
  };
  fingerprint: string;
}

export interface CheckoutSession {
  normalUrl: string;
  paymentSessionId: string;
  paymentSessionExpiryTime: string;
}

export type AttemptState = 'creating' | 'session_ready' | 'unknown' | 'rejected' | 'needs_review';
export interface Attempt {
  id: string;
  snapshot: OrderSnapshot;
  state: AttemptState;
  session: CheckoutSession | null;
  hasPaymentEvidence: boolean;
  paymentId: string | null;
  paymentResult: EvidenceStatus | null;
  captureResult: EvidenceStatus | null;
}

export type EvidenceStatus = 'S' | 'F' | 'U';
export interface PaymentEvidence {
  eventKey: string;
  type: 'PAYMENT_RESULT' | 'CAPTURE_RESULT';
  status: EvidenceStatus;
  paymentId: string;
  captureId?: string;
  captureRequestId?: string;
  amountMinor: string;
  currency: string;
}

export function validateRecordId(value: string): void {
  if (!/^rec[A-Za-z0-9]{14}$/.test(value)) throw new AirtableError('INVALID_RECORD_ID', 400);
}

function requiredText(value: unknown, max: number, code: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new AirtableError(code, 422);
  }
  return value.trim();
}

/** Merchant-maintained payment inputs contribute to the snapshot; projected outputs do not. */
export function orderFingerprint(order: Omit<OrderSnapshot, 'fingerprint'>): string {
  return createHash('sha256').update(JSON.stringify([
    order.recordId, order.orderId, order.description, order.amountMinor, order.currency,
    order.buyer?.referenceBuyerId ?? '', order.buyer?.buyerName?.firstName ?? '',
    order.buyer?.buyerName?.lastName ?? '', order.buyer?.buyerEmail ?? '',
  ])).digest('hex');
}

export function validateRecord(record: AirtableRecord, recordId: string, allowedCurrencies: readonly string[]): OrderSnapshot {
  validateRecordId(recordId);
  if (record.id !== recordId || !record.fields || typeof record.fields !== 'object') {
    throw new AirtableError('RECORD_MISMATCH', 502);
  }
  const fields = record.fields;
  const amount = fields['Amount minor'];
  // Airtable Number fields are JSON numbers. Reject text, decimals and unsafe integers.
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new AirtableError('INVALID_AMOUNT', 422);
  }
  const currency = requiredText(fields.Currency, 3, 'INVALID_CURRENCY');
  if (!/^[A-Z]{3}$/.test(currency) || !allowedCurrencies.includes(currency)) {
    throw new AirtableError('UNSUPPORTED_CURRENCY', 422);
  }
  const optional = (key: string, max: number): string | undefined => {
    const value = fields[key];
    if (value === undefined || value === null || value === '') return undefined;
    return requiredText(value, max, 'INVALID_BUYER');
  };
  const referenceBuyerId = optional('Buyer ID', 64);
  const firstName = optional('Buyer first name', 64);
  const lastName = optional('Buyer last name', 64);
  const buyerEmail = optional('Buyer email', 254);
  if (buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) throw new AirtableError('INVALID_BUYER_EMAIL', 422);
  const buyer = referenceBuyerId || firstName || lastName || buyerEmail ? {
    ...(referenceBuyerId ? { referenceBuyerId } : {}),
    ...(firstName || lastName ? { buyerName: { ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) } } : {}),
    ...(buyerEmail ? { buyerEmail } : {}),
  } : undefined;
  const order = {
    recordId,
    orderId: requiredText(fields['Order ID'], 64, 'INVALID_ORDER_ID'),
    description: requiredText(fields.Description, 256, 'INVALID_DESCRIPTION'),
    amountMinor: String(amount),
    currency,
    ...(buyer ? { buyer } : {}),
  };
  return { ...order, fingerprint: orderFingerprint(order) };
}

/** Defense in depth; the gateway wrapper must additionally enforce the checkout host allowlist. */
export function validateSession(session: CheckoutSession, now: number): CheckoutSession {
  let url: URL;
  try { url = new URL(session.normalUrl); } catch { throw new AirtableError('INVALID_CHECKOUT_URL', 502); }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || session.normalUrl.length > 8192) {
    throw new AirtableError('INVALID_CHECKOUT_URL', 502);
  }
  if (typeof session.paymentSessionId !== 'string' || !session.paymentSessionId || session.paymentSessionId.length > 512) {
    throw new AirtableError('INVALID_SESSION_ID', 502);
  }
  const expiry = Date.parse(session.paymentSessionExpiryTime);
  if (!Number.isFinite(expiry) || expiry <= now) throw new AirtableError('INVALID_SESSION_EXPIRY', 502);
  return { ...session };
}

/** Success is never downgraded by delayed failure or unknown notifications. */
export function mergeEvidenceStatus(current: EvidenceStatus | null, incoming: EvidenceStatus): EvidenceStatus {
  const rank = { U: 1, F: 2, S: 3 };
  return current && rank[current] >= rank[incoming] ? current : incoming;
}
