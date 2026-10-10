import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, verifySession, csrfToken, verifyCsrf, sessionCookie, readSessionCookie } from '../lib/airtable/auth';
import { readAirtableConfig } from '../lib/airtable/config';

const secret = 'synthetic-session-secret-only-for-unit-tests';
test('operator sessions expire and cannot cross a merchant/base binding', () => {
  const token = issueSession(secret, 'binding-one', 1_000_000);
  assert.equal(verifySession(token, secret, 'binding-one', 1_000_000), true);
  assert.equal(verifySession(token, secret, 'binding-two', 1_000_000), false);
  assert.equal(verifySession(token, secret, 'binding-one', 4_601_000), false);
  assert.equal(verifySession(token + 'x', secret, 'binding-one', 1_000_000), false);
  assert.equal(verifySession(token, 'different-secret', 'binding-one', 1_000_000), false);
});
test('CSRF tokens are tied to an authenticated session', () => {
  const first = issueSession(secret, 'binding');
  const second = issueSession(secret, 'binding');
  const csrf = csrfToken(first, secret);
  assert.equal(verifyCsrf(csrf, first, secret), true);
  assert.equal(verifyCsrf(csrf, second, secret), false);
});
test('host-only secure HttpOnly cookies reject ambiguous duplicate values', () => {
  assert.match(sessionCookie('test'), /__Host-antom-airtable=test; Path=\/; HttpOnly; Secure; SameSite=Strict/);
  assert.match(sessionCookie('', true), /Max-Age=0/);
  const request = new Request('https://merchant.example', { headers: { cookie: '__Host-antom-airtable=a; __Host-antom-airtable=b' } });
  assert.equal(readSessionCookie(request), '');
});
test('disabled integration needs no Airtable, database or Antom secrets', () => {
  assert.equal(readAirtableConfig({}), null);
  assert.equal(readAirtableConfig({ AIRTABLE_ENABLED: 'false', AIRTABLE_DATABASE_URL: 'invalid' }), null);
});
test('enabled integration fails closed on missing configuration without echoing secrets', () => {
  assert.throws(() => readAirtableConfig({ AIRTABLE_ENABLED: 'true', AIRTABLE_PAT: 'do-not-echo-this' }),
    /Airtable integration is not configured/);
});
