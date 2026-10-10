import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createAirtableHandlers, type AirtableRuntime } from '../lib/airtable/http';
import { csrfToken, issueSession, SESSION_COOKIE } from '../lib/airtable/auth';
import { readAirtableConfig } from '../lib/airtable/config';
import { signRequest } from '../lib/antom/sign';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const environment = {
  AIRTABLE_ENABLED: 'true', AIRTABLE_PAT: 'synthetic-token', AIRTABLE_BASE_ID: 'app12345678901234',
  AIRTABLE_TABLE_ID: 'tbl12345678901234', AIRTABLE_DATABASE_URL: 'postgresql://localhost/synthetic',
  AIRTABLE_OPERATOR_PASSWORD: 'synthetic-password-at-least-32-characters',
  AIRTABLE_SESSION_SECRET: 'synthetic-session-secret-at-least-32-characters',
  NEXT_PUBLIC_SITE_URL: 'https://merchant.example', NEXT_PUBLIC_ANTOM_ENV: 'sandbox',
  AIRTABLE_TRUST_BASE_EDITORS: 'true', AIRTABLE_ALLOWED_CURRENCIES: 'USD,JPY',
  AIRTABLE_CHECKOUT_HOSTS: 'checkout.example', ANTOM_CLIENT_ID: 'synthetic-client',
  ANTOM_PRIVATE_KEY: keys.privateKey, ANTOM_PUBLIC_KEY: keys.publicKey,
  ANTOM_GATEWAY_URL: 'https://open-sea-global.alipay.com',
};
const config = readAirtableConfig(environment)!;
const recordId = 'rec12345678901234';
const fingerprint = 'a'.repeat(64);
const order = { recordId, orderId: 'synthetic-order', description: 'Synthetic order', amountMinor: '1000', currency: 'USD', fingerprint,
  buyer: { buyerEmail: 'synthetic@example.com' } };

