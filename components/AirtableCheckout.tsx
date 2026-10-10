'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { PREVIEW_ORDER } from '@/lib/airtable/local-preview';

type Order = {
  recordId: string;
  orderId: string;
  description: string;
  amountMinor: string;
  currency: string;
  fingerprint: string;
};

type Checkout = {
  state: string;
  paymentResult?: 'S' | 'F' | 'U' | null;
  captureResult?: 'S' | 'F' | 'U' | null;
  paymentId?: string | null;
  orderChanged?: boolean;
  checkoutUrl?: string;
  expiresAt?: string;
  writeback?: 'saved' | 'pending';
};

type SessionResponse = {
  enabled: boolean;
  authenticated: boolean;
  csrfToken?: string;
};

type OrderResponse = {
  order: Order;
  checkout?: Checkout;
  csrfToken: string;
};

class RequestError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super('The request could not be completed.');
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = data && typeof data === 'object' && 'code' in data
      && typeof data.code === 'string' ? data.code : '';
    throw new RequestError(response.status, code);
  }
  if (!data || typeof data !== 'object') throw new Error('Invalid response');
  return data as T;
}

function displayAmount(amountMinor: string, currency: string): string {
  if (!/^[0-9]+$/.test(amountMinor) || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Invalid order amount');
  }
  const digits = new Intl.NumberFormat('en', {
    style: 'currency', currency,
  }).resolvedOptions().maximumFractionDigits ?? 2;
  // Keep integer arithmetic so large amounts are never rounded before confirmation.
  const padded = amountMinor.padStart(digits + 1, '0');
  const whole = digits ? padded.slice(0, -digits) : padded;
  const fraction = digits ? `.${padded.slice(-digits)}` : '';
  return `${currency} ${BigInt(whole).toLocaleString('en-US')}${fraction}`;
}

function validCheckout(checkout: Checkout | undefined, now: number): boolean {
  if (checkout?.state !== 'ready' || !checkout.checkoutUrl || !checkout.expiresAt) return false;
  try {
    const url = new URL(checkout.checkoutUrl);
    return url.protocol === 'https:' && !url.username && !url.password
      && Date.parse(checkout.expiresAt) > now;
  } catch {
    return false;
  }
}

const primaryButton = 'rounded-full bg-ui-blue px-6 py-3 text-sm font-medium text-white transition hover:bg-ui-blue-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-blue';
const secondaryButton = 'rounded-full border border-ui-line px-5 py-2.5 text-sm font-medium text-ui-ink transition hover:bg-ui-panel disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-blue';

