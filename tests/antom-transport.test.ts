import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  AntomApiError, antomPostWithConfig, resolveApiPath, validateGateway,
  type AntomTransportConfig,
} from '../lib/antom/transport';
import { parseSignatureHeader, verifyWebhook } from '../lib/antom/sign';

function keyPair() {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}
const merchant = keyPair();
const provider = keyPair();
const config: AntomTransportConfig = {
  clientId: 'SYNTHETIC_SANDBOX_CLIENT', privateKey: merchant.privateKey,
  publicKey: provider.publicKey, gateway: 'https://open-sea-global.alipay.com',
  env: 'sandbox', keyVersion: '1', signatureAlgorithm: 'RSA256',
};
const path = '/ams/api/v1/payments/createPaymentSession';
const sandboxPath = '/ams/sandbox/api/v1/payments/createPaymentSession';
const time = '2026-10-09T00:00:00+00:00';
const now = () => Date.parse(time);

function signedResponse(
  raw: string | Uint8Array = '{ "result": {"resultStatus":"S"}, "label":"合成数据" }',
  options: { uri?: string; time?: string; clientId?: string; status?: number } = {},
) {
  const bytes = Buffer.from(raw);
  const clientId = options.clientId ?? config.clientId;
  const responseTime = options.time ?? time;
  const signature = crypto.sign('RSA-SHA256', Buffer.concat([
    Buffer.from(`POST ${options.uri ?? sandboxPath}\n${clientId}.${responseTime}.`), bytes,
  ]), provider.privateKey).toString('base64');
  return new Response(new Uint8Array(bytes), {
    status: options.status ?? 200,
    headers: {
      'client-id': clientId, 'response-time': responseTime,
      // Antom's response key version need not equal the merchant request key version.
      signature: `algorithm=RSA256,keyVersion=2,signature=${encodeURIComponent(signature)}`,
    },
  });
}
function errorCode(code: AntomApiError['code']) {
  return (error: unknown) => error instanceof AntomApiError && error.code === code;
}

test('sandbox signs the actual wire path and sends exactly the signed body', async () => {
  const payload = { paymentRequestId: 'SYNTHETIC-001', label: '合成订单' };
  const result = await antomPostWithConfig<{ label: string }>(config, path, payload, {
    now,
    fetchFn: async (input, init) => {
      assert.equal(input, config.gateway + sandboxPath);
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.body, JSON.stringify(payload));
      const headers = new Headers(init?.headers);
      const signature = parseSignatureHeader(headers.get('signature')!).signature!;
      assert.equal(verifyWebhook({ method: 'POST', uri: sandboxPath,
        body: init?.body as string, clientId: config.clientId,
        requestTime: headers.get('request-time')!, signature,
        antomPublicKey: merchant.publicKey }), true);
      return signedResponse();
    },
  });
  assert.equal(result.label, '合成数据');
});

test('production path and documented gateway aliases remain supported', async () => {
  assert.equal(resolveApiPath(path, 'prod'), path);
  assert.equal(resolveApiPath(sandboxPath, 'sandbox'), sandboxPath);
  for (const host of ['open-sea-global.alipay.com', 'open-sea.alipay.com',
    'open-de-global.alipay.com', 'open-na-global.alipay.com', 'open-na.alipay.com', 'open.antglobal-us.com']) {
    assert.equal(validateGateway(`https://${host}/`), `https://${host}`);
  }
  const result = await antomPostWithConfig<{ result: string }>({ ...config, env: 'prod' }, path, {}, {
    now, fetchFn: async (input) => {
      assert.equal(input, config.gateway + path);
      return signedResponse('{"result":"synthetic"}', { uri: path });
    },
  });
  assert.equal(result.result, 'synthetic');
});

test('signed query strings are preserved after environment resolution', async () => {
  const query = '?mode=test%2Bvalue';
  await antomPostWithConfig(config, path + query, {}, { now,
    fetchFn: async (input) => {
      assert.equal(input, config.gateway + sandboxPath + query);
      return signedResponse('{}', { uri: sandboxPath + query });
    },
  });
});

test('rejects undocumented regions, external origins and ambiguous API paths', () => {
  for (const gateway of [
    'https://open-eu-global.alipay.com', 'https://open-us-global.alipay.com',
    'https://open-global.alipay.com', 'https://open-eu.alipay.com',
    'http://open-sea-global.alipay.com', 'https://example.invalid',
    'https://user:pass@open-sea-global.alipay.com', 'https://open-sea-global.alipay.com:8443',
    'https://open-sea-global.alipay.com/other', 'https://open-sea-global.alipay.com?x=1',
  ]) assert.throws(() => validateGateway(gateway));
  for (const bad of ['//example.invalid/pay', '/ams/api/v1/../pay',
    '/ams/api/v1/payments/%2e%2e/pay', path + '#fragment', path + '\n']) {
    assert.throws(() => resolveApiPath(bad, 'sandbox'));
  }
  assert.throws(() => resolveApiPath(sandboxPath, 'prod'));
});

