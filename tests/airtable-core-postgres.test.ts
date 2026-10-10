import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { AirtableError, validateRecord, type CheckoutSession, type PaymentEvidence } from '../lib/airtable/domain';
import { PostgresAttemptStore, type SqlPool } from '../lib/airtable/postgres';

async function database() {
  const db = new PGlite();
  await db.exec(await readFile(new URL('../sql/airtable.sql', import.meta.url), 'utf8'));
  // PGlite has one physical connection. Serialize leases so its BEGIN/COMMIT
  // model has the same exclusive connection semantics as pg.Pool.connect().
  let tail = Promise.resolve();
  async function acquire() {
    let release!: () => void;
    const previous = tail;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    return release;
  }
  const query = async (sql: string, values?: unknown[]) => db.query<Record<string, unknown>>(sql, values);
  const pool: SqlPool = {
    async query(sql, values) { const release = await acquire(); try { return await query(sql, values); } finally { release(); } },
    async connect() { const release = await acquire(); return { query, release }; },
  };
  return { db, pool, store: new PostgresAttemptStore(pool, 'sandbox-test-binding') };
}

function order(recordId = 'rec12345678901234', orderId = 'ORDER-001') {
  return validateRecord({ id: recordId, fields: { 'Order ID': orderId, Description: 'Workshop', 'Amount minor': 2500, Currency: 'USD' } }, recordId, ['USD']);
}
const session: CheckoutSession = { normalUrl: 'https://checkout.example.test/one', paymentSessionId: 'session-1', paymentSessionExpiryTime: '2026-10-09T01:00:00Z' };
const evidence = (eventKey = 'event-S', status: PaymentEvidence['status'] = 'S'): PaymentEvidence => ({ eventKey, type: 'PAYMENT_RESULT', status, paymentId: 'payment-1', amountMinor: '2500', currency: 'USD' });
const errorCode = (code: string) => (error: unknown) => error instanceof AirtableError && error.code === code;

test('real SQL claim allows one winner, protects order references and isolates deployment bindings', async () => {
  const { db, pool, store } = await database();
  try {
    const claims = await Promise.all(Array.from({ length: 8 }, (_, i) => store.claim(order(), `attempt-${i}`)));
    assert.equal(claims.filter(claim => claim.created).length, 1);
    assert.equal(new Set(claims.map(claim => claim.attempt.id)).size, 1);
    await assert.rejects(store.claim(order('rec22345678901234'), 'duplicate-reference'), errorCode('ORDER_REFERENCE_ALREADY_USED'));
    const other = new PostgresAttemptStore(pool, 'other-binding');
    assert.equal(await other.get(order().recordId), null);
    assert.equal((await other.claim(order(), 'other-attempt')).created, true);
    assert.equal(await other.getByAttemptId(claims[0].attempt.id), null);
    assert.equal((await db.query('SELECT * FROM airtable_checkout_attempts')).rows.length, 2);
  } finally { await db.close(); }
});

test('real SQL persists immutable session once and preserves evidence received before session response', async () => {
  const { db, store } = await database();
  try {
    await store.claim(order(), 'attempt-1');
    await store.recordEvidence('attempt-1', evidence());
    const saved = await store.saveSession('attempt-1', session);
    assert.equal(saved.state, 'needs_review'); assert.equal(saved.hasPaymentEvidence, true);
    assert.deepEqual(saved.session, session); assert.deepEqual(saved.snapshot, order());
    await store.markUnknown('attempt-1'); await store.markRejected('attempt-1');
    assert.equal((await store.getByAttemptId('attempt-1'))?.state, 'needs_review');
    await assert.rejects(store.saveSession('attempt-1', { ...session, normalUrl: 'https://checkout.example.test/two' }), errorCode('SESSION_PERSISTENCE_CONFLICT'));
    assert.deepEqual((await store.getByAttemptId('attempt-1'))?.session, session);
  } finally { await db.close(); }
});