export function AirtableCheckout({ recordId, preview = false }: { recordId: string | null; preview?: boolean }) {
  const activeRecordId = useRef(recordId);
  activeRecordId.current = recordId;
  const [access, setAccess] = useState<'loading' | 'disabled' | 'login' | 'authenticated'>(preview ? 'authenticated' : 'loading');
  const [csrfToken, setCsrfToken] = useState(preview ? 'local-preview-only' : '');
  const [password, setPassword] = useState('');
  const [order, setOrder] = useState<Order | null>(preview ? { ...PREVIEW_ORDER } : null);
  const [previewPrepared, setPreviewPrepared] = useState(false);
  const [checkout, setCheckout] = useState<Checkout>();
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [blockedAttempt, setBlockedAttempt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const reportError = useCallback((cause: unknown, mutating = false) => {
    if (cause instanceof RequestError) {
      if (cause.status === 401) {
        setAccess('login');
        setOrder(null);
        setCheckout(undefined);
        setCsrfToken('');
        setError('Please sign in to continue.');
        return;
      }
      if (cause.status === 503) {
        setAccess('disabled');
        setOrder(null);
        setCheckout(undefined);
        setError(null);
        return;
      }
      if (cause.status === 409) {
        setBlockedAttempt(true);
        setConfirmed(false);
        setError(/changed|stale/i.test(cause.code)
          ? 'This order has changed. Refresh it and check the updated details before continuing.'
          : 'This checkout needs review. Refresh the order to check its saved state before taking any further action.');
        return;
      }
      if (cause.status === 404) {
        setError('This order could not be found. Open it again from your Airtable Orders table.');
        return;
      }
      if (cause.status === 422) {
        setError('This order needs attention. Check its reference, description, amount, currency and buyer details in Airtable, then refresh it.');
        return;
      }
      if (cause.status === 429) {
        setError('Too many attempts. Please wait before trying again.');
        return;
      }
      if (cause.status === 403) {
        setError('Your session could not authorize this action. Sign out, then sign in again.');
        return;
      }
    }
    if (mutating) {
      setBlockedAttempt(true);
      setError('We could not confirm the checkout result. Refresh the order to check its saved state. Do not create another payment.');
    } else {
      setError('We could not load this information. Please try again.');
    }
  }, []);

  const loadOrder = useCallback(async (signal?: AbortSignal) => {
    if (!recordId) return;
    if (preview) {
      setOrder({ ...PREVIEW_ORDER });
      setCheckout(undefined);
      setConfirmed(false);
      setPreviewPrepared(false);
      setNotice(null);
      setError(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setConfirmed(false);
    // Clear stale confirmation data while the latest order is being loaded.
    setOrder(null);
    setCheckout(undefined);
    try {
      const data = await request<OrderResponse>(`/api/airtable/orders/${encodeURIComponent(recordId)}`, { signal });
      if (signal?.aborted) return;
      displayAmount(data.order.amountMinor, data.order.currency);
      if (data.order.recordId !== recordId || !data.order.fingerprint || !data.csrfToken) throw new Error('Invalid order');
      setOrder(data.order);
      setCheckout(data.checkout);
      setCsrfToken(data.csrfToken);
      setBlockedAttempt(false);
      setNow(Date.now());
    } catch (cause) {
      if (!signal?.aborted) reportError(cause);
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, [recordId, reportError, preview]);

  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    setAccess('loading');
    setError(null);
    request<SessionResponse>('/api/airtable/session', { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setCsrfToken(data.csrfToken || '');
        setAccess(!data.enabled ? 'disabled' : data.authenticated ? 'authenticated' : 'login');
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setAccess('login');
          reportError(cause);
        }
      });
    return () => controller.abort();
  }, [reportError, preview]);

  useEffect(() => {
    if (access !== 'authenticated') return;
    const controller = new AbortController();
    void loadOrder(controller.signal);
    return () => controller.abort();
  }, [access, loadOrder]);

  useEffect(() => {
    if (!checkout?.expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [checkout?.expiresAt]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    if (!password || busy) return;
    const submittedPassword = password;
    setPassword('');
    setBusy(true);
    setError(null);
    try {
      const data = await request<{ csrfToken: string }>('/api/airtable/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: submittedPassword }),
      });
      if (!data.csrfToken) throw new Error('Invalid login response');
      setCsrfToken(data.csrfToken);
      setAccess('authenticated');
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 401) {
        setError('The password was not accepted. Please try again.');
      } else {
        reportError(cause);
      }
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (preview) return;
    setBusy(true);
    setError(null);
    try {
      await request('/api/airtable/logout', {
        method: 'POST', headers: { 'X-CSRF-Token': csrfToken },
      });
      setAccess('login');
      setCsrfToken('');
      setOrder(null);
      setCheckout(undefined);
      setConfirmed(false);
      setNotice(null);
      setPassword('');
    } catch (cause) {
      reportError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function syncPayment() {
    if (!order || busy || !csrfToken || preview) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await request(`/api/airtable/orders/${encodeURIComponent(order.recordId)}/sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: '{}',
      });
      setNotice('Payment results synced to Airtable. No new payment was created.');
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 401) reportError(cause);
      else setError('Payment results remain saved on the server. Check the Airtable payment fields and unchanged order details, then retry syncing.');
    } finally { setBusy(false); }
  }

  async function prepareCheckout(retryWriteback = false) {
    if (!order || busy || !csrfToken || blockedAttempt) return;
    if (retryWriteback ? !validCheckout(checkout, Date.now()) : (!confirmed || !!checkout)) return;
    if (preview) {
      setPreviewPrepared(true);
      setConfirmed(false);
      setNotice('Local preview complete. No Antom payment was created and no Airtable record was changed.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const requestedRecordId = order.recordId;
    try {
      const data = await request<Checkout>(`/api/airtable/orders/${encodeURIComponent(order.recordId)}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ fingerprint: order.fingerprint }),
      });
      if (activeRecordId.current !== requestedRecordId) return;
      if (!validCheckout(data, Date.now()) || !['saved', 'pending'].includes(data.writeback || '')) {
        throw new Error('Invalid checkout response');
      }
      setCheckout(data);
      setConfirmed(false);
      setNow(Date.now());
      setNotice(data.writeback === 'pending'
        ? 'Your checkout is ready, but it has not been saved to Airtable. Retry saving this same checkout below.'
        : 'The checkout link has been saved to your Airtable order.');
    } catch (cause) {
      if (activeRecordId.current === requestedRecordId) reportError(cause, true);
    } finally {
      if (activeRecordId.current === requestedRecordId) setBusy(false);
    }
  }

  const canOpenCheckout = validCheckout(checkout, now) && !blockedAttempt;
  const expired = checkout?.state === 'expired'
    || (checkout?.state === 'ready' && !!checkout.expiresAt && Date.parse(checkout.expiresAt) <= now);
  const canCreate = !!order && !checkout && !blockedAttempt && !previewPrepared;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 sm:py-16">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ui-blue">Airtable · {preview ? 'Local preview' : 'Sandbox'}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ui-ink">Order checkout</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ui-gray">Review the order before preparing its Antom checkout link.</p>
        </div>
        {access === 'authenticated' && !preview && (
          <button type="button" onClick={logout} disabled={busy} className={secondaryButton}>Sign out</button>
        )}
      </header>

      {preview && (
        <aside className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <strong>Local preview — sample data only.</strong> Try the confirmation flow below. This preview does not connect to Airtable or Antom, create a payment, or save changes.
        </aside>
      )}

      {access === 'loading' && <p className="text-ui-gray" role="status">Checking access…</p>}

      {access === 'disabled' && (
        <section className="rounded-3xl bg-ui-panel p-8">
          <h2 className="text-xl font-semibold text-ui-ink">Checkout is not available</h2>
          <p className="mt-3 text-sm leading-6 text-ui-gray">Contact your workspace administrator to finish setting up Airtable checkout on this site.</p>
        </section>
      )}

      {access === 'login' && (
        <section className="rounded-3xl border border-ui-line p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-ui-ink">Merchant sign in</h2>
          <p className="mt-2 text-sm leading-6 text-ui-gray">Use the checkout password supplied by your merchant administrator. This is separate from your Airtable password.</p>
          <form className="mt-6 space-y-4" onSubmit={login}>
            <div>
              <label htmlFor="airtable-password" className="block text-sm font-medium text-ui-ink">Checkout password</label>
              <input id="airtable-password" type="password" autoComplete="current-password" value={password}
                onChange={(event) => setPassword(event.target.value)} required disabled={busy}
                className="mt-2 w-full rounded-xl border border-ui-line bg-white px-4 py-3 text-ui-ink outline-ui-blue" />
            </div>
            <button type="submit" disabled={busy || !password} className={primaryButton}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </section>
      )}

      {access === 'authenticated' && !recordId && (
        <section className="rounded-3xl bg-ui-panel p-8">
          <h2 className="text-xl font-semibold text-ui-ink">Open an order from Airtable</h2>
          <p className="mt-3 text-sm leading-6 text-ui-gray">In your Orders table, select <strong>Start checkout</strong> on the order you want to prepare. Its details will appear here for you to confirm.</p>
          <p className="mt-3 text-sm leading-6 text-ui-gray">If the button is unavailable, ask your workspace administrator to complete the template setup.</p>
        </section>
      )}

      {access === 'authenticated' && recordId && (
        <>
          {busy && !order && <p role="status" className="text-ui-gray">Loading order…</p>}
          {order && (
            <section aria-labelledby="order-summary" className="rounded-3xl border border-ui-line p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-ui-gray">Order</p>
              <h2 id="order-summary" className="mt-2 break-words text-xl font-semibold text-ui-ink">{order.orderId}</h2>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-ui-gray">{order.description}</p>
              <dl className="mt-6 border-t border-ui-line pt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <dt className="text-sm text-ui-gray">Amount to collect</dt>
                  <dd className="text-2xl font-semibold text-ui-ink">{displayAmount(order.amountMinor, order.currency)}</dd>
                </div>
              </dl>

              {canCreate && (
                <div className="mt-8 border-t border-ui-line pt-6">
                  <label className="flex items-start gap-3 text-sm leading-6 text-ui-ink">
                    <input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-ui-blue" />
                    <span>I have checked the order, amount and currency.</span>
                  </label>
                  <button type="button" onClick={() => prepareCheckout()} disabled={busy || !confirmed} className={`${primaryButton} mt-5 w-full sm:w-auto`}>
                    {busy ? 'Preparing checkout…' : preview ? 'Preview checkout' : 'Confirm and create checkout'}
                  </button>
                </div>
              )}

              {preview && previewPrepared && (
                <section className="mt-8 rounded-2xl bg-ui-panel p-5" aria-label="Preview result">
                  <h3 className="font-semibold text-ui-ink">Confirmation preview complete</h3>
                  <p className="mt-2 text-sm leading-6 text-ui-gray">In a connected Sandbox setup, this step creates an Antom checkout and saves its link to Airtable. No checkout link is generated in this local preview.</p>
                  <button type="button" onClick={() => loadOrder()} className={`${secondaryButton} mt-4`}>Reset preview</button>
                </section>
              )}

              {canOpenCheckout && checkout && (
                <div className="mt-8 rounded-2xl bg-ui-panel p-5">
                  <h3 className="font-semibold text-ui-ink">Checkout link ready</h3>
                  <p className="mt-2 text-sm leading-6 text-ui-gray">Expires {new Date(checkout.expiresAt!).toLocaleString()}. Opening this link does not confirm payment.</p>
                  <a href={checkout.checkoutUrl} target="_blank" rel="noopener noreferrer" className={`${primaryButton} mt-4 inline-block`}
                    onClick={(event) => {
                      if (!validCheckout(checkout, Date.now())) {
                        event.preventDefault();
                        setNow(Date.now());
                      }
                    }}>Open checkout <span className="sr-only">in a new tab</span></a>
                  {checkout.writeback === 'pending' && (
                    <div className="mt-4">
                      <p className="text-sm leading-6 text-ui-gray">If the checkout link is missing from Airtable, save this same checkout again.</p>
                      <button type="button" disabled={busy} onClick={() => prepareCheckout(true)} className={`${secondaryButton} mt-3`}>
                        {busy ? 'Saving…' : 'Retry saving to Airtable'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {checkout?.paymentId && (
                <section className="mt-8 rounded-2xl bg-ui-panel p-5" aria-label="Payment result">
                  <h3 className="font-semibold text-ui-ink">{checkout.orderChanged ? 'Order changed — review payment' : checkout.paymentResult === 'S' ? 'Payment notification confirmed' : checkout.paymentResult === 'F' ? 'Payment failed' : 'Payment result pending'}</h3>
                  <dl className="mt-3 space-y-2 break-all text-sm text-ui-ink">
                    <div><dt className="text-ui-gray">Antom payment ID</dt><dd>{checkout.paymentId}</dd></div>
                    {checkout.captureResult && <div><dt className="text-ui-gray">Capture result</dt><dd>{checkout.captureResult === 'S' ? 'Success' : checkout.captureResult === 'F' ? 'Failed' : 'Processing'}</dd></div>}
                  </dl>
                  <p className="mt-3 text-sm leading-6 text-ui-gray">{checkout.orderChanged
                    ? 'These results belong to the original payment attempt. The current order details differ; automatic sync is blocked.'
                    : 'This result comes from a verified Antom notification. Card payments also require successful capture; non-card methods such as Alipay do not require a separate capture notification. Payment review remains manual.'}</p>
                  <button type="button" disabled={busy || checkout.orderChanged} onClick={() => syncPayment()} className={`${secondaryButton} mt-4`}>{busy ? 'Syncing…' : 'Sync payment result to Airtable'}</button>
                </section>
              )}

              {checkout && !canOpenCheckout && !checkout.paymentId && (
                <div className="mt-8 rounded-2xl bg-amber-50 p-5">
                  <h3 className="font-semibold text-amber-950">{expired ? 'Checkout expired' : 'Review this checkout'}</h3>
                  <p className="mt-2 text-sm leading-6 text-amber-900">
                    {checkout.state === 'creating'
                      ? 'A checkout is being prepared. Refresh the order to check its saved result.'
                      : 'Check the existing payment attempt in Antom before taking any further action. An unavailable or expired link does not prove that the order is unpaid.'}
                  </p>
                </div>
              )}
            </section>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => loadOrder()} disabled={busy} className={secondaryButton}>Refresh order</button>
            <p className="text-xs text-ui-gray">Refreshing only checks the order; it does not create a payment.</p>
          </div>
        </>
      )}

      <div aria-live="polite" aria-atomic="true">
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">{error}</p>}
        {notice && <p role="status" className="mt-5 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">{notice}</p>}
      </div>

      {access === 'authenticated' && order && (
        <aside className="mt-8 border-t border-ui-line pt-6">
          <h2 className="text-sm font-semibold text-ui-ink">Payment review stays manual</h2>
          <p className="mt-2 text-sm leading-6 text-ui-gray">Check the matching transaction in Antom before updating Payment review in Airtable. For payment methods that require capture, confirm that capture succeeded. A checkout link or a return to this page does not mean the order has been paid.</p>
        </aside>
      )}
    </main>
  );
}