test('invalid configuration is rejected before any network access', async () => {
  let called = false;
  await assert.rejects(antomPostWithConfig({ ...config, gateway: 'https://example.invalid' }, path, {}, {
    now, fetchFn: async () => { called = true; return signedResponse(); },
  }), errorCode('CONFIGURATION'));
  assert.equal(called, false);
});

test('missing signature is rejected before malformed JSON is parsed', async () => {
  await assert.rejects(antomPostWithConfig(config, path, {}, { now,
    fetchFn: async () => new Response('not JSON', { headers: {
      'client-id': config.clientId, 'response-time': time,
    } }),
  }), errorCode('INVALID_RESPONSE_SIGNATURE'));
});

test('rejects missing required headers and signatures for a different merchant or URI', async () => {
  const cases = [
    () => { const r = signedResponse(); r.headers.delete('client-id'); return r; },
    () => { const r = signedResponse(); r.headers.delete('response-time'); return r; },
    () => signedResponse('{}', { clientId: 'OTHER_SYNTHETIC_MERCHANT' }),
    () => signedResponse('{}', { uri: path }),
    () => signedResponse('{}', { time: '2026-10-08T23:00:00+00:00' }),
  ];
  for (const response of cases) {
    await assert.rejects(antomPostWithConfig(config, path, {}, { now, fetchFn: async () => response() }),
      errorCode('INVALID_RESPONSE_SIGNATURE'));
  }
});

test('response verification uses the original bytes and rejects body tampering', async () => {
  const original = signedResponse('{"result":"synthetic"}');
  await assert.rejects(antomPostWithConfig(config, path, {}, { now,
    fetchFn: async () => new Response('{ "result":"synthetic"}', { headers: original.headers }),
  }), errorCode('INVALID_RESPONSE_SIGNATURE'));
});

test('rejects malformed, duplicate and unsupported signature metadata', async () => {
  for (const mutate of [
    (s: string) => s.replace('RSA256', 'OTHER'),
    (s: string) => s + ',algorithm=RSA256',
    (s: string) => s.replace(/signature=.*/, 'signature=%not-encoded'),
    (s: string) => s.replace('algorithm=RSA256,', ''),
    (s: string) => s.replace('keyVersion=2,', ''),
  ]) {
    await assert.rejects(antomPostWithConfig(config, path, {}, { now,
      fetchFn: async () => {
        const response = signedResponse();
        response.headers.set('signature', mutate(response.headers.get('signature')!));
        return response;
      },
    }), errorCode('INVALID_RESPONSE_SIGNATURE'));
  }
});

test('only an authenticated HTTP error exposes its upstream body', async () => {
  await assert.rejects(antomPostWithConfig(config, path, {}, { now,
    fetchFn: async () => signedResponse('{"result":"synthetic error"}', { status: 500 }),
  }), (error: unknown) => error instanceof AntomApiError && error.code === 'HTTP_ERROR' && error.status === 500 && error.body.includes('synthetic error'));
  await assert.rejects(antomPostWithConfig(config, path, {}, { now,
    fetchFn: async () => new Response('untrusted error', { status: 500 }),
  }), (error: unknown) => error instanceof AntomApiError && error.code === 'INVALID_RESPONSE_SIGNATURE' && error.body === '');
});

test('signed invalid JSON and invalid UTF-8 are rejected after verification', async () => {
  for (const raw of ['{invalid', new Uint8Array([0xc3, 0x28])]) {
    await assert.rejects(antomPostWithConfig(config, path, {}, { now,
      fetchFn: async () => signedResponse(raw),
    }), errorCode('INVALID_JSON'));
  }
});

test('does not accept gateway redirects even from a custom fetch implementation', async () => {
  await assert.rejects(antomPostWithConfig(config, path, {}, { now,
    fetchFn: async (_input, init) => {
      assert.equal(init?.redirect, 'error');
      return new Response(null, { status: 302, headers: { location: 'https://example.invalid' } });
    },
  }), errorCode('REDIRECT'));
});

test('bounds declared and streamed response size', async () => {
  let cancelled = false;
  await assert.rejects(antomPostWithConfig(config, path, {}, { now, maxResponseBytes: 8,
    fetchFn: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(9)); },
      cancel() { cancelled = true; },
    })),
  }), errorCode('RESPONSE_TOO_LARGE'));
  assert.equal(cancelled, true);
  await assert.rejects(antomPostWithConfig(config, path, {}, { now, maxResponseBytes: 8,
    fetchFn: async () => new Response('{}', { headers: { 'content-length': '9' } }),
  }), errorCode('RESPONSE_TOO_LARGE'));
});

test('deadline covers both a stalled fetch and a stalled response body', async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(antomPostWithConfig(config, path, {}, { now, timeoutMs: 15,
    fetchFn: async (_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    },
  }), errorCode('TIMEOUT'));
  assert.equal(signal?.aborted, true);
  await assert.rejects(antomPostWithConfig(config, path, {}, { now, timeoutMs: 15,
    fetchFn: async () => new Response(new ReadableStream({ start() {} })),
  }), errorCode('TIMEOUT'));
});
