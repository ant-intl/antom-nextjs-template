import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AirtableError, PaymentRejectedError, mergeEvidenceStatus, validateRecord, type AirtableRecord, type Attempt, type CheckoutSession, type OrderSnapshot, type PaymentEvidence } from '../lib/airtable/domain';
import { createCheckoutService } from '../lib/airtable/service';
import { createAirtableRecords } from '../lib/airtable/client';
import type { AttemptStore } from '../lib/airtable/store';

const recordId = 'rec12345678901234';
const otherId = 'rec22345678901234';
const clock = Date.parse('2026-10-09T00:00:00Z');
const freshSession = (): CheckoutSession => ({ normalUrl: 'https://checkout.example.test/session/1', paymentSessionId: 'session-1', paymentSessionExpiryTime: '2026-10-09T00:30:00Z' });
const record = (id = recordId): AirtableRecord => ({ id, fields: { 'Order ID': 'ORDER-001', Description: 'Workshop', 'Amount minor': 2500, Currency: 'USD' } });
const errorCode = (code: string) => (error: unknown) => error instanceof AirtableError && error.code === code;

/** Test double only. The deployed implementation is PostgresAttemptStore. */
class TestStore implements AttemptStore {
  private tail = Promise.resolve();
  async withLockedAttempt<T>(id: string, action: (attempt: Attempt) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await action(this.rows.get(id)!); } finally { release(); }
  }
  rows = new Map<string, Attempt>();
  events = new Map<string, PaymentEvidence>();
  async get(id: string) { return [...this.rows.values()].find(row => row.snapshot.recordId === id) ?? null; }
  async getByAttemptId(id: string) { return this.rows.get(id) ?? null; }
  async getByPaymentId(id: string) { return [...this.rows.values()].find(row => row.paymentId === id) ?? null; }
  async claim(snapshot: OrderSnapshot, id: string) {
    // No await before insertion: emulate the database's atomic unique-record claim.
    const existing = [...this.rows.values()].find(row => row.snapshot.recordId === snapshot.recordId);
    if (existing) return { created: false, attempt: existing };
    if ([...this.rows.values()].some(row => row.snapshot.orderId === snapshot.orderId)) throw new AirtableError('ORDER_REFERENCE_ALREADY_USED', 409);
    const attempt: Attempt = { id, snapshot: structuredClone(snapshot), state: 'creating', session: null, hasPaymentEvidence: false, paymentId: null, paymentResult: null, captureResult: null };
    this.rows.set(id, attempt);
    return { created: true, attempt };
  }
  async saveSession(id: string, session: CheckoutSession) {
    const row = this.rows.get(id)!;
    row.session = structuredClone(session);
    row.state = row.hasPaymentEvidence ? 'needs_review' : 'session_ready';
    return row;
  }
  async markUnknown(id: string) { const row = this.rows.get(id)!; if (!row.hasPaymentEvidence) row.state = 'unknown'; }
  async markRejected(id: string) { const row = this.rows.get(id)!; if (!row.hasPaymentEvidence) row.state = 'rejected'; }
  async recordEvidence(id: string, evidence: PaymentEvidence) {
    const row = this.rows.get(id)!;
    this.events.set(evidence.eventKey, evidence);
    row.hasPaymentEvidence = true;
    row.state = 'needs_review';
    row.paymentId = evidence.paymentId;
    if (evidence.type === 'PAYMENT_RESULT') row.paymentResult = mergeEvidenceStatus(row.paymentResult, evidence.status);
    else row.captureResult = mergeEvidenceStatus(row.captureResult, evidence.status);
  }
}

