import { buildRequestTime, signRequest, verifyResponse } from './sign';

/** Pure transport: no environment reads or server-only imports. */
export interface AntomTransportConfig {
  clientId: string;
  privateKey: string;
  publicKey: string;
  gateway: string;
  env: 'sandbox' | 'prod';
  keyVersion: string;
  signatureAlgorithm: string;
}

export interface AntomTransportOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetchFn?: typeof fetch;
  now?: () => number;
}

export type AntomErrorCode =
  | 'CONFIGURATION' | 'NETWORK' | 'TIMEOUT' | 'REDIRECT'
  | 'RESPONSE_TOO_LARGE' | 'INVALID_RESPONSE_SIGNATURE' | 'HTTP_ERROR' | 'INVALID_JSON';

export class AntomApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
    public readonly code: AntomErrorCode = 'HTTP_ERROR',
  ) {
    super(message);
    this.name = 'AntomApiError';
  }
}

// Online-payment gateways and documented aliases. Never infer another region.
// https://docs.antom.com/ac/ams/api
const GATEWAYS = new Set([
  'open-sea-global.alipay.com', 'open-sea.alipay.com',
  'open-de-global.alipay.com',
  'open-na-global.alipay.com', 'open-na.alipay.com',
  'open.antglobal-us.com',
]);
const OLD_UNDOCUMENTED_GATEWAYS = new Set([
  'open-eu-global.alipay.com', 'open-us-global.alipay.com', 'open-global.alipay.com',
]);

export function validateGateway(raw: string): string {
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error('[antom] ANTOM_GATEWAY_URL must be an official HTTPS gateway origin'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash || /[\\\s]/.test(raw)) {
    throw new Error('[antom] ANTOM_GATEWAY_URL must be an HTTPS origin without credentials, port, path, query or fragment');
  }
  if (!GATEWAYS.has(url.hostname)) {
    const hint = OLD_UNDOCUMENTED_GATEWAYS.has(url.hostname)
      ? 'This legacy example domain is not a documented online-payment gateway. Select your merchant region explicitly.'
      : 'The host is not an allowed online-payment gateway.';
    throw new Error(`[antom] ${hint} See https://docs.antom.com/ac/ams/api`);
  }
  return url.origin;
}

/** Resolve the wire URI before signing it; never silently cross environments. */
export function resolveApiPath(path: string, env: 'sandbox' | 'prod'): string {
  if (env !== 'sandbox' && env !== 'prod') throw new Error('[antom] Invalid API environment');
  if (!/^\/ams\/(?:sandbox\/)?api\/v1\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*(?:\?[^#\s\\]*)?$/.test(path)) {
    throw new Error('[antom] Expected an absolute AMS v1 API path without traversal or fragment');
  }
  const result = env === 'sandbox'
    ? path.replace(/^\/ams\/api\//, '/ams/sandbox/api/')
    : path;
  if (env === 'prod' && result.startsWith('/ams/sandbox/')) {
    throw new Error('[antom] Sandbox API path cannot be used with production configuration');
  }
  // The same literal path/query must reach fetch and the signing primitive.
  const checked = new URL(result, 'https://open-sea-global.alipay.com');
  if (`${checked.pathname}${checked.search}` !== result) throw new Error('[antom] Noncanonical API path');
  return result;
}

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

export async function antomPostWithConfig<T>(
  config: AntomTransportConfig,
  path: string,
  payload: unknown,
  options: AntomTransportOptions = {},
): Promise<T> {
  let gateway: string;
  let uri: string;
  let body: string;
  let signature: string;
  let requestTime: string;
  const now = options.now ?? Date.now;
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  try {
    gateway = validateGateway(config.gateway);
    uri = resolveApiPath(path, config.env);
    if (!config.clientId || /[\r\n]/.test(config.clientId) || !config.publicKey ||
        config.signatureAlgorithm !== 'RSA256' || !/^\d+$/.test(config.keyVersion) ||
        typeof fetchFn !== 'function' || typeof now !== 'function' ||
        !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS ||
        !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_RESPONSE_BYTES) {
      throw new Error('invalid transport settings');
    }
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) throw new Error('payload is not JSON');
    body = serialized;
    const timestamp = now();
    if (!Number.isFinite(timestamp)) throw new Error('invalid clock');
    requestTime = buildRequestTime(new Date(timestamp));
    signature = signRequest({ method: 'POST', uri, body, clientId: config.clientId,
      requestTime, privateKey: config.privateKey });
  } catch {
    throw new AntomApiError('[antom] Invalid transport configuration or request', 0, '', 'CONFIGURATION');
  }

  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AntomApiError('[antom] Request or response body timed out', 504, '', 'TIMEOUT'));
    }, timeoutMs);
  });
  const perform = async (): Promise<T> => {
    let response: Response;
    try {
      response = await fetchFn(`${gateway}${uri}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Client-Id': config.clientId,
          'Request-Time': requestTime,
          Signature: `algorithm=${config.signatureAlgorithm},keyVersion=${config.keyVersion},signature=${signature}`,
        },
        body,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw new AntomApiError('[antom] Request timed out', 504, '', 'TIMEOUT');
      throw new AntomApiError('[antom] Network or redirect error', 0, '', 'NETWORK');
    }
    controller.signal.throwIfAborted();
    if (response.redirected || response.status >= 300 && response.status < 400) {
      void response.body?.cancel().catch(() => {});
      throw new AntomApiError('[antom] Gateway redirects are not accepted', response.status, '', 'REDIRECT');
    }
    const declaredLength = response.headers.get('content-length');
    if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
      void response.body?.cancel().catch(() => {});
      throw new AntomApiError('[antom] Response exceeds size limit', response.status, '', 'RESPONSE_TOO_LARGE');
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const next = await reader.read();
        controller.signal.throwIfAborted();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > maxBytes) throw new AntomApiError('[antom] Response exceeds size limit', response.status, '', 'RESPONSE_TOO_LARGE');
        chunks.push(next.value);
      }
    }
    const raw = Buffer.concat(chunks, size);
    if (!verifyResponse({ uri, body: raw, headers: response.headers,
      expectedClientId: config.clientId, antomPublicKey: config.publicKey, now: now() })) {
      throw new AntomApiError('[antom] Response signature or headers are invalid', response.status, '', 'INVALID_RESPONSE_SIGNATURE');
    }
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
    catch { throw new AntomApiError('[antom] Response is not valid UTF-8', response.status, '', 'INVALID_JSON'); }
    if (!response.ok) throw new AntomApiError(`[antom] HTTP ${response.status}`, response.status, text, 'HTTP_ERROR');
    try { return JSON.parse(text) as T; }
    catch { throw new AntomApiError('[antom] Invalid JSON response', response.status, text, 'INVALID_JSON'); }
  };
  try {
    return await Promise.race([perform(), deadline]);
  } catch (error) {
    if (error instanceof AntomApiError) throw error;
    if (controller.signal.aborted) throw new AntomApiError('[antom] Request timed out', 504, '', 'TIMEOUT');
    throw new AntomApiError('[antom] Response could not be read', 0, '', 'NETWORK');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}
