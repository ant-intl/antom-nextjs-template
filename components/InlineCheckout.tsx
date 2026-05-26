'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CheckoutFrame } from '@/components/CheckoutFrame';
import type { Product } from '@/config/products';
import { formatPrice } from '@/config/products';
import type {
  ApiError,
  CreateSessionRequest,
  CreateSessionSuccess,
} from '@/lib/api-contracts';

interface InlineCheckoutProps {
  product: Product;
  environment: 'sandbox' | 'prod';
}

async function createPaymentSession(
  body: CreateSessionRequest,
): Promise<CreateSessionSuccess> {
  const res = await fetch('/api/create-payment-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as CreateSessionSuccess | ApiError;
  if (!res.ok || 'error' in data) {
    const message = 'error' in data ? data.error : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export function InlineCheckout({ product, environment }: InlineCheckoutProps) {
  const [session, setSession] = useState<CreateSessionSuccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const data = await createPaymentSession({ productId: product.id, quantity: 1 });
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-8">
      <header className="mb-8 flex flex-col gap-3 border-b border-gray-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal text-gray-950">
            Vercel Payment Template
          </h1>
        </div>
        <p className="text-sm text-gray-500">
          Environment:{' '}
          <code className="rounded bg-gray-100 px-2 py-0.5 text-xs">
            {environment}
          </code>
        </p>
      </header>

      <section
        className={
          session
            ? 'grid grid-cols-1 items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]'
            : 'grid grid-cols-1 items-start gap-6 lg:grid-cols-[380px]'
        }
      >
        <aside className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex justify-center">
              <Image
                src={product.imageSrc}
                alt={product.name}
                width={144}
                height={144}
                className="object-contain"
                priority
              />
            </div>
            <div className="mb-1 text-center text-3xl font-semibold text-gray-950">
              {formatPrice(product.price, product.currency)}
            </div>
            <h2 className="text-center text-lg font-medium text-gray-600">
              {product.name}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {product.description}
            </p>

            <div className="mt-6 border-t border-gray-100 pt-5">
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span className="font-medium text-gray-900">
                  {formatPrice(product.price, product.currency)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-base font-semibold text-gray-950">
                <span>Total</span>
                <span>{formatPrice(product.price, product.currency)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={startCheckout}
              disabled={loading}
              className="mt-6 w-full rounded-lg bg-antom-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-antom-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Creating checkout...' : session ? 'Refresh checkout' : 'Pay with Antom'}
            </button>

            {error && (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
        </aside>

        {session && (
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">Cashier</h2>
                </div>
                {notice && (
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
                    {notice}
                  </span>
                )}
              </div>
              <CheckoutFrame
                key={session.paymentRequestId}
                paymentSessionData={session.paymentSessionData}
                paymentRequestId={session.paymentRequestId}
                normalUrl={session.normalUrl}
                onSuccess={() => setNotice('Payment success')}
                onFail={(message) => setNotice(message)}
              />
          </section>
        )}
      </section>
    </main>
  );
}
