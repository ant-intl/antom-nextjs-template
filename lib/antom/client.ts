import 'server-only';
import { antomConfig } from './config';
import { buildRequestTime, signRequest } from './sign';

/**
 * Unified HTTP client for calling Antom Open API.
 * Handles signature header injection automatically.
 */

const DEFAULT_TIMEOUT_MS = 8000;

export class AntomApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'AntomApiError';
  }
}

/**
 * Send a signed POST request to the Antom gateway.
 *
 * IMPORTANT: The same `body` string used for signing MUST be the exact
 * bytes sent over the wire. Never re-stringify after signing.
 */
export async function antomPost<T>(
  path: string,
  payload: unknown,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  if (!path.startsWith('/')) {
    throw new Error(`[antom] path must start with '/': ${path}`);
  }

  const body = JSON.stringify(payload);
  const requestTime = buildRequestTime();
  const signature = signRequest({
    method: 'POST',
    uri: path,
    body,
    clientId: antomConfig.clientId,
    requestTime,
    privateKey: antomConfig.privateKey,
  });

  const url = `${antomConfig.gateway}${path}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Client-Id': antomConfig.clientId,
        'Request-Time': requestTime,
        Signature: `algorithm=RSA256,keyVersion=1,signature=${signature}`,
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new AntomApiError(`[antom] request to ${path} timed out`, 504, '');
    }
    throw new AntomApiError(
      `[antom] network error on ${path}: ${err instanceof Error ? err.message : String(err)}`,
      0,
      '',
    );
  }

  const text = await res.text();
  if (!res.ok) {
    throw new AntomApiError(
      `[antom] HTTP ${res.status} on ${path}`,
      res.status,
      text,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AntomApiError(`[antom] Invalid JSON response from ${path}`, res.status, text);
  }
}