function fixture() {
  let currentRecord = record();
  let currentTime = clock;
  let createCount = 0;
  let patchFailure = false;
  const writes: Record<string, string>[] = [];
  const paymentWrites: Record<string, string>[] = [];
  const attempts = new TestStore();
  let create: () => Promise<CheckoutSession> = async () => freshSession();
  const service = createCheckoutService({
    bindingId: 'sandbox-binding', allowedCurrencies: ['USD', 'EUR'], attempts,
    now: () => currentTime,
    records: {
      async get(id) { return { ...structuredClone(currentRecord), id }; },
      async writePayment(_id, fields) { if (patchFailure) throw Error('quota'); paymentWrites.push(fields); },
      async writeSession(_id, fields) { if (patchFailure) throw Error('quota'); writes.push(fields); },
    },
    payments: { async create() { createCount++; return create(); } },
  });
  return {
    service, attempts, writes, paymentWrites,
    setRecord(value: AirtableRecord) { currentRecord = value; },
    setTime(value: number) { currentTime = value; },
    setCreate(value: () => Promise<CheckoutSession>) { create = value; },
    setPatchFailure(value: boolean) { patchFailure = value; },
    get createCount() { return createCount; },
    async fingerprint() { return (await service.preview(recordId)).order.fingerprint; },
  };
}

function payment(attemptId: string, status = 'S') {
  return { notifyType: 'PAYMENT_RESULT', paymentRequestId: attemptId, paymentId: 'payment-1', result: { resultStatus: status }, paymentAmount: { value: '2500', currency: 'USD' } };
}

test('order validation rejects unsafe values and includes optional real buyer in immutable fingerprint', () => {
  for (const amount of [0, -1, 0.5, '2500', Number.MAX_SAFE_INTEGER + 1]) {
    const candidate = record(); candidate.fields['Amount minor'] = amount;
    assert.throws(() => validateRecord(candidate, recordId, ['USD']), errorCode('INVALID_AMOUNT'));
  }
  const base = validateRecord(record(), recordId, ['USD']);
  assert.equal(base.buyer, undefined);
  const named = record(); named.fields['Buyer email'] = 'buyer@example.test';
  const buyer = validateRecord(named, recordId, ['USD']);
  assert.deepEqual(buyer.buyer, { buyerEmail: 'buyer@example.test' });
  assert.notEqual(buyer.fingerprint, base.fingerprint);
  named.fields['Buyer email'] = 'wrong@';
  assert.throws(() => validateRecord(named, recordId, ['USD']), errorCode('INVALID_BUYER_EMAIL'));
  const projected = record(); projected.fields['Checkout URL'] = 'https://untrusted.test/';
  assert.equal(validateRecord(projected, recordId, ['USD']).fingerprint, base.fingerprint);
});

test('preview has no claim or payment side effect; a changed confirmation cannot create payment', async () => {
  const f = fixture(); const fingerprint = await f.fingerprint();
  assert.equal(f.createCount, 0); assert.equal(f.attempts.rows.size, 0);
  const changed = record(); changed.fields['Amount minor'] = 2600; f.setRecord(changed);
  await assert.rejects(f.service.start(recordId, fingerprint), errorCode('ORDER_CHANGED'));
  assert.equal(f.createCount, 0); assert.equal(f.attempts.rows.size, 0);
});

test('two concurrent confirmations create exactly one attempt and never race a second Antom request', async () => {
  const f = fixture(); const fingerprint = await f.fingerprint();
  let unblock!: () => void;
  f.setCreate(async () => { await new Promise<void>(resolve => { unblock = resolve; }); return freshSession(); });
  const first = f.service.start(recordId, fingerprint);
  // Let the first continuation reach the external request.
  while (!unblock) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(f.service.start(recordId, fingerprint), errorCode('ATTEMPT_REQUIRES_REVIEW'));
  unblock(); await first;
  assert.equal(f.createCount, 1); assert.equal(f.attempts.rows.size, 1);
});

test('writeback failure reuses the persisted session and only retries Airtable writeback', async () => {
  const f = fixture(); const fingerprint = await f.fingerprint(); f.setPatchFailure(true);
  const first = await f.service.start(recordId, fingerprint);
  assert.equal(first.writeback, 'pending'); assert.equal(f.attempts.rows.size, 1);
  f.setPatchFailure(false);
  const retry = await f.service.start(recordId, fingerprint);
  assert.equal(retry.reused, true); assert.equal(retry.writeback, 'complete');
  assert.equal(f.createCount, 1); assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0]['Checkout URL'], first.session.normalUrl);
  assert.equal(f.writes[0]['Review status'], undefined);
});

