import crypto from 'node:crypto';

/**
 * Lightweight HMAC-signed token for paymentRequestId references handed
 * to the browser. Lets /api/inquiry-payment confirm the caller actually
 * owns the prid without standing up a full session layer.
 *
 * Format: <prid>.<base64url-hmac-sha256>
 *
 * The pure helpers below take an explicit `secret` so they can be unit
 * tested in plain Node. The two `default*` wrappers bind to the merchant
 * secret from antomConfig for the rest of the codebase.
 *
 * NOTE: This binds the token to the merchant's signing secret, not to a
 * specific user. Production deployments with user accounts should switch
 * to a session-scoped token instead.
 */

function hmac(secret: string, input: string): string {
  return crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

export function signPridWithSecret(secret: string, paymentRequestId: string): string {
  return `${paymentRequestId}.${hmac(secret, paymentRequestId)}`;
}

export function verifyPridWithSecret(secret: string, token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const prid = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(secret, prid);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return prid;
}

// --- bindings to the merchant's runtime config (server-only) ---------------
// Lazy-loaded so this module stays unit-testable without env setup.

let cachedSecret: string | null = null;
function getDefaultSecret(): string {
  if (cachedSecret !== null) return cachedSecret;

  const { antomConfig } = require('./config') as typeof import('./config');
  cachedSecret = antomConfig.prsigSecret;
  return cachedSecret;
}

export function signPrid(paymentRequestId: string): string {
  return signPridWithSecret(getDefaultSecret(), paymentRequestId);
}

export function verifyPrid(token: string): string | null {
  return verifyPridWithSecret(getDefaultSecret(), token);
}
