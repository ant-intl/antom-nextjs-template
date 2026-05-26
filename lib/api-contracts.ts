/**
 * API contracts between the Next.js server and the browser.
 *
 * Both server routes (under `app/api`) and client components import from
 * here so that a field rename is a single-file change picked up by the
 * TypeScript compiler everywhere.
 *
 * Keep this file framework-free (no React, no server-only) so it can be
 * imported from both sides of the boundary.
 */

import type {
  AntomAmount,
  PaymentStatus as AntomPaymentStatus,
} from './antom/types';

export type { AntomAmount };

/** Antom-canonical payment lifecycle as it appears on the wire. */
export type AntomPaymentLifecycle = AntomPaymentStatus;

/**
 * Status the server may return to the browser.
 *
 * `UNKNOWN` appears only in the local-fallback path when Antom is
 * unreachable and we have no stored local status. `PENDING` never crosses
 * the wire — the server always reports `PROCESSING` for an open order.
 */
export type ResponsePaymentStatus = AntomPaymentLifecycle | 'UNKNOWN';

/**
 * Status the UI may render. Adds `PENDING` for the brief window before
 * the first inquiry completes.
 */
export type RenderablePaymentStatus = ResponsePaymentStatus | 'PENDING';

// --- POST /api/create-payment-session --------------------------------------

export interface CreateSessionRequest {
  productId: string;
  quantity?: number;
}

export interface CreateSessionSuccess {
  paymentRequestId: string;
  /** HMAC-signed token to be sent back to /api/inquiry-payment. */
  prsig: string;
  paymentSessionId?: string;
  paymentSessionData: string;
  normalUrl?: string;
}

// --- GET /api/inquiry-payment ----------------------------------------------

export interface InquiryPaymentSuccess {
  paymentRequestId: string;
  status: ResponsePaymentStatus;
  paymentId?: string;
  amount?: AntomAmount;
  paymentTime?: string;
  resultCode?: string;
  resultMessage?: string;
  /** Present when Antom call failed and we fell back to local state. */
  source?: 'local-fallback';
}

// --- Shared error envelope -------------------------------------------------

export interface ApiError {
  error: string;
  /** Optional Antom result when the upstream returned non-success. */
  result?: {
    resultCode: string;
    resultStatus: 'S' | 'F' | 'U';
    resultMessage: string;
  };
}

// --- Browser-local persistence (sessionStorage) ----------------------------

/**
 * Data the homepage stashes for the checkout page to pick up.
 *
 * Type guard only — content (paymentSessionData / prsig) is trusted to the
 * server that produced it. Tampering is harmless because the server
 * re-verifies prsig before returning any order data.
 */
export interface StoredCheckoutSession {
  paymentSessionData: string;
  prsig: string;
  normalUrl?: string;
}

export function isStoredCheckoutSession(v: unknown): v is StoredCheckoutSession {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj.paymentSessionData !== 'string' || obj.paymentSessionData.length < 16) return false;
  if (typeof obj.prsig !== 'string' || !obj.prsig.includes('.')) return false;
  if (obj.normalUrl !== undefined && typeof obj.normalUrl !== 'string') return false;
  return true;
}
