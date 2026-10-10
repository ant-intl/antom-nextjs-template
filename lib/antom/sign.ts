import crypto from 'node:crypto';

/**
 * Antom RSA2 signing utilities.
 * Pure functions — no env access, no secret storage. The merchant private
 * key is only ever read in `config.ts` (which is `server-only`) and passed
 * in here as a parameter, so this module is safe to unit-test in plain Node.
 *
 * Algorithm: SHA256withRSA, key length 2048, base64 encoded.
 *
 * Sign string format (note: \n is a real newline byte 0x0A):
 *   {METHOD} {URI}\n{client-id}.{request-time}.{request-body}
 */

/** Wrap a single-line base64 key (no PEM headers) into standard PEM format. */
function toPem(rawKey: string, type: 'PRIVATE' | 'PUBLIC'): string {
  const cleaned = rawKey.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const lines = cleaned.match(/.{1,64}/g)?.join('\n') ?? '';
  const label = type === 'PRIVATE' ? 'PRIVATE KEY' : 'PUBLIC KEY';
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;
}

/**
 * Build an Antom-compliant Request-Time string.
 * Format: ISO 8601 in UTC (no milliseconds), e.g. 2026-05-20T10:30:45+00:00.
 * UTC is used so signed strings are reproducible regardless of host timezone,
 * which simplifies debugging across local dev / containers / serverless.
 */
export function buildRequestTime(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}` +
    `+00:00`
  );
}

export interface SignRequestOptions {
  method: 'POST' | 'GET';
  uri: string;
  body: string;
  clientId: string;
  requestTime: string;
  privateKey: string;
}

/**
 * Sign an outbound request to Antom.
 * Returns a URL-encoded base64 signature string ready for the Signature header.
 */
export function signRequest(opts: SignRequestOptions): string {
  const payload =
    `${opts.method} ${opts.uri}\n` +
    `${opts.clientId}.${opts.requestTime}.${opts.body}`;

  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(payload, 'utf8'), toPem(opts.privateKey, 'PRIVATE'))
    .toString('base64');

  // Antom requires the signature value to be URL-encoded inside the header.
  return encodeURIComponent(signature);
}

export interface VerifyWebhookOptions {
  method: 'POST';
  uri: string;
  body: string;
  clientId: string;
  requestTime: string;
  signature: string;
  antomPublicKey: string;
}

/**
 * Verify an inbound webhook signature from Antom.
 * The `signature` argument should already be URL-decoded (base64).
 */
export function verifyWebhook(opts: VerifyWebhookOptions): boolean {
  const payload =
    `${opts.method} ${opts.uri}\n` +
    `${opts.clientId}.${opts.requestTime}.${opts.body}`;

  try {
    return crypto.verify(
      'RSA-SHA256',
      Buffer.from(payload, 'utf8'),
      toPem(opts.antomPublicKey, 'PUBLIC'),
      Buffer.from(opts.signature, 'base64'),
    );
  } catch {
    return false;
  }
}

/**
 * Parse the Signature header value.
 * Format: `algorithm=RSA256,keyVersion=1,signature=<urlencoded-base64>`
 */
export function parseSignatureHeader(header: string): {
  algorithm?: string;
  keyVersion?: string;
  signature?: string;
} {
  const result: Record<string, string> = {};
  for (const part of header.split(',')) {
    const [k, ...rest] = part.split('=');
    if (k && rest.length) {
      result[k.trim()] = rest.join('=').trim();
    }
  }
  return {
    algorithm: result.algorithm,
    keyVersion: result.keyVersion,
    signature: result.signature ? decodeURIComponent(result.signature) : undefined,
  };
}
