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

import type { AntomAmount, PaymentStatus as AntomPaymentStatus } from './antom/types';

// Re-export so callers don't need to know the underlying types live under
// the Antom integration folder.
export type { AntomAmount };

/** Payment lifecycle as exposed to the UI. Mirrors Antom's PaymentStatus. */
export type PaymentStatus = AntomPaymentStatus;

/** Status the UI may render before Antom has been queried. */
export type UiPaymentStatus = PaymentStatus | 'PENDING' | 'UNKNOWN';

// --- POST /api/create-payment-session --------------------------------------

export interface CreateSessionRequest {
  productId: string;
  quantity?: number;
}

export interface CreateSessionSuccess {
  paymentRequestId: string;
  paymentSessionId?: string;
  paymentSessionData: string;
  normalUrl?: string;
}

// --- GET /api/inquiry-payment ----------------------------------------------

export interface InquiryPaymentSuccess {
  paymentRequestId: string;
  status: UiPaymentStatus;
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

/** Data the homepage stashes for the checkout page to pick up. */
export interface StoredCheckoutSession {
  paymentSessionData: string;
  normalUrl?: string;
}

export function isStoredCheckoutSession(v: unknown): v is StoredCheckoutSession {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj.paymentSessionData !== 'string' || !obj.paymentSessionData) return false;
  if (obj.normalUrl !== undefined && typeof obj.normalUrl !== 'string') return false;
  return true;
}
