import { createHash, randomUUID } from 'node:crypto';
import {
  AirtableError, PaymentRejectedError, type Attempt, type CheckoutSession,
  type EvidenceStatus, type OrderSnapshot, type PaymentEvidence,
  validateRecord, validateRecordId, validateSession,
} from './domain';
import type { AirtableRecords } from './client';
import type { AttemptStore } from './store';

export interface CheckoutPayments {
  /** Must verify the raw Antom response and enforce the configured checkout host allowlist. */
  create(snapshot: OrderSnapshot, attemptId: string): Promise<CheckoutSession>;
}

export interface PublicAttempt {
  id: string;
  state: Attempt['state'] | 'expired';
  expiresAt: string | null;
  hasPaymentEvidence: boolean;
  paymentResult: EvidenceStatus | null;
  captureResult: EvidenceStatus | null;
  paymentId: string | null;
  orderChanged: boolean;
  checkoutUrl?: string;
  /** Projection is not durable backend state; saving may safely be retried. */
  writeback?: 'pending';
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AirtableError('INVALID_NOTIFICATION', 400);
  return value as Record<string, unknown>;
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new AirtableError('INVALID_NOTIFICATION_ID', 400);
  }
  return value;
}

export function createCheckoutService(options: {
  records: AirtableRecords;
  attempts: AttemptStore;
  payments: CheckoutPayments;
  allowedCurrencies: readonly string[];
  bindingId: string;
  now?: () => number;
}) {
  const { records, attempts, payments, allowedCurrencies } = options;
  const now = options.now ?? Date.now;
  if (!options.bindingId || !allowedCurrencies.length) throw new AirtableError('INVALID_CHECKOUT_CONFIGURATION', 503);

  async function read(recordId: string): Promise<OrderSnapshot> {
    validateRecordId(recordId);
    return validateRecord(await records.get(recordId), recordId, allowedCurrencies);
  }

  function summary(attempt: Attempt, order: OrderSnapshot): PublicAttempt {
    const expired = attempt.state === 'session_ready' && attempt.session && Date.parse(attempt.session.paymentSessionExpiryTime) <= now();
    const changed = attempt.snapshot.fingerprint !== order.fingerprint;
    const state = changed ? 'needs_review' : expired ? 'expired' : attempt.state;
    const ready = !changed && state === 'session_ready' && !attempt.hasPaymentEvidence && attempt.session;
    return {
      id: attempt.id, state, expiresAt: attempt.session?.paymentSessionExpiryTime ?? null,
      hasPaymentEvidence: attempt.hasPaymentEvidence,
      paymentResult: attempt.paymentResult, captureResult: attempt.captureResult,
      paymentId: attempt.paymentId, orderChanged: changed,
      ...(ready ? { checkoutUrl: validateSession(ready, now()).normalUrl, writeback: 'pending' as const } : {}),
    };
  }

  function reusable(attempt: Attempt, snapshot: OrderSnapshot): CheckoutSession {
    if (attempt.snapshot.fingerprint !== snapshot.fingerprint) throw new AirtableError('ORDER_CHANGED', 409);
    if (attempt.hasPaymentEvidence) throw new AirtableError('PAYMENT_REQUIRES_REVIEW', 409);
    if (attempt.state !== 'session_ready' || !attempt.session) throw new AirtableError('ATTEMPT_REQUIRES_REVIEW', 409);
    if (Date.parse(attempt.session.paymentSessionExpiryTime) <= now()) throw new AirtableError('SESSION_EXPIRED_REQUIRES_REVIEW', 409);
    return validateSession(attempt.session, now());
  }

  async function writeback(attempt: Attempt): Promise<'complete' | 'pending'> {
    return attempts.withLockedAttempt(attempt.id, async latest => {
      reusable(latest, latest.snapshot);
      let current: OrderSnapshot;
      try { current = await read(latest.snapshot.recordId); }
      catch (error) {
        if (!(error instanceof AirtableError) || ![429, 502].includes(error.status)) throw error;
        return 'pending';
      }
      const session = reusable(latest, current);
      try {
        await records.writeSession(current.recordId, {
          'Checkout state': 'Session ready', 'Checkout URL': session.normalUrl,
          'Payment request ID': latest.id, 'Payment session ID': session.paymentSessionId,
          'Session expires at': session.paymentSessionExpiryTime, 'Last error': '',
        });
        return 'complete';
      } catch { return 'pending'; }
    });
  }

  async function syncPaymentAttempt(attemptId: string): Promise<void> {
    // Payment evidence is committed BEFORE projection. A failed PATCH never loses evidence.
    // The same row lock used by recordEvidence prevents delayed callbacks/retries from
    // overwriting a newer success with stale failure, or restoring a paid checkout URL.
    await attempts.withLockedAttempt(attemptId, async latest => {
      if (!latest.hasPaymentEvidence || !latest.paymentId) throw new AirtableError('NO_PAYMENT_EVIDENCE', 409);
      const current = await read(latest.snapshot.recordId);
      if (current.fingerprint !== latest.snapshot.fingerprint) throw new AirtableError('ORDER_CHANGED', 409);
      const result = (value: EvidenceStatus | null) => value === 'S' ? 'Success' : value === 'F' ? 'Failed' : value === 'U' ? 'Processing' : 'Not received';
      try {
        await records.writePayment(current.recordId, {
          'Payment result': result(latest.paymentResult),
          'Capture result': result(latest.captureResult),
          'Antom payment ID': latest.paymentId,
          'Checkout URL': '',
        });
      } catch { throw new AirtableError('PAYMENT_SYNC_PENDING', 502); }
    });
  }

  return {
    async syncPayment(recordId: string): Promise<void> {
      validateRecordId(recordId);
      const attempt = await attempts.get(recordId);
      if (!attempt) throw new AirtableError('NO_PAYMENT_EVIDENCE', 409);
      await syncPaymentAttempt(attempt.id);
    },
    async preview(recordId: string): Promise<{ order: OrderSnapshot; attempt: PublicAttempt | null }> {
      const order = await read(recordId);
      const attempt = await attempts.get(recordId);
      return { order, attempt: attempt ? summary(attempt, order) : null };
    },

    async start(recordId: string, expectedFingerprint: string): Promise<{
      order: OrderSnapshot; session: CheckoutSession; writeback: 'complete' | 'pending'; reused: boolean;
    }> {
      if (!/^[a-f0-9]{64}$/.test(expectedFingerprint)) throw new AirtableError('INVALID_CONFIRMATION', 400);
      const order = await read(recordId);
      if (order.fingerprint !== expectedFingerprint) throw new AirtableError('ORDER_CHANGED', 409);
      const claim = await attempts.claim(order, `air_${randomUUID().replaceAll('-', '')}`);
      let attempt = claim.attempt;
      if (!claim.created) {
        const session = reusable(attempt, order);
        const writebackResult = await writeback(attempt);
        return { order, session, writeback: writebackResult, reused: true };
      }

      let session: CheckoutSession;
      try {
        session = validateSession(await payments.create(order, attempt.id), now());
      } catch (error) {
        // The claim remains durable even if the following status update fails.
        if (error instanceof PaymentRejectedError) await attempts.markRejected(attempt.id);
        else await attempts.markUnknown(attempt.id);
        throw new AirtableError(error instanceof PaymentRejectedError ? 'PAYMENT_REJECTED' : 'PAYMENT_OUTCOME_UNKNOWN', 502);
      }
      // Never return a URL or write to Airtable before the complete session is durably saved.
      attempt = await attempts.saveSession(attempt.id, session);
      reusable(attempt, order);
      const writebackResult = await writeback(attempt);
      return { order, session, writeback: writebackResult, reused: false };
    },

    /** Caller verifies signature, client ID, time and Sandbox binding before calling this. */
    async recordNotification(verifiedPayload: unknown): Promise<void> {
      const payload = object(verifiedPayload);
      const type = payload.notifyType;
      if (type !== 'PAYMENT_RESULT' && type !== 'CAPTURE_RESULT') throw new AirtableError('UNSUPPORTED_NOTIFICATION', 400);
      const result = object(payload.result);
      if (!['S', 'F', 'U'].includes(result.resultStatus as string)) throw new AirtableError('INVALID_NOTIFICATION_RESULT', 400);
      const paymentId = identifier(payload.paymentId);
      const attempt = type === 'PAYMENT_RESULT'
        ? await attempts.getByAttemptId(identifier(payload.paymentRequestId))
        : await attempts.getByPaymentId(paymentId);
      if (!attempt) throw new AirtableError('NOTIFICATION_ATTEMPT_NOT_FOUND', 409);
      // A supplied request identity must agree even on a capture callback.
      if (payload.paymentRequestId !== undefined && payload.paymentRequestId !== attempt.id) throw new AirtableError('NOTIFICATION_IDENTITY_MISMATCH', 409);
      if (attempt.paymentId && attempt.paymentId !== paymentId) throw new AirtableError('NOTIFICATION_IDENTITY_MISMATCH', 409);
      const amount = object(type === 'PAYMENT_RESULT' ? payload.paymentAmount : payload.captureAmount);
      // This adapter supports full-amount payment/capture evidence only. Partial captures need manual investigation.
      if (typeof amount.value !== 'string' || !/^[1-9][0-9]*$/.test(amount.value) || amount.value !== attempt.snapshot.amountMinor || amount.currency !== attempt.snapshot.currency) {
        throw new AirtableError('NOTIFICATION_AMOUNT_MISMATCH', 409);
      }
      const evidence: PaymentEvidence = {
        type, status: result.resultStatus as EvidenceStatus, paymentId,
        ...(type === 'CAPTURE_RESULT' ? {
          captureId: identifier(payload.captureId), captureRequestId: identifier(payload.captureRequestId),
        } : {}),
        amountMinor: amount.value, currency: amount.currency as string, eventKey: '',
      };
      evidence.eventKey = createHash('sha256').update(JSON.stringify([
        options.bindingId, attempt.id, type, evidence.status, paymentId,
        evidence.captureId ?? '', evidence.captureRequestId ?? '', evidence.amountMinor, evidence.currency,
      ])).digest('hex');
      await attempts.recordEvidence(attempt.id, evidence);
      await syncPaymentAttempt(attempt.id);
    },
  };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