test('preview only exposes a checkout for an unchanged, unexpired session without payment evidence', async () => {
  const f = fixture();
  await f.service.start(recordId, await f.fingerprint());
  const ready = (await f.service.preview(recordId)).attempt;
  assert.equal(ready?.checkoutUrl, freshSession().normalUrl);
  assert.equal(ready?.writeback, 'pending');
  const changed = record(); changed.fields['Amount minor'] = 2600; f.setRecord(changed);
  const changedPreview = (await f.service.preview(recordId)).attempt;
  assert.equal(changedPreview?.state, 'needs_review');
  assert.equal(changedPreview?.checkoutUrl, undefined);
  f.setRecord(record()); f.setTime(clock + 60 * 60 * 1000);
  assert.equal((await f.service.preview(recordId)).attempt?.state, 'expired');
  assert.equal((await f.service.preview(recordId)).attempt?.checkoutUrl, undefined);
  f.setTime(clock);
  await f.service.recordNotification(payment([...f.attempts.rows.keys()][0]));
  assert.equal((await f.service.preview(recordId)).attempt?.checkoutUrl, undefined);
  assert.equal(f.createCount, 1); assert.equal(f.writes.length, 1);
});

test('unknown, rejected and expired attempts all block automatic replacement sessions', async () => {
  for (const rejected of [false, true]) {
    const f = fixture(); const fingerprint = await f.fingerprint();
    f.setCreate(async () => { throw rejected ? new PaymentRejectedError('F') : Error('timeout'); });
    await assert.rejects(f.service.start(recordId, fingerprint), errorCode(rejected ? 'PAYMENT_REJECTED' : 'PAYMENT_OUTCOME_UNKNOWN'));
    await assert.rejects(f.service.start(recordId, fingerprint), errorCode('ATTEMPT_REQUIRES_REVIEW'));
    assert.equal(f.createCount, 1);
  }
  const f = fixture(); const fingerprint = await f.fingerprint(); await f.service.start(recordId, fingerprint);
  f.setTime(Date.parse('2026-10-09T01:00:00Z'));
  await assert.rejects(f.service.start(recordId, fingerprint), errorCode('SESSION_EXPIRED_REQUIRES_REVIEW'));
  assert.equal((await f.service.preview(recordId)).attempt?.state, 'expired'); assert.equal(f.createCount, 1);
});

test('changed order after session creation is never written back and cannot bypass the frozen snapshot', async () => {
  const f = fixture(); const fingerprint = await f.fingerprint();
  f.setCreate(async () => { const changed = record(); changed.fields['Amount minor'] = 6000; f.setRecord(changed); return freshSession(); });
  await assert.rejects(f.service.start(recordId, fingerprint), errorCode('ORDER_CHANGED'));
  assert.equal(f.writes.length, 0);
  assert.equal([...f.attempts.rows.values()][0].session?.paymentSessionId, 'session-1');
  await assert.rejects(f.service.start(recordId, await f.fingerprint()), errorCode('ORDER_CHANGED'));
  assert.equal(f.createCount, 1);
});

test('persist failure never exposes the created session or writes it to Airtable', async () => {
  const f = fixture(); const fingerprint = await f.fingerprint();
  f.attempts.saveSession = async () => { throw Error('database unavailable'); };
  await assert.rejects(f.service.start(recordId, fingerprint), /database unavailable/);
  assert.equal(f.writes.length, 0);
  await assert.rejects(f.service.start(recordId, fingerprint), errorCode('ATTEMPT_REQUIRES_REVIEW'));
  assert.equal(f.createCount, 1);
});