test('real SQL evidence is durable/idempotent/monotonic and rolls back invalid identity or amount', async () => {
  const { db, pool, store } = await database();
  try {
    await store.claim(order(), 'attempt-1'); await store.saveSession('attempt-1', session);
    await Promise.all([store.recordEvidence('attempt-1', evidence()), store.recordEvidence('attempt-1', evidence())]);
    await store.recordEvidence('attempt-1', evidence('event-F', 'F'));
    await store.recordEvidence('attempt-1', evidence('event-U', 'U'));
    assert.equal((await store.getByAttemptId('attempt-1'))?.paymentResult, 'S');
    assert.equal((await db.query('SELECT * FROM airtable_checkout_evidence')).rows.length, 3);
    await assert.rejects(store.recordEvidence('attempt-1', { ...evidence('invalid-amount'), amountMinor: '2600' }), errorCode('NOTIFICATION_AMOUNT_MISMATCH'));
    await assert.rejects(store.recordEvidence('attempt-1', { ...evidence('invalid-payment'), paymentId: 'other-payment' }), errorCode('NOTIFICATION_IDENTITY_MISMATCH'));
    const capture: PaymentEvidence = { ...evidence('capture-S'), type: 'CAPTURE_RESULT', captureId: 'capture-1', captureRequestId: 'capture-request-1' };
    await store.recordEvidence('attempt-1', capture);
    await store.recordEvidence('attempt-1', { ...capture, eventKey: 'capture-F', status: 'F' });
    assert.equal((await store.getByPaymentId('payment-1'))?.captureResult, 'S');
    const savedCapture = await db.query<{ evidence: PaymentEvidence }>("SELECT evidence FROM airtable_checkout_evidence WHERE event_key='capture-S'");
    assert.equal(savedCapture.rows[0].evidence.captureRequestId, 'capture-request-1');
    const other = new PostgresAttemptStore(pool, 'other-binding');
    assert.equal(await other.getByPaymentId('payment-1'), null);
    await assert.rejects(other.recordEvidence('attempt-1', evidence('cross-binding')), errorCode('NOTIFICATION_ATTEMPT_NOT_FOUND'));
    assert.equal((await db.query('SELECT * FROM airtable_checkout_evidence')).rows.length, 5);
  } finally { await db.close(); }
});

test('real SQL rejects reuse of one payment identity across orders without retaining a partial event', async () => {
  const { db, store } = await database();
  try {
    await store.claim(order(), 'attempt-1');
    await store.claim(order('rec22345678901234', 'ORDER-002'), 'attempt-2');
    await store.recordEvidence('attempt-1', evidence());
    await assert.rejects(store.recordEvidence('attempt-2', evidence('misrouted-payment')));
    assert.equal((await store.getByAttemptId('attempt-2'))?.hasPaymentEvidence, false);
    assert.equal((await db.query('SELECT * FROM airtable_checkout_evidence')).rows.length, 1);
  } finally { await db.close(); }
});


test('SQL projection lock serializes evidence and projects latest result; failed PATCH preserves committed evidence', async () => {
  const { db, store } = await database();
  try {
    await store.claim(order(), 'attempt-1');
    await store.recordEvidence('attempt-1', evidence('event-F', 'F'));
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const projected: string[] = [];
    const first = store.withLockedAttempt('attempt-1', async attempt => {
      started(); await new Promise<void>(resolve => { release = resolve; });
      projected.push(attempt.paymentResult!);
    });
    await entered;
    const success = store.recordEvidence('attempt-1', evidence());
    const next = store.withLockedAttempt('attempt-1', async attempt => { projected.push(attempt.paymentResult!); });
    release(); await Promise.all([first, success, next]);
    assert.deepEqual(projected, ['F', 'S']);
    await assert.rejects(store.withLockedAttempt('attempt-1', async () => { throw Error('PATCH failed'); }), /PATCH failed/);
    assert.equal((await store.getByAttemptId('attempt-1'))?.paymentResult, 'S');
    await store.recordEvidence('attempt-1', evidence('delayed-F', 'F'));
    await store.withLockedAttempt('attempt-1', async attempt => { assert.equal(attempt.paymentResult, 'S'); });
  } finally { await db.close(); }
});
