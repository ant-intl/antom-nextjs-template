import test from 'node:test';
import assert from 'node:assert/strict';
import { createAirtablePayments, type AirtableAntomPost } from '../lib/airtable/payment';
import type { AirtableConfig } from '../lib/airtable/config';
import { PaymentRejectedError, type OrderSnapshot } from '../lib/airtable/domain';
import { AntomApiError } from '../lib/antom/transport';

// Every value here is synthetic. Injected transport never contacts Antom.
const config: AirtableConfig = {
  token: 'synthetic-token', baseId: 'app12345678901234', tableId: 'tbl12345678901234',
  databaseUrl: 'postgres://synthetic.invalid/test', operatorPassword: 'synthetic-password',
  sessionSecret: 'synthetic-secret', appOrigin: 'https://merchant.example.test',
  allowedCurrencies: ['USD', 'EUR'], checkoutHosts: ['checkout.antom.com'],
  bindingId: 'synthetic-binding', settlementCurrency: 'USD',
  antom: { clientId: 'SYNTHETIC_SANDBOX', privateKey: 'not-a-real-key', publicKey: 'not-a-real-key',
    gateway: 'https://open-sea-global.alipay.com', env: 'sandbox', keyVersion: '1', signatureAlgorithm: 'RSA256' },
};
const snapshot: OrderSnapshot = {
  recordId: 'rec12345678901234', orderId: 'SYNTHETIC-ORDER-001', description: 'Synthetic workshop order',
  amountMinor: '2500', currency: 'EUR', fingerprint: 'a'.repeat(64),
};
function response(overrides: Record<string, unknown> = {}) {
  return {
    result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'success' },
    normalUrl: 'https://checkout.antom.com/checkout-page/pages/payment/index.html?sessionData=synthetic%2Bvalue',
    paymentSessionId: 'synthetic-session-id',
    paymentSessionExpiryTime: new Date(Date.now() + 30 * 60_000).toISOString(),
    ...overrides,
  };
}
const notRejected = (error: unknown) => error instanceof Error && !(error instanceof PaymentRejectedError);

test('creates Hosted Checkout from the server snapshot with isolated callback URLs', async () => {
  const expected = response();
  let calls = 0;
  const post: AirtableAntomPost = async (actualConfig, path, payload) => {
    calls++;
    assert.equal(actualConfig, config.antom);
    assert.equal(path, '/ams/api/v1/payments/createPaymentSession');
    assert.deepEqual(payload, {
      productCode: 'CASHIER_PAYMENT', productScene: 'CHECKOUT_PAYMENT', paymentRequestId: 'air_synthetic_attempt',
      order: { referenceOrderId: snapshot.orderId, orderDescription: snapshot.description,
        orderAmount: { currency: 'EUR', value: '2500' } },
      paymentAmount: { currency: 'EUR', value: '2500' },
      paymentFactor: { captureMode: 'AUTOMATIC' },
      settlementStrategy: { settlementCurrency: 'USD' },
      paymentRedirectUrl: 'https://merchant.example.test/airtable?recordId=rec12345678901234',
      paymentNotifyUrl: 'https://merchant.example.test/api/airtable/webhooks/antom',
      env: { terminalType: 'WEB' },
    });
    return expected;
  };
  const actual = await createAirtablePayments(config, post).create(snapshot, 'air_synthetic_attempt');
  assert.deepEqual(actual, { normalUrl: expected.normalUrl, paymentSessionId: expected.paymentSessionId,
    paymentSessionExpiryTime: expected.paymentSessionExpiryTime });
  assert.equal(calls, 1);
});

test('uses supplied buyer data without fabricating demo buyer fields', async () => {
  const buyer = { referenceBuyerId: 'synthetic-buyer', buyerEmail: 'buyer@example.test' };
  const post: AirtableAntomPost = async (_config, _path, payload) => {
    assert.deepEqual((payload as { order: { buyer: unknown } }).order.buyer, buyer);
    return response();
  };
  await createAirtablePayments(config, post).create({ ...snapshot, buyer }, 'air_buyer');
});