test('duplicate Order ID in a different Airtable record cannot create a second payment', async () => {
  const f = fixture(); await f.service.start(recordId, await f.fingerprint());
  const fingerprint = (await f.service.preview(otherId)).order.fingerprint;
  await assert.rejects(f.service.start(otherId, fingerprint), errorCode('ORDER_REFERENCE_ALREADY_USED'));
  assert.equal(f.createCount, 1);
});

test('verified notification is idempotent, cannot downgrade success and prevents session reuse', async () => {
  const f = fixture(); const fingerprint = await f.fingerprint(); await f.service.start(recordId, fingerprint);
  const id = [...f.attempts.rows.keys()][0];
  await f.service.recordNotification(payment(id)); await f.service.recordNotification(payment(id));
  await f.service.recordNotification(payment(id, 'F'));
  const row = f.attempts.rows.get(id)!;
  assert.equal(row.paymentResult, 'S'); assert.equal(f.attempts.events.size, 2);
  await assert.rejects(f.service.start(recordId, fingerprint), errorCode('PAYMENT_REQUIRES_REVIEW'));
  assert.equal(f.createCount, 1); assert.equal(f.writes.length, 1);
  const capture = { notifyType: 'CAPTURE_RESULT', paymentId: 'payment-1', captureId: 'capture-1', captureRequestId: 'capture-request-1', captureAmount: { value: '2500', currency: 'USD' }, result: { resultStatus: 'S' } };
  await f.service.recordNotification(capture); await f.service.recordNotification(capture);
  assert.equal(row.captureResult, 'S'); assert.equal(f.attempts.events.size, 3);
  const savedCapture = [...f.attempts.events.values()].find(item => item.type === 'CAPTURE_RESULT');
  assert.equal(savedCapture?.captureRequestId, 'capture-request-1');
  await assert.rejects(f.service.recordNotification({ ...capture, captureRequestId: undefined }), errorCode('INVALID_NOTIFICATION_ID'));
});

test('unknown identity, amount mismatch and capture without established payment are never acknowledged', async () => {
  const f = fixture(); await f.service.start(recordId, await f.fingerprint());
  const id = [...f.attempts.rows.keys()][0];
  await assert.rejects(f.service.recordNotification(payment('foreign-attempt')), errorCode('NOTIFICATION_ATTEMPT_NOT_FOUND'));
  const wrongAmount = payment(id); wrongAmount.paymentAmount.value = '2600';
  await assert.rejects(f.service.recordNotification(wrongAmount), errorCode('NOTIFICATION_AMOUNT_MISMATCH'));
  const wrongCurrency = payment(id); wrongCurrency.paymentAmount.currency = 'EUR';
  await assert.rejects(f.service.recordNotification(wrongCurrency), errorCode('NOTIFICATION_AMOUNT_MISMATCH'));
  await assert.rejects(f.service.recordNotification({ notifyType: 'CAPTURE_RESULT', paymentId: 'payment-1', captureId: 'capture-1', captureAmount: { value: '2500', currency: 'USD' }, result: { resultStatus: 'S' } }), errorCode('NOTIFICATION_ATTEMPT_NOT_FOUND'));
  assert.equal(f.attempts.events.size, 0);
  f.attempts.recordEvidence = async () => { throw Error('disk unavailable'); };
  await assert.rejects(f.service.recordNotification(payment(id)), /disk unavailable/);
});

test('notification during session creation prevents ready projection and URL return', async () => {
  const f = fixture(); const fingerprint = await f.fingerprint();
  f.setCreate(async () => { await f.service.recordNotification(payment([...f.attempts.rows.keys()][0])); return freshSession(); });
  await assert.rejects(f.service.start(recordId, fingerprint), errorCode('PAYMENT_REQUIRES_REVIEW'));
  assert.equal(f.writes.length, 0); assert.equal([...f.attempts.rows.values()][0].state, 'needs_review');
});

