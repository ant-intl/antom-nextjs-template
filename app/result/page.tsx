'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge';
import { describeAntomResult } from '@/lib/antom/errors';
import { formatPrice } from '@/config/products';
import type {
  ApiError,
  InquiryPaymentSuccess,
  ResponsePaymentStatus,
} from '@/lib/api-contracts';

const TERMINAL: ReadonlySet<ResponsePaymentStatus> = new Set([
  'SUCCESS',
  'FAIL',
  'CANCELLED',
]);

// Exponential-ish backoff: ~110s total. Long enough for slow methods
// (3DS, redirect-to-bank) without hammering the API for fast ones.
const POLL_DELAYS_MS = [2000, 3000, 5000, 8000, 13000, 21000, 30000, 30000];

// --- Presentational helpers -------------------------------------------------

function SuccessIcon() {
  return (
    <div className="mx-auto flex h-16 w-16 animate-check-pop items-center justify-center rounded-full bg-green-50">
      <svg viewBox="0 0 24 24" className="h-8 w-8 text-green-600" aria-hidden>
        <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function FailIcon() {
  return (
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
      <svg viewBox="0 0 24 24" className="h-8 w-8 text-red-600" aria-hidden>
        <path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function PendingIcon() {
  return (
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-200 border-t-amber-500" />
    </div>
  );
}

function hero(status: ResponsePaymentStatus): {
  icon: JSX.Element;
  title: string;
  subtitle: string;
} {
  switch (status) {
    case 'SUCCESS':
      return {
        icon: <SuccessIcon />,
        title: 'Thank you for your order',
        subtitle: 'Your payment was successful. A confirmation is on its way.',
      };
    case 'FAIL':
      return {
        icon: <FailIcon />,
        title: 'Payment failed',
        subtitle: 'We couldn’t complete your payment. No charge was made.',
      };
    case 'CANCELLED':
      return {
        icon: <FailIcon />,
        title: 'Payment cancelled',
        subtitle: 'You cancelled the checkout. You can try again anytime.',
      };
    default:
      return {
        icon: <PendingIcon />,
        title: 'Confirming your payment',
        subtitle: 'This usually takes a few seconds. Hang tight…',
      };
  }
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`text-right text-gray-900 ${mono ? 'break-all font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function ResultInner() {
  const params = useSearchParams();
  const prid = params.get('prid');

  const [data, setData] = useState<InquiryPaymentSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!prid) {
      setError('Missing payment request id');
      setPolling(false);
      return;
    }
    const token = prid;

    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchOnce() {
      try {
        const res = await fetch(`/api/inquiry-payment?prid=${encodeURIComponent(token)}`);
        const json = (await res.json()) as InquiryPaymentSuccess | ApiError;
        if (cancelled) return;

        if ('error' in json) {
          setError(json.error);
          setPolling(false);
          return;
        }

        setData(json);

        if (TERMINAL.has(json.status) || attempt >= POLL_DELAYS_MS.length) {
          setPolling(false);
          return;
        }

        const delay = POLL_DELAYS_MS[attempt];
        attempt += 1;
        timer = setTimeout(fetchOnce, delay);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Inquiry failed');
        setPolling(false);
      }
    }

    fetchOnce();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [prid]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50/60 p-8 text-center">
        <FailIcon />
        <p className="mt-4 text-sm font-medium text-red-800">{error}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-ui-blue px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ui-blue-hover"
        >
          Back to store
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-card">
        <PendingIcon />
        <p className="mt-4 text-sm text-gray-500">Confirming your payment…</p>
      </div>
    );
  }

  const friendlyMessage = data.resultCode
    ? describeAntomResult(data.resultCode, data.resultMessage)
    : data.resultMessage;

  const view = hero(data.status);
  // amount.value is an integer string in the smallest currency unit (cents).
  // Format it the same way the storefront formats prices; fall back to the
  // raw value only if it is somehow non-numeric.
  const amountMinor = data.amount ? Number(data.amount.value) : NaN;
  const amount = data.amount
    ? Number.isFinite(amountMinor)
      ? formatPrice(amountMinor, data.amount.currency)
      : `${data.amount.value} ${data.amount.currency}`
    : null;

  return (
    <div className="animate-fade-in-up rounded-2xl border border-gray-100 bg-white p-8 shadow-card sm:p-10">
      <div className="text-center">
        {view.icon}
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-gray-950">
          {view.title}
        </h1>
        <p className="mt-2 text-sm text-gray-500">{view.subtitle}</p>
        <div className="mt-4 flex justify-center">
          <PaymentStatusBadge status={data.status} />
        </div>
      </div>

      {amount && (
        <div className="mt-8 rounded-xl bg-gray-50 px-6 py-5 text-center">
          <p className="text-xs uppercase tracking-wide text-gray-400">Amount</p>
          <p className="mt-1 text-2xl font-semibold text-gray-950">{amount}</p>
        </div>
      )}

      <div className="mt-6 border-t border-gray-100 pt-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Payment details
        </p>
        <dl className="divide-y divide-gray-50 text-sm">
          <DetailRow label="Request ID" value={data.paymentRequestId} mono />
          {data.paymentId && <DetailRow label="Antom Payment ID" value={data.paymentId} mono />}
          {data.paymentTime && <DetailRow label="Paid at" value={data.paymentTime} />}
          {data.resultCode && <DetailRow label="Result code" value={data.resultCode} mono />}
          {friendlyMessage && <DetailRow label="Message" value={friendlyMessage} />}
        </dl>
      </div>

      {polling && (
        <p className="mt-4 text-center text-xs text-gray-400">
          Re-checking status…
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="flex-1 rounded-full bg-ui-blue px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-ui-blue-hover"
        >
          Continue shopping
        </Link>
        {(data.status === 'FAIL' || data.status === 'CANCELLED') && (
          <Link
            href="/"
            className="flex-1 rounded-full border border-gray-200 px-5 py-3 text-center text-sm font-semibold text-gray-900 transition hover:bg-gray-50"
          >
            Try again
          </Link>
        )}
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12 sm:py-16">
      <Suspense
        fallback={
          <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-card">
            <p className="text-sm text-gray-500">Loading result…</p>
          </div>
        }
      >
        <ResultInner />
      </Suspense>
    </main>
  );
}
