import type { AirtableConfig } from './config';
import { AirtableConfigurationError } from './config';
import type { CheckoutService } from './service';
import { AirtableError } from './domain';
import { constantEqual, csrfToken, issueSession, readSessionCookie, sessionCookie, verifyCsrf, verifySession } from './auth';
import { verifyResponse } from '../antom/sign';

export interface AirtableRuntime {
  config: AirtableConfig;
  service: CheckoutService;
  allowLogin(): Promise<boolean>;
}

const messages: Record<string, string> = {
  PAYMENT_SYNC_PENDING: 'Payment is saved on the server, but Airtable could not be updated. Check the three payment fields and retry syncing.',
  NO_PAYMENT_EVIDENCE: 'No verified payment notification is saved for this order yet.',
  UNAUTHORIZED: 'Sign in to view this order.',
  FORBIDDEN: 'Refresh the page and sign in again.',
  RATE_LIMITED: 'Too many login attempts. Wait one minute and try again.',
  ORDER_CHANGED: 'The order changed. Reload and review it before continuing.',
  PAYMENT_OUTCOME_UNKNOWN: 'The payment request outcome is unknown. Ask the merchant to investigate before retrying.',
  PAYMENT_REJECTED: 'Antom rejected the request. Ask the merchant to investigate.',
  DISABLED: 'The Airtable integration is not enabled.',
  UNAVAILABLE: 'The service is temporarily unavailable. Contact the deployment administrator.',
};

function json(value: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', ...extra,
  } });
}

async function bytes(request: Request, limit: number): Promise<Uint8Array> {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new AirtableError('INVALID_CONTENT_TYPE', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AirtableError('INVALID_BODY', 400);
  const parts: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) throw new AirtableError('BODY_TOO_LARGE', 413);
          parts.push(value);
        }
        return Buffer.concat(parts);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AirtableError('BODY_TIMEOUT', 408)), 5000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    // A hostile stream's cancel() promise may also never settle.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function decode(body: Uint8Array): Record<string, unknown> {
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* Return a stable error without echoing submitted data. */ }
  throw new AirtableError('INVALID_BODY', 400);
}

function singleString(value: Record<string, unknown>, key: string): string {
  if (Object.keys(value).length !== 1 || typeof value[key] !== 'string') throw new AirtableError('INVALID_BODY', 400);
  return value[key] as string;
}

export function createAirtableHandlers(load: () => AirtableRuntime | null) {
  const required = () => {
    const runtime = load();
    if (!runtime) throw new AirtableError('DISABLED', 503);
    return runtime;
  };
  const origin = (request: Request, config: AirtableConfig) => {
    if (request.headers.get('origin') !== config.appOrigin) throw new AirtableError('FORBIDDEN', 403);
  };
  const authorize = (request: Request, config: AirtableConfig, write = false) => {
    const token = readSessionCookie(request);
    if (!verifySession(token, config.sessionSecret, config.bindingId)) throw new AirtableError('UNAUTHORIZED', 401);
    if (write) {
      origin(request, config);
      if (!verifyCsrf(request.headers.get('x-csrf-token') || '', token, config.sessionSecret)) throw new AirtableError('FORBIDDEN', 403);
    }
    return token;
  };
  const safe = (handler: (request: Request, recordId: string) => Promise<Response>) => async (request: Request, recordId = '') => {
    try { return await handler(request, recordId); }
    catch (error) {
      const known = error instanceof AirtableError;
      const code = known ? error.code : error instanceof AirtableConfigurationError ? 'CONFIGURATION' : 'UNAVAILABLE';
      return json({ code, error: messages[code] || 'This action could not be completed. Review the setup or ask the merchant to investigate.' }, known ? error.status : 503);
    }
  };
  return {
    session: safe(async request => {
      const runtime = load();
      if (!runtime) return json({ enabled: false, authenticated: false });
      const { config } = runtime;
      const token = readSessionCookie(request);
      const authenticated = verifySession(token, config.sessionSecret, config.bindingId);
      return json({ enabled: true, authenticated, ...(authenticated ? { csrfToken: csrfToken(token, config.sessionSecret) } : {}) });
    }),
    login: safe(async request => {
      const runtime = required();
      origin(request, runtime.config);
      if (!await runtime.allowLogin()) throw new AirtableError('RATE_LIMITED', 429);
      const password = singleString(decode(await bytes(request, 4096)), 'password');
      if (!constantEqual(password, runtime.config.operatorPassword)) throw new AirtableError('UNAUTHORIZED', 401);
      const token = issueSession(runtime.config.sessionSecret, runtime.config.bindingId);
      return json({ csrfToken: csrfToken(token, runtime.config.sessionSecret) }, 200, { 'Set-Cookie': sessionCookie(token) });
    }),
    logout: safe(async request => {
      const { config } = required();
      authorize(request, config, true);
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', true) });
    }),
    preview: safe(async (request, recordId) => {
      const { config, service } = required();
      const token = authorize(request, config);
      const { order, attempt } = await service.preview(recordId);
      const { buyer: _buyer, ...publicOrder } = order;
      return json({ order: publicOrder, csrfToken: csrfToken(token, config.sessionSecret), ...(attempt ? {
        checkout: { state: attempt.state === 'session_ready' ? 'ready' : attempt.state === 'needs_review' ? 'needs-review' : attempt.state,
          expiresAt: attempt.expiresAt, paymentResult: attempt.paymentResult, captureResult: attempt.captureResult,
          paymentId: attempt.paymentId, orderChanged: attempt.orderChanged, ...(attempt.checkoutUrl ? { checkoutUrl: attempt.checkoutUrl, writeback: 'pending' } : {}) },
      } : {}) });
    }),
    syncPayment: safe(async (request, recordId) => {
      const { config, service } = required();
      authorize(request, config, true);
      const body = decode(await bytes(request, 4096));
      if (Object.keys(body).length) throw new AirtableError('INVALID_BODY', 400);
      await service.syncPayment(recordId);
      return json({ synced: true });
    }),
    checkout: safe(async (request, recordId) => {
      const { config, service } = required();
      authorize(request, config, true);
      const fingerprint = singleString(decode(await bytes(request, 4096)), 'fingerprint');
      const result = await service.start(recordId, fingerprint);
      return json({ state: 'ready', checkoutUrl: result.session.normalUrl, expiresAt: result.session.paymentSessionExpiryTime,
        writeback: result.writeback === 'complete' ? 'saved' : 'pending' });
    }),
    webhook: safe(async request => {
      const { config, service } = required();
      const body = await bytes(request, 65_536);
      const headers = new Headers(request.headers);
      // Notifications sign Request-Time; responses sign Response-Time. The byte string is otherwise identical.
      headers.set('response-time', request.headers.get('request-time') || '');
      const url = new URL(request.url);
      if (url.pathname !== '/api/airtable/webhooks/antom' || url.search || !verifyResponse({
        uri: '/api/airtable/webhooks/antom', body, headers, expectedClientId: config.antom.clientId,
        antomPublicKey: config.antom.publicKey,
      })) throw new AirtableError('INVALID_NOTIFICATION_SIGNATURE', 401);
      await service.recordNotification(decode(body));
      // ACK after durable evidence and projection; failures can retry safely. Manual review is untouched.
      return json({ result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'success' } });
    }),
  };
}
