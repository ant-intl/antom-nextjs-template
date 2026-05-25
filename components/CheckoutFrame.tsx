'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { clientEnv } from '@/config/env';

declare global {
  interface Window {
    AMSCheckoutPage?: new (options: AmsCheckoutOptions) => AmsCheckoutInstance;
  }
}

interface AmsEvent {
  code: string;
  message?: string;
  result?: { resultCode?: string; resultStatus?: string };
}

interface AmsCheckoutOptions {
  environment: 'sandbox' | 'prod';
  onEventCallback?: (event: AmsEvent) => void;
  onLog?: (log: unknown) => void;
}

interface AmsCheckoutInstance {
  mountComponent: (
    params: { sessionData: string },
    selector: string | HTMLElement,
  ) => Promise<void> | void;
  unmount?: () => void;
}

interface CheckoutFrameProps {
  paymentSessionData: string;
  paymentRequestId: string;
  normalUrl?: string;
  onSuccess?: () => void;
  onFail?: (message: string) => void;
}

const SDK_URL = 'https://js.antom.com/v2/ams-checkout.js';

export function CheckoutFrame({
  paymentSessionData,
  paymentRequestId,
  normalUrl,
  onSuccess,
  onFail,
}: CheckoutFrameProps) {
  const checkoutRef = useRef<AmsCheckoutInstance | null>(null);
  const mountedRef = useRef(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep latest callbacks in refs so they don't trigger SDK re-mount on every parent re-render.
  const onSuccessRef = useRef(onSuccess);
  const onFailRef = useRef(onFail);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onFailRef.current = onFail;
  }, [onSuccess, onFail]);

  useEffect(() => {
    if (sdkReady || error) return;

    const timer = window.setTimeout(() => {
      setError(
        'Antom Checkout SDK did not load. Check your network connection or continue with hosted checkout.',
      );
    }, 10000);

    return () => window.clearTimeout(timer);
  }, [sdkReady, error]);

  useEffect(() => {
    if (!sdkReady || error || !paymentSessionData || mountedRef.current) return;
    if (typeof window === 'undefined') return;
    if (!window.AMSCheckoutPage) {
      setError(
        'Antom Checkout SDK loaded but did not initialize. Check whether js.antom.com is reachable, or continue with hosted checkout.',
      );
      return;
    }

    let checkout: AmsCheckoutInstance;
    try {
      checkout = new window.AMSCheckoutPage({
        environment: clientEnv.antomEnv,
        onEventCallback: (event) => {
          // SDK events drive UI transitions only. Authoritative payment state
          // must come from the server-side inquiryPayment call or the webhook.
          switch (event.code) {
            case 'SDK_PAYMENT_SUCCESSFUL':
              onSuccessRef.current?.();
              break;
            case 'SDK_PAYMENT_FAIL':
              onFailRef.current?.(event.message ?? 'Payment failed');
              break;
            case 'SDK_PAYMENT_CANCEL':
              onFailRef.current?.('Payment cancelled');
              break;
            case 'SDK_PAYMENT_CLICK_BACK_TO_MERCHANT':
              window.history.back();
              break;
            default:
              break;
          }
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize Antom Checkout.');
      return;
    }

    checkoutRef.current = checkout;
    mountedRef.current = true;

    void Promise.resolve(
      checkout.mountComponent(
        { sessionData: paymentSessionData },
        '#ckp-container',
      ),
    ).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to mount Antom Checkout.');
      mountedRef.current = false;
    });

    return () => {
      try {
        checkoutRef.current?.unmount?.();
      } catch {
        // ignore
      }
      checkoutRef.current = null;
      mountedRef.current = false;
    };
  }, [sdkReady, error, paymentSessionData]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-800">{error}</p>
        {normalUrl && (
          <a
            href={normalUrl}
            className="mt-4 inline-block rounded-lg bg-antom-primary px-4 py-2 text-sm font-medium text-white hover:bg-antom-dark"
          >
            Continue with hosted checkout
          </a>
        )}
      </div>
    );
  }

  return (
    <>
      <Script
        src={SDK_URL}
        strategy="afterInteractive"
        onLoad={() => {
          if (window.AMSCheckoutPage) {
            setSdkReady(true);
            return;
          }

          setError(
            'Antom Checkout SDK loaded but did not initialize. Check whether js.antom.com is reachable, or continue with hosted checkout.',
          );
        }}
        onError={() =>
          setError(
            'Failed to load Antom Checkout SDK. Check your network connection or continue with hosted checkout.',
          )
        }
      />
      <div className="relative min-h-[748px]">
        <div
          id="ckp-container"
          data-payment-request-id={paymentRequestId}
          className="bg-white"
        />
        {!sdkReady && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white">
            <div className="w-full max-w-md px-8 text-center">
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-gray-200 border-t-antom-primary" />
              <p className="mt-5 text-sm font-medium text-gray-900">
                Loading secure checkout
              </p>
              <div className="mt-8 space-y-3">
                <div className="h-12 rounded-md bg-gray-100" />
                <div className="h-12 rounded-md bg-gray-100" />
                <div className="h-12 rounded-md bg-gray-100" />
                <div className="mt-5 h-11 rounded-md bg-gray-200" />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
