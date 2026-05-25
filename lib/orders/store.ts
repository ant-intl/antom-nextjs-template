import 'server-only';

/**
 * Order persistence interface.
 * Default implementation is in-memory (for demo purposes only).
 * For production, swap with @vercel/kv, Redis, or a SQL database.
 */

export type OrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';

export interface Order {
  paymentRequestId: string;
  productId: string;
  amount: string;
  currency: string;
  status: OrderStatus;
  paymentId?: string;
  failureReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OrderStore {
  create(input: Omit<Order, 'createdAt' | 'updatedAt'>): Promise<Order>;
  get(paymentRequestId: string): Promise<Order | null>;
  markPaid(paymentRequestId: string, paymentId: string): Promise<Order | null>;
  markFailed(paymentRequestId: string, reason: string): Promise<Order | null>;
}
