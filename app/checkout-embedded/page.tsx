'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckoutFrame } from '@/components/CheckoutFrame';
import {
  isStoredCheckoutSession,
  type StoredCheckoutSession,
} from '@/lib/api-contracts';

function CheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();
  const prid = params.get('prid');

  const [session, setSession] = useState<StoredCheckoutSession | null>(null);
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      setError('Corrupted session data.');
      return;
    }
    if (!isStoredCheckoutSession(parsed)) {
      setError('Payment session data is missing. Please go back and click "Pay" again.');
      return;
    }
    setSession(parsed);
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

  if (!session || !prid) {
    return (
      <p className="text-center text-gray-500">Loading payment session...</p>
    );
  }

  return (
    <CheckoutFrame
      paymentSessionData={session.paymentSessionData}
      paymentRequestId={prid}
      prsig={session.prsig}
      normalUrl={session.normalUrl}
      onSuccess={() => router.replace(`/result?prid=${encodeURIComponent(session.prsig)}`)}
      onFail={() => router.replace(`/result?prid=${encodeURIComponent(session.prsig)}`)}
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
