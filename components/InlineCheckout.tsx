'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

// --- icons ------------------------------------------------------------------

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
      <path d="M3 6h11v9H3zM14 9h4l3 3v3h-7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="7" cy="17" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="17.5" cy="17" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
      <path d="M4 9l1-4h14l1 4M5 9v10h14V9M5 9h14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ui-blue" aria-hidden>
      <path d="M5 10.5l3.2 3.2L15 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockNote() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-ui-gray">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
        <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      Secure checkout · Antom
    </div>
  );
}

export function InlineCheckout({ product }: InlineCheckoutProps) {
  const router = useRouter();
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
      <main className="mx-auto max-w-6xl px-6 py-10 lg:py-14">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-12">
          {/* LEFT: bag summary */}
          <aside className="self-start lg:sticky lg:top-24">
            <div className="rounded-2xl bg-ui-panel p-6">
              {/* Line item */}
              <div className="flex gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white">
                  <Image src={product.imageSrc} alt={product.name} width={72} height={72} className="w-[78%] object-contain" />
                </div>
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-ui-ink">{product.name}</h2>
                    <p className="mt-0.5 text-sm text-ui-gray">Qty {quantity}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSession(null);
                        setNotice(null);
                      }}
                      className="mt-2 text-sm text-ui-blue transition hover:underline"
                    >
                      Back to product
                    </button>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-ui-ink">
                    {formatPrice(subtotal, product.currency)}
                  </p>
                </div>
              </div>

              {/* Fulfillment */}
              <div className="mt-5 space-y-2 border-t border-ui-line/60 pt-5 text-sm text-ui-gray">
                <p className="flex items-center gap-2">
                  <StoreIcon /> Pick up:{' '}
                  <span className="font-medium text-ui-ink">Today</span>
                </p>
                <p className="flex items-center gap-2">
                  <TruckIcon /> Free delivery:{' '}
                  <span className="font-medium text-ui-ink">Tomorrow</span>
                </p>
              </div>

              {/* Totals */}
              <dl className="mt-5 space-y-2.5 border-t border-ui-line/60 pt-5 text-sm">
                <div className="flex justify-between text-ui-gray">
                  <dt>Subtotal</dt>
                  <dd className="text-ui-ink">{formatPrice(subtotal, product.currency)}</dd>
                </div>
                <div className="flex justify-between text-ui-gray">
                  <dt>Shipping</dt>
                  <dd className="text-ui-ink">FREE</dd>
                </div>
                <div className="flex justify-between border-t border-ui-line/60 pt-2.5 text-base font-semibold text-ui-ink">
                  <dt>Total</dt>
                  <dd>{formatPrice(subtotal, product.currency)}</dd>
                </div>
              </dl>

              <div className="mt-5">
                <LockNote />
              </div>
            </div>
          </aside>

          {/* RIGHT: cashier (renders its own card, no extra frame) */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight text-ui-ink sm:text-[28px]">
              Checkout
            </h2>
            {notice && (
              <div className="mt-4">
                <span className="inline-block rounded-full bg-ui-panel px-3 py-1 text-xs font-medium text-ui-gray">
                  {notice}
                </span>
              </div>
            )}
            <div className="mt-6">
              <CheckoutFrame
                key={session.paymentRequestId}
                paymentSessionData={session.paymentSessionData}
                paymentRequestId={session.paymentRequestId}
                prsig={session.prsig}
                normalUrl={session.normalUrl}
                onSuccess={() =>
                  router.push(`/result?prid=${encodeURIComponent(session.prsig)}`)
                }
                onFail={(message) => setNotice(message)}
              />
            </div>
          </section>
        </div>
      </main>
    );
  }

  // ---- Product view (PDP) -------------------------------------------------
  return (
    <>
      {/* Product sub-nav */}
      <div className="sticky top-14 z-10 border-b border-ui-line/50 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-center justify-between py-3">
            <span className="text-lg font-semibold tracking-tight text-ui-ink">
              {product.name}
            </span>
            <div className="flex items-center gap-4">
              <span className="hidden text-sm text-ui-gray sm:inline">
                From {formatPrice(product.price, product.currency)}
              </span>
              <button
                type="button"
                onClick={startCheckout}
                disabled={loading}
                className="rounded-full bg-ui-blue px-4 py-1.5 text-sm font-medium text-white transition hover:bg-ui-blue-hover disabled:opacity-60"
              >
                Buy
              </button>
            </div>
          </div>
          <div className="flex items-center justify-end gap-6 border-t border-ui-line/40 py-2 text-xs text-ui-gray">
            <span className="inline-flex items-center gap-1.5">
              <TruckIcon /> Free shipping
            </span>
            <span className="inline-flex items-center gap-1.5">
              <StoreIcon /> Pick up from Store
            </span>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-10 lg:py-14">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.55fr_1fr] lg:gap-12">
          {/* Image panel */}
          <div className="animate-fade-in-up">
            <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl bg-ui-panel sm:aspect-[5/4]">
              <Image
                src={product.imageSrc}
                alt={product.name}
                width={620}
                height={620}
                priority
                className="w-[86%] max-w-xl object-contain drop-shadow-xl"
              />
              <button
                type="button"
                aria-label="Next image"
                className="absolute right-4 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ui-gray shadow-sm backdrop-blur transition hover:bg-white lg:flex"
              >
                <ChevronRight />
              </button>
              <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-ui-ink/70" />
                <span className="h-2 w-2 rounded-full bg-ui-ink/20" />
              </div>
            </div>
          </div>

          {/* Config rail */}
          <div className="animate-fade-in-up lg:pt-1">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ui-ink sm:text-[30px]">
              {product.name}.{' '}
              {product.tagline && <span className="text-ui-gray">{product.tagline}</span>}
            </h1>

            {product.rating != null && (
              <div className="mt-4">
                <StarRating rating={product.rating} reviewCount={product.reviewCount} />
              </div>
            )}

            {/* Selected "model" card */}
            <div className="mt-6 rounded-2xl border-2 border-ui-blue bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-ui-ink">{product.brand ?? product.name}</p>
                  <p className="mt-0.5 text-sm text-ui-gray">
                    {product.features?.[0] ?? 'Wireless · Over-ear'}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium text-ui-ink">
                  {formatPrice(product.price, product.currency)}
                </p>
              </div>
            </div>

            {/* Specs helper card */}
            {product.features && product.features.length > 0 && (
              <div className="mt-3 rounded-2xl bg-ui-panel p-5">
                <p className="text-sm font-semibold text-ui-ink">Highlights</p>
                <ul className="mt-3 grid grid-cols-1 gap-2.5 text-sm text-ui-gray">
                  {product.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quantity */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold tracking-tight text-ui-ink">
                Quantity
              </h2>
              <div className="mt-3">
                <QuantityStepper value={quantity} onChange={setQuantity} disabled={loading} />
              </div>
            </div>

            {/* Price + CTA */}
            <div className="mt-8 border-t border-ui-line/60 pt-6">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ui-gray">Total</span>
                <span className="text-2xl font-semibold text-ui-ink">
                  {formatPrice(subtotal, product.currency)}
                </span>
              </div>
              <button
                type="button"
                onClick={startCheckout}
                disabled={loading}
                className="mt-4 w-full rounded-full bg-ui-blue px-6 py-3.5 text-base font-medium text-white transition hover:bg-ui-blue-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Preparing checkout…' : 'Add to Bag'}
              </button>
              {error && (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
              <div className="mt-4 flex items-center justify-center">
                <LockNote />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
