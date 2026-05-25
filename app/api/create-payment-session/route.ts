import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { antomPost } from '@/lib/antom/client';
import { antomConfig } from '@/lib/antom/config';
import { orderStore } from '@/lib/orders/memory';
import { getProduct } from '@/config/products';
import type {
  CreatePaymentSessionRequest,
  CreatePaymentSessionResponse,
} from '@/lib/antom/types';

export const runtime = 'nodejs';

interface RequestBody {
  productId?: unknown;
  quantity?: unknown;
}

const MAX_QUANTITY = 99;

function parseQuantity(input: unknown): number | null {
  if (input === undefined || input === null) return 1;
  if (typeof input !== 'number') return null;
  if (!Number.isInteger(input)) return null;
  if (input < 1 || input > MAX_QUANTITY) return null;
  return input;
}

export async function POST(req: NextRequest) {
  let payload: RequestBody;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof payload.productId !== 'string' || !payload.productId) {
    return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  }

  const product = getProduct(payload.productId);
  if (!product) {
    return NextResponse.json({ error: 'Unknown productId' }, { status: 400 });
  }

  const quantity = parseQuantity(payload.quantity);
  if (quantity === null) {
    return NextResponse.json(
      { error: `quantity must be an integer between 1 and ${MAX_QUANTITY}` },
      { status: 400 },
    );
  }

  const amountInt = product.price * quantity;
  const amountValue = String(amountInt);

  const paymentRequestId = randomUUID().replace(/-/g, '');

  await orderStore.create({
    paymentRequestId,
    productId: product.id,
    amount: amountValue,
    currency: product.currency,
    status: 'PENDING',
  });

  const apiBody: CreatePaymentSessionRequest = {
    productCode: 'CASHIER_PAYMENT',
    productScene: 'CHECKOUT_PAYMENT',
    paymentRequestId,
    order: {
      referenceOrderId: paymentRequestId,
      orderDescription: `${product.name} x ${quantity}`,
      orderAmount: { currency: product.currency, value: amountValue },
      buyer: {
        referenceBuyerId: `demo-buyer-${paymentRequestId.slice(0, 8)}`,
        buyerName: { firstName: 'Demo', lastName: 'User' },
        buyerEmail: 'demo@example.com',
      },
    },
    paymentAmount: { currency: product.currency, value: amountValue },
    settlementStrategy: { settlementCurrency: antomConfig.defaultCurrency },
    paymentRedirectUrl: `${antomConfig.siteUrl}/result?prid=${paymentRequestId}`,
    paymentNotifyUrl: `${antomConfig.siteUrl}${antomConfig.notifyPath}`,
    env: { terminalType: 'WEB' },
  };

  let resp: CreatePaymentSessionResponse;
  try {
    resp = await antomPost<CreatePaymentSessionResponse>(
      '/ams/api/v1/payments/createPaymentSession',
      apiBody,
    );
  } catch (err) {
    console.error('[antom] createPaymentSession failed', {
      paymentRequestId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to create payment session' },
      { status: 502 },
    );
  }

  if (resp.result.resultStatus !== 'S') {
    console.error('[antom] createPaymentSession non-success', {
      paymentRequestId,
      result: resp.result,
    });
    return NextResponse.json(
      {
        error: 'Antom returned non-success status',
        result: resp.result,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    paymentRequestId,
    paymentSessionId: resp.paymentSessionId,
    paymentSessionData: resp.paymentSessionData,
    normalUrl: resp.normalUrl,
  });
}
