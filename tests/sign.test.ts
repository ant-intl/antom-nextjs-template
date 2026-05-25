import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  buildRequestTime,
  parseSignatureHeader,
  signRequest,
  verifyWebhook,
} from '../lib/antom/sign';

function generateKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const toRaw = (key: crypto.KeyObject, type: 'pkcs8' | 'spki') => {
    const pem = key.export({ format: 'pem', type }).toString();
    return pem
      .replace(/-----[^-]+-----/g, '')
      .replace(/\s+/g, '');
  };
  return {
    privateKeyRaw: toRaw(privateKey, 'pkcs8'),
    publicKeyRaw: toRaw(publicKey, 'spki'),
  };
}

test('buildRequestTime returns UTC ISO8601 with +00:00 offset', () => {
  const fixed = new Date(Date.UTC(2026, 4, 20, 10, 30, 45));
  assert.equal(buildRequestTime(fixed), '2026-05-20T10:30:45+00:00');
});

test('buildRequestTime is stable regardless of host TZ representation', () => {
  // Two Date objects representing the exact same instant should produce the same string.
  const a = new Date('2026-05-20T10:30:45Z');
  const b = new Date(a.getTime());
  assert.equal(buildRequestTime(a), buildRequestTime(b));
});

test('parseSignatureHeader extracts URL-decoded signature', () => {
  const raw = 'algorithm=RSA256,keyVersion=1,signature=abc%2Bdef%3D%3D';
  const parsed = parseSignatureHeader(raw);
  assert.equal(parsed.algorithm, 'RSA256');
  assert.equal(parsed.keyVersion, '1');
  assert.equal(parsed.signature, 'abc+def==');
});

test('parseSignatureHeader handles signatures containing "=" characters', () => {
  // Base64 padding survives despite split('=')
  const raw = 'signature=Zm9vYmFy%3D%3D';
  const parsed = parseSignatureHeader(raw);
  assert.equal(parsed.signature, 'Zm9vYmFy==');
});

test('signRequest output verifies with verifyWebhook (round trip)', () => {
  const { privateKeyRaw, publicKeyRaw } = generateKeyPair();
  const clientId = 'TEST_CLIENT';
  const requestTime = buildRequestTime(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)));
  const body = JSON.stringify({ paymentRequestId: 'abc123', amount: '100' });

  const encoded = signRequest({
    method: 'POST',
    uri: '/api/webhooks/antom',
    body,
    clientId,
    requestTime,
    privateKey: privateKeyRaw,
  });

  // signRequest returns URL-encoded; verify expects URL-decoded.
  const decoded = decodeURIComponent(encoded);

  const ok = verifyWebhook({
    method: 'POST',
    uri: '/api/webhooks/antom',
    body,
    clientId,
    requestTime,
    signature: decoded,
    antomPublicKey: publicKeyRaw,
  });

  assert.equal(ok, true);
});

test('verifyWebhook rejects tampered body', () => {
  const { privateKeyRaw, publicKeyRaw } = generateKeyPair();
  const clientId = 'TEST_CLIENT';
  const requestTime = buildRequestTime();
  const body = JSON.stringify({ paymentRequestId: 'abc123' });

  const encoded = signRequest({
    method: 'POST',
    uri: '/api/webhooks/antom',
    body,
    clientId,
    requestTime,
    privateKey: privateKeyRaw,
  });

  const ok = verifyWebhook({
    method: 'POST',
    uri: '/api/webhooks/antom',
    body: body + ' ', // mutated by a single byte
    clientId,
    requestTime,
    signature: decodeURIComponent(encoded),
    antomPublicKey: publicKeyRaw,
  });

  assert.equal(ok, false);
});

test('verifyWebhook returns false on malformed signature input instead of throwing', () => {
  const { publicKeyRaw } = generateKeyPair();
  const ok = verifyWebhook({
    method: 'POST',
    uri: '/api/webhooks/antom',
    body: '{}',
    clientId: 'x',
    requestTime: buildRequestTime(),
    signature: 'not-base64!!!',
    antomPublicKey: publicKeyRaw,
  });
  assert.equal(ok, false);
});
