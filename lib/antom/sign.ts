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

export interface VerifyResponseOptions {
  uri: string;
  /** Original response bytes, before UTF-8 decoding or JSON parsing. */
  body: Uint8Array;
  headers: Headers;
  expectedClientId: string;
  antomPublicKey: string;
  now?: number;
}

/** API responses use Response-Time, not the outbound Request-Time. */
export function verifyResponse(opts: VerifyResponseOptions): boolean {
  try {
    const clientId = opts.headers.get('client-id');
    const responseTime = opts.headers.get('response-time');
    const header = opts.headers.get('signature');
    if (!opts.expectedClientId || clientId !== opts.expectedClientId || !responseTime || !header || header.length > 16_384) return false;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(responseTime)) return false;
    const timestamp = Date.parse(responseTime);
    const now = opts.now ?? Date.now();
    if (!Number.isFinite(timestamp) || !Number.isFinite(now) || Math.abs(now - timestamp) > 5 * 60 * 1000) return false;

    // Duplicate or unsupported fields must not select a different verification key.
    const names = new Set<string>();
    for (const part of header.split(',')) {
      const separator = part.indexOf('=');
      if (separator < 1) return false;
      const name = part.slice(0, separator).trim();
      if (!['algorithm', 'keyVersion', 'signature'].includes(name) || names.has(name)) return false;
      names.add(name);
    }
    const parsed = parseSignatureHeader(header);
    if (parsed.algorithm !== 'RSA256' || !parsed.keyVersion || !/^\d+$/.test(parsed.keyVersion) || !parsed.signature) return false;
    const signature = Buffer.from(parsed.signature, 'base64');
    if (!signature.length || signature.toString('base64') !== parsed.signature) return false;
    const signedBytes = Buffer.concat([
      Buffer.from(`POST ${opts.uri}\n${clientId}.${responseTime}.`, 'utf8'),
      Buffer.from(opts.body),
    ]);
    return crypto.verify('RSA-SHA256', signedBytes, toPem(opts.antomPublicKey, 'PUBLIC'), signature);
  } catch {
    return false;
  }
}