test('classifies only a verified, well-formed F as a rejected session', async () => {
  await assert.rejects(createAirtablePayments(config, async () => ({
    result: { resultCode: 'PARAM_ILLEGAL', resultStatus: 'F', resultMessage: 'synthetic rejection' },
  })).create(snapshot, 'air_rejected'), PaymentRejectedError);
  for (const value of [null, {}, { result: { resultStatus: 'F' } },
    { result: { resultCode: 'UNKNOWN_EXCEPTION', resultStatus: 'U', resultMessage: 'unknown' } },
    response({ result: { resultCode: 'PARAM_ILLEGAL', resultStatus: 'F', resultMessage: 'contradiction' } }),
    { result: { resultCode: 'SUCCESS', resultStatus: 'F', resultMessage: 'contradiction' } },
  ]) {
    await assert.rejects(createAirtablePayments(config, async () => value).create(snapshot, 'air_unknown'), notRejected);
  }
});

test('transport failure remains unknown and is never converted into a rejected payment', async () => {
  for (const error of [new Error('synthetic timeout'),
    new AntomApiError('synthetic invalid signature', 200, '', 'INVALID_RESPONSE_SIGNATURE')]) {
    let calls = 0;
    await assert.rejects(createAirtablePayments(config, async () => { calls++; throw error; })
      .create(snapshot, 'air_unknown'), actual => actual === error);
    assert.equal(calls, 1);
  }
});

test('requires usable Hosted URL, session identity and a future ISO expiry', async () => {
  for (const fields of [
    { normalUrl: undefined, paymentSessionData: 'synthetic-sdk-only' },
    { paymentSessionId: '' }, { paymentSessionExpiryTime: '' },
    { paymentSessionExpiryTime: 'tomorrow' },
    { paymentSessionExpiryTime: new Date(Date.now() - 1000).toISOString() },
    { result: { resultCode: 'OTHER', resultStatus: 'S', resultMessage: 'not success' } },
  ]) {
    await assert.rejects(createAirtablePayments(config, async () => response(fields)).create(snapshot, 'air_invalid'), notRejected);
  }
});

test('requires HTTPS, exact allowlisted host and no credentials or nonstandard port', async () => {
  for (const normalUrl of [
    'http://checkout.antom.com/session', 'javascript:alert(1)',
    'https://checkout.antom.com.example.test/session', 'https://child.checkout.antom.com/session',
    'https://other.example.test/session', 'https://user:pass@checkout.antom.com/session',
    'https://checkout.antom.com:8443/session', 'https://checkout.antom.com/session#fragment',
    ' https://checkout.antom.com/session', 'https://checkout.antom.com\\@other.example.test/session',
  ]) {
    await assert.rejects(createAirtablePayments(config, async () => response({ normalUrl })).create(snapshot, 'air_bad_url'), notRejected);
  }
  const normalUrl = 'https://checkout.antom.com:443/session?token=synthetic%2Bvalue';
  const result = await createAirtablePayments(config, async () => response({ normalUrl })).create(snapshot, 'air_standard_port');
  assert.equal(result.normalUrl, normalUrl);
});

test('rejects production configuration and invalid snapshot before contacting the transport', async () => {
  assert.throws(() => createAirtablePayments({ ...config, antom: { ...config.antom, env: 'prod' } }));
  let called = false;
  const payments = createAirtablePayments(config, async () => { called = true; return response(); });
  for (const invalid of [{ ...snapshot, amountMinor: '25.00' }, { ...snapshot, amountMinor: '-1' },
    { ...snapshot, currency: 'JPY' }, { ...snapshot, recordId: 'not-a-record' }]) {
    await assert.rejects(payments.create(invalid, 'air_invalid'));
  }
  assert.equal(called, false);
});
