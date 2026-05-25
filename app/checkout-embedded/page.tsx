'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckoutFrame } from '@/components/CheckoutFrame';

function CheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();
  const prid = params.get('prid');

  const [sessionData, setSessionData] = useState<string | null>(null);
  const [normalUrl, setNormalUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!prid) {
      setError('Missing payment request id');
      return;
    }
    const stored = sessionStorage.getItem(`antom-session-${prid}`);
    if (!stored) {
      setError(
        'Payment session not found. Please go back and click "Pay" again.',
      );
      return;
    }
    try {
      const parsed = JSON.parse(stored) as {
        paymentSessionData: string;
        normalUrl?: string;
      };
      if (!parsed.paymentSessionData) {
        setError('Payment session data is missing. Please go back and click "Pay" again.');
        return;
      }
      setSessionData(parsed.paymentSessionData);
      setNormalUrl(parsed.normalUrl);
    } catch {
      setError('Corrupted session data.');
    }
  }, [prid]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="mb-3 text-red-800">{error}</p>
        <Link href="/" className="text-antom-primary hover:underline">
          ← Back to home
        </Link>
      </div>
    );
  }

  if (!sessionData || !prid) {
    return (
      <p className="text-center text-gray-500">Loading payment session...</p>
    );
  }

  return (
    <CheckoutFrame
      paymentSessionData={sessionData}
      paymentRequestId={prid}
      normalUrl={normalUrl}
      onSuccess={() => router.replace(`/result?prid=${prid}`)}
      onFail={() => router.replace(`/result?prid=${prid}`)}
    />
  );
}

export default function CheckoutEmbeddedPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <Link
          href="/"
          className="text-sm text-gray-600 hover:text-antom-primary"
        >
          ← Back
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Checkout</h1>
        <p className="mt-1 text-sm text-gray-600">
          Powered by Antom Checkout Page (Embedded).
        </p>
      </header>
      <Suspense
        fallback={
          <p className="text-center text-gray-500">Loading checkout...</p>
        }
      >
        <CheckoutInner />
      </Suspense>
    </main>
  );
}