test('Airtable client fixes base and table, rejects redirects and never writes manual review fields', async () => {
  const requests: { input: string; init?: RequestInit }[] = [];
  const records = createAirtableRecords({ token: 'private-test-token', baseId: 'app12345678901234', tableId: 'tbl12345678901234', fetch: (async (input, init) => {
    requests.push({ input: String(input), init });
    return Response.json(record());
  }) as typeof fetch });
  await records.get(recordId);
  assert.equal(requests[0].input, `https://api.airtable.com/v0/app12345678901234/tbl12345678901234/${recordId}`);
  assert.equal(requests[0].init?.redirect, 'error');
  await assert.rejects(records.writeSession(recordId, { 'Review status': 'Verified paid' }), errorCode('INVALID_WRITEBACK_FIELDS'));
  await assert.rejects(records.get('../foreign'), errorCode('INVALID_RECORD_ID'));
  assert.equal(requests.length, 1);
});


test('payment callback projects durable success, removes the link, and never changes manual review', async () => {
  const f = fixture(); await f.service.start(recordId, await f.fingerprint());
  const id = [...f.attempts.rows.keys()][0];
  await f.service.recordNotification(payment(id));
  assert.deepEqual(f.paymentWrites[0], {
    'Payment result': 'Success', 'Capture result': 'Not received', 'Antom payment ID': 'payment-1', 'Checkout URL': '',
  });
  await f.service.recordNotification(payment(id, 'F'));
  assert.equal(f.paymentWrites[1]['Payment result'], 'Success');
  const preview = (await f.service.preview(recordId)).attempt!;
  assert.equal(preview.paymentResult, 'S'); assert.equal(preview.paymentId, 'payment-1');
  assert.equal(preview.checkoutUrl, undefined);
  assert.equal(f.createCount, 1);
});

test('Airtable failure retains payment evidence; explicit sync recovers without another payment', async () => {
  const f = fixture(); await f.service.start(recordId, await f.fingerprint());
  const id = [...f.attempts.rows.keys()][0]; f.setPatchFailure(true);
  await assert.rejects(f.service.recordNotification(payment(id)), errorCode('PAYMENT_SYNC_PENDING'));
  assert.equal(f.attempts.rows.get(id)?.paymentResult, 'S');
  assert.equal(f.attempts.events.size, 1); assert.equal(f.paymentWrites.length, 0);
  f.setPatchFailure(false); await f.service.syncPayment(recordId);
  await f.service.recordNotification(payment(id));
  assert.equal(f.paymentWrites.length, 2); assert.equal(f.attempts.events.size, 1);
  assert.equal(f.createCount, 1);
});

test('sync rejects absent evidence and edited order; GET never performs projection', async () => {
  const f = fixture();
  await assert.rejects(f.service.syncPayment(recordId), errorCode('NO_PAYMENT_EVIDENCE'));
  await f.service.start(recordId, await f.fingerprint());
  await assert.rejects(f.service.syncPayment(recordId), errorCode('NO_PAYMENT_EVIDENCE'));
  const id = [...f.attempts.rows.keys()][0];
  const changed = record(); changed.fields['Amount minor'] = 6000; f.setRecord(changed);
  await assert.rejects(f.service.recordNotification(payment(id)), errorCode('ORDER_CHANGED'));
  assert.equal(f.attempts.rows.get(id)?.paymentResult, 'S');
  assert.equal((await f.service.preview(recordId)).attempt?.orderChanged, true);
  await assert.rejects(f.service.syncPayment(recordId), errorCode('ORDER_CHANGED'));
  assert.equal(f.paymentWrites.length, 0);
});

test('payment writer rejects manual review, inputs and arbitrary checkout URLs', async () => {
  let requests = 0;
  const records = createAirtableRecords({ token: 'synthetic', baseId: 'app12345678901234', tableId: 'tbl12345678901234',
    fetch: (async () => { requests++; return Response.json(record()); }) as typeof fetch });
  for (const fields of ([{ 'Review status': 'Verified paid' }, { 'Amount minor': '1' }, { 'Checkout URL': 'https://attacker.example' }] as Record<string, string>[])) {
    await assert.rejects(records.writePayment(recordId, fields), errorCode('INVALID_WRITEBACK_FIELDS'));
  }
  assert.equal(requests, 0);
});
