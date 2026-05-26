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

function isFresh(requestTime: string): boolean {
  const ts = Date.parse(requestTime);
  if (Number.isNaN(ts)) return false;
  return Math.abs(Date.now() - ts) <= antomConfig.replayWindowMs;
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

  // 5. Parse Signature header and assert the algorithm name we expect.
  //    crypto.verify() below is hard-coded to RSA-SHA256, so a future
  //    algorithm switch (e.g. SM2) must be an explicit code change rather
  //    than silently "verify" against the wrong primitive.
  const { signature, algorithm } = parseSignatureHeader(sigHeader);
  if (!signature) {
    console.warn('[antom-webhook] malformed signature header', { sigHeader });
    return new NextResponse('bad signature header', { status: 400 });
  }
  if (algorithm && algorithm !== antomConfig.signatureAlgorithm) {
    console.warn('[antom-webhook] unexpected signature algorithm', {
      received: algorithm,
      expected: antomConfig.signatureAlgorithm,
    });
    return new NextResponse('unsupported algorithm', { status: 401 });
  }

  // 6. Verify RSA signature against Antom platform public key.
  //    Use the configured notify path (what Antom signed) rather than the
  //    proxied request path, which can differ on Vercel rewrites / basePath.
  const valid = verifyWebhook({
    method: 'POST',
    uri: antomConfig.notifyPath,
    body: rawBody,
    clientId,
    requestTime,
    signature,
    antomPublicKey: antomConfig.publicKey,
  });

  if (!valid) {
    console.warn('[antom-webhook] signature verification failed', {
      uri: antomConfig.notifyPath,
      requestTime,
    });
    return new NextResponse('unauthorized', { status: 401 });
  }

  // 7. Parse business payload.
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

  // 8. Idempotency check.
  const existing = await orderStore.get(payload.paymentRequestId);
  if (existing && (existing.status === 'PAID' || existing.status === 'FAILED')) {
    return NextResponse.json(ACK);
  }

  // 9. Update order based on resultStatus (S = success, F = fail, U = unknown).
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
