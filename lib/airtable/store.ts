import type { Attempt, CheckoutSession, OrderSnapshot, PaymentEvidence } from './domain';

/** Every implementation must durably serialize claims and evidence; no runtime memory fallback. */
export interface AttemptStore {
  /** Serialize Airtable projections with evidence updates across all workers. */
  withLockedAttempt<T>(attemptId: string, action: (attempt: Attempt) => Promise<T>): Promise<T>;
  get(recordId: string): Promise<Attempt | null>;
  getByAttemptId(attemptId: string): Promise<Attempt | null>;
  getByPaymentId(paymentId: string): Promise<Attempt | null>;
  claim(snapshot: OrderSnapshot, attemptId: string): Promise<{ created: boolean; attempt: Attempt }>;
  saveSession(attemptId: string, session: CheckoutSession): Promise<Attempt>;
  markUnknown(attemptId: string): Promise<void>;
  markRejected(attemptId: string): Promise<void>;
  /** Recheck amount, currency and identity under the same lock as the event insert. */
  recordEvidence(attemptId: string, evidence: PaymentEvidence): Promise<void>;
}
