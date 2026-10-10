'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { clientEnv } from '@/config/env';

/** CKP SDK event codes we react to. See Antom docs for the full list. */
export const SDK_EVENT = {
  PaymentSuccessful: 'SDK_PAYMENT_SUCCESSFUL',
  PaymentFail: 'SDK_PAYMENT_FAIL',
  PaymentCancel: 'SDK_PAYMENT_CANCEL',
  ClickBackToMerchant: 'SDK_PAYMENT_CLICK_BACK_TO_MERCHANT',
} as const;

export type AmsEventCode = (typeof SDK_EVENT)[keyof typeof SDK_EVENT];

const KNOWN_SDK_EVENTS: ReadonlySet<string> = new Set(Object.values(SDK_EVENT));

function isKnownEvent(code: string): code is AmsEventCode {
  return KNOWN_SDK_EVENTS.has(code);
}

declare global {
  interface Window {
    AMSCheckoutPage?: new (options: AmsCheckoutOptions) => AmsCheckoutInstance;
  }
}

interface AmsEvent {
  /** SDK may emit codes we don't recognise; filter via isKnownEvent before switching. */
  code: string;
  message?: string;
  result?: { resultCode?: string; resultStatus?: string };
}

interface AmsCheckoutOptions {
  environment: 'sandbox' | 'prod';
  /** BCP-style locale the embedded cashier renders in, e.g. 'en_US', 'zh_CN'. */
  locale?: string;
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
  /** HMAC-signed prid token (returned by /api/create-payment-session). */
  prsig?: string;
  normalUrl?: string;
  onSuccess?: () => void;
  onFail?: (message: string) => void;
}

const SDK_URL = 'https://js.antom.com/v2/ams-checkout.js';

export function CheckoutFrame({
  paymentSessionData,
  paymentRequestId,
  prsig,
  normalUrl,
  onSuccess,
  onFail,
}: CheckoutFrameProps) {
  const checkoutRef = useRef<AmsCheckoutInstance | null>(null);
  const mountedRef = useRef(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep latest callbacks/props in refs so they don't trigger SDK re-mount on every parent re-render.
  const onSuccessRef = useRef(onSuccess);
  const onFailRef = useRef(onFail);
  const prsigRef = useRef(prsig);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onFailRef.current = onFail;
    prsigRef.current = prsig;
  }, [onSuccess, onFail, prsig]);

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
        // Match the storefront language so the embedded cashier isn't a
        // different locale than the rest of the page.
        locale: 'en_US',
        onEventCallback: (event) => {
          // SDK events drive UI transitions only. Authoritative payment state
          // must come from the server-side inquiryPayment call or the webhook.
          if (!isKnownEvent(event.code)) return;
          switch (event.code) {
            case SDK_EVENT.PaymentSuccessful:
              onSuccessRef.current?.();
              break;
            case SDK_EVENT.PaymentFail:
              onFailRef.current?.(event.message ?? 'Payment failed');
              break;
            case SDK_EVENT.PaymentCancel:
              onFailRef.current?.('Payment cancelled');
              break;
            case SDK_EVENT.ClickBackToMerchant: {
              // "Continue shopping" on the SDK success page. The whole flow is
              // same-page React state, so history.back() has nowhere to go —
              // send the buyer to the authoritative result page instead.
              const token = prsigRef.current;
              if (token) {
                window.location.assign(`/result?prid=${encodeURIComponent(token)}`);
              } else {
                window.location.assign('/');
              }
              break;
            }
            default:
              // Exhaustive guard: adding a new SDK_EVENT entry without
              // handling it here becomes a compile error.
              ((_: never) => {})(event.code);
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
      <div className="rounded-2xl border border-red-100 bg-red-50/60 p-8 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path d="M12 8v5M12 16.5h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </div>
        <p className="mt-4 text-sm font-medium text-red-800">{error}</p>
        {normalUrl && (
          <a
            href={normalUrl}
            className="mt-5 inline-block rounded-full bg-ui-blue px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ui-blue-hover"
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
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white">
            <div className="w-full max-w-md px-8 text-center">
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-gray-200 border-t-ui-blue" />
              <p className="mt-5 text-sm font-medium text-gray-900">
                Loading secure checkout
              </p>
              <div className="mt-8 space-y-3">
                <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
                <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
                <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
                <div className="mt-5 h-11 animate-pulse rounded-xl bg-gray-200" />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