function fixture() {
  let creates = 0, previews = 0, notifications = 0;
  const runtime: AirtableRuntime = { config,
    allowLogin: async () => true,
    service: {
      syncPayment: async () => {},
      preview: async () => { previews++; return { order, attempt: null }; },
      start: async () => { creates++; return { order, session: { normalUrl: 'https://checkout.example/session', paymentSessionId: 'synthetic',
        paymentSessionExpiryTime: new Date(Date.now() + 60_000).toISOString() }, writeback: 'complete', reused: false }; },
      recordNotification: async () => { notifications++; },
    },
  };
  const token = issueSession(config.sessionSecret, config.bindingId);
  const headers = { cookie: `${SESSION_COOKIE}=${token}`, origin: config.appOrigin,
    'x-csrf-token': csrfToken(token, config.sessionSecret), 'content-type': 'application/json' };
  return { runtime, headers, handlers: createAirtableHandlers(() => runtime), counts: () => ({ creates, previews, notifications }) };
}
const request = (path: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`${config.appOrigin}${path}`, {
  method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test('disabled endpoints need no configured secrets; failures never echo configuration', async () => {
  const handlers = createAirtableHandlers(() => null);
  assert.deepEqual(await (await handlers.session(request('/api/airtable/session'))).json(), { enabled: false, authenticated: false });
  assert.equal((await handlers.checkout(request('/'), recordId)).status, 503);
  const unavailable = createAirtableHandlers(() => { throw new Error('do-not-echo-database-secret'); });
  assert.doesNotMatch(await (await unavailable.session(request('/'))).text(), /do-not-echo/);
});
test('login checks exact origin and database throttle before issuing a secure session', async () => {
  const f = fixture();
  assert.equal((await f.handlers.login(request('/', { password: config.operatorPassword }, { ...f.headers, origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await f.handlers.login(request('/', { password: 'wrong' }, f.headers))).status, 401);
  const success = await f.handlers.login(request('/', { password: config.operatorPassword }, f.headers));
  assert.equal(success.status, 200);
  assert.match(success.headers.get('set-cookie')!, /HttpOnly; Secure; SameSite=Strict/);
  assert.doesNotMatch(await success.text(), /synthetic-password/);
  f.runtime.allowLogin = async () => false;
  assert.equal((await f.handlers.login(request('/', { password: config.operatorPassword }, f.headers))).status, 429);
});
test('preview is authenticated and read-only and omits buyer PII', async () => {
  const f = fixture();
  assert.equal((await f.handlers.preview(request('/'), recordId)).status, 401);
  const response = await f.handlers.preview(request('/', undefined, f.headers), recordId);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await response.text(), /buyer|synthetic@example/);
  assert.deepEqual(f.counts(), { creates: 0, previews: 1, notifications: 0 });
});
test('creating checkout requires auth, CSRF, exact origin and only the confirmed fingerprint', async () => {
  const f = fixture();
  const body = { fingerprint };
  assert.equal((await f.handlers.checkout(request('/', body), recordId)).status, 401);
  assert.equal((await f.handlers.checkout(request('/', body, { ...f.headers, 'x-csrf-token': '' }), recordId)).status, 403);
  assert.equal((await f.handlers.checkout(request('/', body, { ...f.headers, origin: 'https://other.example' }), recordId)).status, 403);
  assert.equal((await f.handlers.checkout(request('/', { ...body, amount: 1 }, f.headers), recordId)).status, 400);
  assert.equal((await f.handlers.checkout(request('/', { fingerprint: 'a'.repeat(5000) }, f.headers), recordId)).status, 413);
  assert.equal(f.counts().creates, 0);
  const response = await f.handlers.checkout(request('/', body, f.headers), recordId);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).writeback, 'saved');
  assert.equal(f.counts().creates, 1);
});
test('logout requires CSRF and clears the same secure cookie', async () => {
  const f = fixture();
  assert.equal((await f.handlers.logout(request('/', {}, { ...f.headers, 'x-csrf-token': '' }))).status, 403);
  const response = await f.handlers.logout(request('/', {}, f.headers));
  assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
});
test('webhook verifies original bytes, client and freshness; only durable success ACKs', async () => {
  const f = fixture();
  const uri = '/api/airtable/webhooks/antom';
  const body = JSON.stringify({ notifyType: 'PAYMENT_RESULT', synthetic: true });
  const time = new Date().toISOString();
  const signature = signRequest({ method: 'POST', uri, body, clientId: config.antom.clientId, requestTime: time, privateKey: keys.privateKey });
  const headers = { 'content-type': 'application/json', 'client-id': config.antom.clientId, 'request-time': time,
    signature: `algorithm=RSA256,keyVersion=1,signature=${signature}` };
  const signed = (content = body, extra: Record<string, string> = {}) => new Request(config.appOrigin + uri, { method: 'POST', body: content, headers: { ...headers, ...extra } });
  assert.equal((await f.handlers.webhook(signed(body + ' '))).status, 401);
  assert.equal((await f.handlers.webhook(signed(body, { 'client-id': 'wrong' }))).status, 401);
  assert.equal((await f.handlers.webhook(signed(body, { 'request-time': '2000-01-01T00:00:00Z' }))).status, 401);
  assert.equal(f.counts().notifications, 0);
  assert.equal((await f.handlers.webhook(signed())).status, 200);
  assert.equal(f.counts().notifications, 1);
  f.runtime.service.recordNotification = async () => { throw new Error('private-database-error'); };
  const failed = await f.handlers.webhook(signed());
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /SUCCESS|private-database-error/);
});
test('enabled configuration rejects production, insecure origins, broad hosts and untrusted editors', () => {
  for (const override of [ { NEXT_PUBLIC_ANTOM_ENV: 'prod' }, { NEXT_PUBLIC_SITE_URL: 'http://merchant.example' },
    { AIRTABLE_CHECKOUT_HOSTS: '*.example.com' }, { AIRTABLE_TRUST_BASE_EDITORS: 'false' },
    { AIRTABLE_OPERATOR_PASSWORD: 'short' }, { AIRTABLE_DATABASE_URL: 'https://example.com' } ]) {
    assert.throws(() => readAirtableConfig({ ...environment, ...override }), /not configured/);
  }
  assert.equal(config.antom.env, 'sandbox');
});
test('an unfinished unauthenticated webhook body times out even if stream cancellation stalls', async () => {
  const f = fixture();
  const stream = new ReadableStream<Uint8Array>({ cancel: () => new Promise(() => {}) });
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half' };
  const response = await f.handlers.webhook(new Request(config.appOrigin + '/api/airtable/webhooks/antom', init));
  assert.equal(response.status, 408);
  assert.equal(f.counts().notifications, 0);
});


test('payment sync requires authentication, origin, CSRF and an empty body; never creates payment', async () => {
  const f = fixture(); let syncs = 0;
  f.runtime.service.syncPayment = async () => { syncs++; };
  assert.equal((await f.handlers.syncPayment(request('/', {}), recordId)).status, 401);
  assert.equal((await f.handlers.syncPayment(request('/', {}, { ...f.headers, 'x-csrf-token': '' }), recordId)).status, 403);
  assert.equal((await f.handlers.syncPayment(request('/', {}, { ...f.headers, origin: 'https://attacker.example' }), recordId)).status, 403);
  assert.equal((await f.handlers.syncPayment(request('/', { paymentResult: 'S' }, f.headers), recordId)).status, 400);
  assert.equal(syncs, 0);
  assert.equal((await f.handlers.syncPayment(request('/', {}, f.headers), recordId)).status, 200);
  assert.equal(syncs, 1); assert.equal(f.counts().creates, 0);
});
