import 'server-only';
import type { Order, OrderStore } from './store';

/**
 * In-memory order store for DEMO ONLY.
 *
 * Production warning:
 * - Vercel serverless functions are stateless across cold starts.
 * - Concurrent requests may hit different instances, each with its own Map.
 * - This means: data is lost on deploy, and webhook idempotency cannot be
 *   relied on (an `existing.status === 'PAID'` check on one instance won't
 *   see writes made by another).
 *
 * Before going to production replace `orderStore` below with a shared
 * persistence layer (e.g. @vercel/kv, Redis, Postgres) implementing the
 * `OrderStore` interface from `./store`.
 */

const store = new Map<string, Order>();

export const memoryOrderStore: OrderStore = {
  async create(input) {
    const now = Date.now();
    const order: Order = { ...input, createdAt: now, updatedAt: now };
    store.set(order.paymentRequestId, order);
    return order;
  },

  async get(paymentRequestId) {
    return store.get(paymentRequestId) ?? null;
  },

  async markPaid(paymentRequestId, paymentId) {
    const existing = store.get(paymentRequestId);
    if (!existing) return null;
    const updated: Order = {
      ...existing,
      status: 'PAID',
      paymentId,
      updatedAt: Date.now(),
    };
    store.set(paymentRequestId, updated);
    return updated;
  },

  async markFailed(paymentRequestId, reason) {
    const existing = store.get(paymentRequestId);
    if (!existing) return null;
    const updated: Order = {
      ...existing,
      status: 'FAILED',
      failureReason: reason,
      updatedAt: Date.now(),
    };
    store.set(paymentRequestId, updated);
    return updated;
  },
};

// Swap this export for a persistent implementation before going to production.
export const orderStore: OrderStore = memoryOrderStore;
