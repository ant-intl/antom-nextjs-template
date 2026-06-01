'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CheckoutFrame } from '@/components/CheckoutFrame';
import { StarRating } from '@/components/StarRating';
import { QuantityStepper } from '@/components/QuantityStepper';
import type { Product } from '@/config/products';
import { formatPrice } from '@/config/products';
import type {
  ApiError,
  CreateSessionRequest,
  CreateSessionSuccess,
} from '@/lib/api-contracts';

interface InlineCheckoutProps {
  product: Product;
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

function LockNote() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
        <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      Secure checkout · Antom
    </div>
  );
}

export function InlineCheckout({ product }: InlineCheckoutProps) {
  const [session, setSession] = useState<CreateSessionSuccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  const subtotal = product.price * quantity;

  async function startCheckout() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const data = await createPaymentSession({ productId: product.id, quantity });
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // ---- Checkout view (session created) ------------------------------------
  if (session) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8 lg:py-12">
        <button
          type="button"
          onClick={() => {
            setSession(null);
            setNotice(null);
          }}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900"
        >
          <span aria-hidden>←</span> Back to product
        </button>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Order summary
              </h2>

              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gray-50">
                  <Image src={product.imageSrc} alt={product.name} width={48} height={48} className="object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-950">{product.name}</p>
                  <p className="text-sm text-gray-500">Qty {quantity}</p>
                </div>
              </div>

              <dl className="mt-6 space-y-3 border-t border-gray-100 pt-5 text-sm">
                <div className="flex justify-between text-gray-500">
                  <dt>Subtotal</dt>
                  <dd className="font-medium text-gray-900">{formatPrice(subtotal, product.currency)}</dd>
                </div>
                <div className="flex justify-between text-gray-500">
                  <dt>Shipping</dt>
                  <dd className="font-medium text-gray-900">Free</dd>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-3 text-base font-semibold text-gray-950">
                  <dt>Total</dt>
                  <dd>{formatPrice(subtotal, product.currency)}</dd>
                </div>
              </dl>

              <div className="mt-5">
                <LockNote />
              </div>
            </div>
          </aside>

          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-950">Checkout</h2>
              {notice && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  {notice}
                </span>
              )}
            </div>
            <div className="p-4 sm:p-5">
              <CheckoutFrame
                key={session.paymentRequestId}
                paymentSessionData={session.paymentSessionData}
                paymentRequestId={session.paymentRequestId}
                prsig={session.prsig}
                normalUrl={session.normalUrl}
                onSuccess={() => setNotice('Payment successful')}
                onFail={(message) => setNotice(message)}
              />
            </div>
          </section>
        </div>
      </main>
    );
  }

  // ---- Product view (default) ---------------------------------------------
  return (
    <main className="mx-auto flex min-h-[78vh] max-w-6xl items-center px-6 py-10">
      <div className="grid w-full grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Product visual */}
        <div className="relative animate-fade-in-up">
          <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-gray-50 to-gray-100 shadow-card-lg">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.9),transparent_60%)]" />
            <Image
              src={product.imageSrc}
              alt={product.name}
              width={420}
              height={420}
              priority
              className="relative z-10 w-3/4 max-w-md object-contain drop-shadow-xl"
            />
            {product.rating != null && (
              <div className="absolute left-5 top-5 z-10 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm backdrop-blur">
                ★ {product.rating.toFixed(1)}
              </div>
            )}
          </div>
        </div>

        {/* Product details */}
        <div className="animate-fade-in-up">
          {product.brand && (
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              {product.brand}
            </p>
          )}
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">
            {product.name}
          </h1>
          {product.tagline && (
            <p className="mt-2 text-lg text-gray-500">{product.tagline}</p>
          )}

          {product.rating != null && (
            <div className="mt-4">
              <StarRating rating={product.rating} reviewCount={product.reviewCount} />
            </div>
          )}

          <div className="mt-6 text-3xl font-semibold text-gray-950">
            {formatPrice(product.price, product.currency)}
          </div>

          <p className="mt-5 text-base leading-7 text-gray-600">
            {product.description}
          </p>

          {product.features && product.features.length > 0 && (
            <ul className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {product.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-gray-950" aria-hidden>
                    <path d="M5 10.5l3.2 3.2L15 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Quantity</span>
              <QuantityStepper value={quantity} onChange={setQuantity} disabled={loading} />
            </div>
          </div>

          <button
            type="button"
            onClick={startCheckout}
            disabled={loading}
            className="mt-5 w-full rounded-full bg-ink px-6 py-4 text-base font-semibold text-white shadow-card transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[240px]"
          >
            {loading ? 'Preparing checkout…' : `Buy now · ${formatPrice(subtotal, product.currency)}`}
          </button>

          {error && (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="mt-6 border-t border-gray-100 pt-6">
            <LockNote />
          </div>
        </div>
      </div>
    </main>
  );
}
