import { NextRequest, NextResponse } from 'next/server';
import { antomPost } from '@/lib/antom/client';
import { orderStore } from '@/lib/orders/memory';
import type { InquiryPaymentResponse } from '@/lib/antom/types';

export const runtime = 'nodejs';

// NOTE: This endpoint is intentionally open in the template. In production,
// verify the caller owns the order (e.g. via session, JWT, or signed cookie)
// before returning payment status — otherwise anyone with a paymentRequestId
// can read order state.

function toPaymentStatus(localStatus?: string) {
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

export async function GET(req: NextRequest) {
  const prid = req.nextUrl.searchParams.get('prid');
  if (!prid) {
    return NextResponse.json({ error: 'Missing prid' }, { status: 400 });
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
        status: toPaymentStatus(local?.status),
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
