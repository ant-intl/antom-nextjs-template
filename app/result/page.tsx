'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge';
import { describeAntomResult } from '@/lib/antom/errors';

interface InquiryResult {
  paymentRequestId: string;
  status: 'SUCCESS' | 'FAIL' | 'PROCESSING' | 'CANCELLED' | string;
  paymentId?: string;
  amount?: { currency: string; value: string };
  paymentTime?: string;
  resultCode?: string;
  resultMessage?: string;
}

// Exponential-ish backoff: 2, 3, 5, 8, 13, 21, 30, 30s (~110s total).
// Long enough for slow methods (3DS, redirect-to-bank) without
// hammering the API for fast ones.
const POLL_DELAYS_MS = [2000, 3000, 5000, 8000, 13000, 21000, 30000, 30000];

function ResultInner() {
  const params = useSearchParams();
  const prid = params.get('prid');

  const [data, setData] = useState<InquiryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!prid) {
      setError('Missing payment request id');
      setPolling(false);
      return;
    }

    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchOnce() {
      try {
        const res = await fetch(`/api/inquiry-payment?prid=${prid}`);
        const json = (await res.json()) as InquiryResult;
        if (cancelled) return;
        setData(json);

        const terminal =
          json.status === 'SUCCESS' ||
          json.status === 'FAIL' ||
          json.status === 'CANCELLED';

        if (terminal || attempt >= POLL_DELAYS_MS.length) {
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
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
        {error}
      </div>
    );
  }

  if (!data) {
    return <p className="text-center text-gray-500">Confirming payment...</p>;
  }

  const friendlyMessage = data.resultCode
    ? describeAntomResult(data.resultCode, data.resultMessage)
    : data.resultMessage;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Payment Result</h2>
        <PaymentStatusBadge status={data.status} />
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex justify-between border-b border-gray-100 pb-2">
          <dt className="text-gray-500">Request ID</dt>
          <dd className="font-mono text-gray-900">{data.paymentRequestId}</dd>
        </div>
        {data.paymentId && (
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="text-gray-500">Antom Payment ID</dt>
            <dd className="font-mono text-gray-900">{data.paymentId}</dd>
          </div>
        )}
        {data.amount && (
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="text-gray-500">Amount</dt>
            <dd className="text-gray-900">
              {data.amount.value} {data.amount.currency}
            </dd>
          </div>
        )}
        {data.paymentTime && (
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="text-gray-500">Paid At</dt>
            <dd className="text-gray-900">{data.paymentTime}</dd>
          </div>
        )}
        {data.resultCode && (
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="text-gray-500">Result Code</dt>
            <dd className="font-mono text-gray-900">{data.resultCode}</dd>
          </div>
        )}
        {friendlyMessage && (
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="text-gray-500">Message</dt>
            <dd className="text-gray-900">{friendlyMessage}</dd>
          </div>
        )}
      </dl>

      {polling && (
        <p className="mt-4 text-xs text-gray-500">
          Re-checking status with backoff...
        </p>
      )}

      <div className="mt-6">
        <Link
          href="/"
          className="inline-block rounded-lg bg-antom-primary px-4 py-2 text-sm font-medium text-white hover:bg-antom-dark"
        >
          ← Back to store
        </Link>
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        Payment Confirmation
      </h1>
      <Suspense
        fallback={
          <p className="text-center text-gray-500">Loading result...</p>
        }
      >
        <ResultInner />
      </Suspense>
    </main>
  );
}
