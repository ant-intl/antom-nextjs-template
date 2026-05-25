import { NextRequest, NextResponse } from 'next/server';
import { antomConfig } from '@/lib/antom/config';
import { parseSignatureHeader, verifyWebhook } from '@/lib/antom/sign';
import { orderStore } from '@/lib/orders/memory';
import type { PaymentNotifyPayload } from '@/lib/antom/types';

export const runtime = 'nodejs';

/**
 * Antom expects this EXACT response. Any deviation (HTTP status, body shape,
 * or missing fields) will cause Antom to retry the notification.
 */
const ACK = {
  result: {
    resultCode: 'SUCCESS',
    resultStatus: 'S',
    resultMessage: 'success',
  },
};

// Reject webhooks whose Request-Time is older/newer than this window.
// Protects against replay of previously-captured valid notifications.
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

function isFresh(requestTime: string): boolean {
  const ts = Date.parse(requestTime);
  if (Number.isNaN(ts)) return false;
  return Math.abs(Date.now() - ts) <= REPLAY_WINDOW_MS;
}

export async function POST(req: NextRequest) {
  // 1. Read raw body. NEVER call req.json() before signature verification --
  //    re-stringifying mutates whitespace/key-order and breaks the signature.
  const rawBody = await req.text();

  // 2. Pull required headers.
  const sigHeader = req.headers.get('signature') ?? '';
  const requestTime = req.headers.get('request-time') ?? '';
  const clientId = req.headers.get('client-id') ?? '';

  if (!sigHeader || !requestTime || !clientId) {
    console.warn('[antom-webhook] missing headers', {
      hasSig: !!sigHeader,
      hasTime: !!requestTime,
      hasClientId: !!clientId,
    });
    return new NextResponse('missing headers', { status: 400 });
  }

  // 3. Validate Client-Id matches our merchant. Guards against misrouted
  //    notifications (e.g. sandbox callbacks hitting a prod deployment).
  if (clientId !== antomConfig.clientId) {
    console.warn('[antom-webhook] client-id mismatch', { received: clientId });
    return new NextResponse('client-id mismatch', { status: 401 });
  }

  // 4. Reject stale or future-dated notifications.
  if (!isFresh(requestTime)) {
    console.warn('[antom-webhook] stale request-time', { requestTime });
    return new NextResponse('stale request', { status: 401 });
  }

  const { signature } = parseSignatureHeader(sigHeader);
  if (!signature) {
    console.warn('[antom-webhook] malformed signature header', { sigHeader });
    return new NextResponse('bad signature header', { status: 400 });
  }

  // 5. Verify RSA signature against Antom platform public key.
  //    Use the actual request path so reverse-proxy rewrites / trailing
  //    slashes don't desync from the value Antom signed.
  const valid = verifyWebhook({
    method: 'POST',
    uri: req.nextUrl.pathname,
    body: rawBody,
    clientId,
    requestTime,
    signature,
    antomPublicKey: antomConfig.publicKey,
  });

  if (!valid) {
    console.warn('[antom-webhook] signature verification failed', {
      uri: req.nextUrl.pathname,
      requestTime,
    });
    return new NextResponse('unauthorized', { status: 401 });
  }

  // 6. Parse business payload.
  let payload: PaymentNotifyPayload;
  try {
    payload = JSON.parse(rawBody) as PaymentNotifyPayload;
  } catch {
    console.warn('[antom-webhook] invalid json body');
    return new NextResponse('invalid json', { status: 400 });
  }

  if (!payload.paymentRequestId) {
    console.warn('[antom-webhook] missing paymentRequestId in payload');
    return NextResponse.json(ACK);
  }

  // 7. Idempotency check.
  const existing = await orderStore.get(payload.paymentRequestId);
  if (existing && (existing.status === 'PAID' || existing.status === 'FAILED')) {
    return NextResponse.json(ACK);
  }

  // 8. Update order based on resultStatus (S = success, F = fail, U = unknown).
  try {
    if (payload.result.resultStatus === 'S' && payload.paymentId) {
      await orderStore.markPaid(payload.paymentRequestId, payload.paymentId);
    } else if (payload.result.resultStatus === 'S' && !payload.paymentId) {
      console.warn('[antom-webhook] success status but no paymentId', {
        paymentRequestId: payload.paymentRequestId,
      });
    } else if (payload.result.resultStatus === 'F') {
      await orderStore.markFailed(
        payload.paymentRequestId,
        payload.result.resultMessage,
      );
    }
    // resultStatus === 'U' (unknown): do nothing, await next notification or
    // a manual inquiryPayment call.
  } catch (err) {
    console.error('[antom-webhook] order update failed', {
      paymentRequestId: payload.paymentRequestId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Still ACK to prevent infinite retries on duplicate notifications.
  }

  return NextResponse.json(ACK);
}
