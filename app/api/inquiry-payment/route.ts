import { NextRequest, NextResponse } from 'next/server';
import { antomPost } from '@/lib/antom/client';
import { verifyPrid } from '@/lib/antom/prid-token';
import { orderStore } from '@/lib/orders/memory';
import type { InquiryPaymentResponse } from '@/lib/antom/types';
import type {
  ApiError,
  InquiryPaymentSuccess,
  ResponsePaymentStatus,
} from '@/lib/api-contracts';

export const runtime = 'nodejs';

// The `prid` query parameter is an HMAC-signed token produced by
// /api/create-payment-session. Verifying it ensures the caller actually
// initiated the order — without it, anyone who guessed/leaked a UUID
// could read order state. For production use with real user accounts,
// replace this with a session-bound check.

function toResponseStatus(localStatus?: string): ResponsePaymentStatus {
  switch (localStatus) {
    case 'PAID':
      return 'SUCCESS';
    case 'FAILED':
      return 'FAIL';
    case 'PENDING':
      return 'PROCESSING';
    default:
      return 'UNKNOWN';
  }
}

export async function GET(
  req: NextRequest,
): Promise<NextResponse<InquiryPaymentSuccess | ApiError>> {
  const tokenParam = req.nextUrl.searchParams.get('prid');
  if (!tokenParam) {
    return NextResponse.json({ error: 'Missing prid' }, { status: 400 });
  }

  const prid = verifyPrid(tokenParam);
  if (!prid) {
    return NextResponse.json({ error: 'Invalid prid token' }, { status: 403 });
  }

  const local = await orderStore.get(prid);

  let resp: InquiryPaymentResponse;
  try {
    resp = await antomPost<InquiryPaymentResponse>(
      '/ams/api/v1/payments/inquiryPayment',
      { paymentRequestId: prid },
    );
  } catch (err) {
    console.error('[antom] inquiryPayment failed', {
      paymentRequestId: prid,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        paymentRequestId: prid,
        status: toResponseStatus(local?.status),
        source: 'local-fallback',
      },
      { status: 200 },
    );
  }

  if (
    resp.paymentStatus === 'SUCCESS' &&
    local &&
    local.status === 'PENDING' &&
    resp.paymentId
  ) {
    await orderStore.markPaid(prid, resp.paymentId);
  } else if (resp.paymentStatus === 'FAIL' && local && local.status === 'PENDING') {
    await orderStore.markFailed(prid, resp.result.resultMessage);
  }

  return NextResponse.json({
    paymentRequestId: prid,
    status: resp.paymentStatus ?? 'PROCESSING',
    paymentId: resp.paymentId,
    amount: resp.paymentAmount,
    paymentTime: resp.paymentTime,
    resultCode: resp.result.resultCode,
    resultMessage: resp.result.resultMessage,
  });
}
