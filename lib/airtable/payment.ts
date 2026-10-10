import { antomPostWithConfig, type AntomTransportConfig } from '../antom/transport';
import type { AirtableConfig } from './config';
import { PaymentRejectedError, type CheckoutSession, type OrderSnapshot, validateRecordId } from './domain';
import type { CheckoutPayments } from './service';

/** Injected implementations must return only signature-verified Antom responses. */
export type AirtableAntomPost = (
  config: AntomTransportConfig,
  path: string,
  payload: unknown,
) => Promise<unknown>;

const SESSION_PATH = '/ams/api/v1/payments/createPaymentSession';
const unresolved = () => new Error('Antom session creation outcome requires review');

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unresolved();
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}

function validateInput(snapshot: OrderSnapshot, attemptId: string, config: AirtableConfig) {
  validateRecordId(snapshot.recordId);
  if (typeof attemptId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(attemptId) || !text(snapshot.orderId, 64) ||
      !text(snapshot.description, 256) || typeof snapshot.amountMinor !== 'string' || !/^[1-9][0-9]*$/.test(snapshot.amountMinor) ||
      !Number.isSafeInteger(Number(snapshot.amountMinor)) ||
      !/^[A-Z]{3}$/.test(snapshot.currency) || !config.allowedCurrencies.includes(snapshot.currency)) {
    throw new Error('Invalid server order snapshot');
  }
  const buyer = snapshot.buyer;
  if (buyer && (
    (buyer.referenceBuyerId !== undefined && !text(buyer.referenceBuyerId, 64)) ||
    (buyer.buyerName?.firstName !== undefined && !text(buyer.buyerName.firstName, 64)) ||
    (buyer.buyerName?.lastName !== undefined && !text(buyer.buyerName.lastName, 64)) ||
    (buyer.buyerEmail !== undefined && (!text(buyer.buyerEmail, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.buyerEmail)))
  )) throw new Error('Invalid server buyer information');
}

function sessionFromVerifiedResponse(value: unknown, checkoutHosts: readonly string[]): CheckoutSession {
  const response = object(value);
  const result = object(response.result);
  if (!text(result.resultCode, 64) || typeof result.resultMessage !== 'string') throw unresolved();
  if (result.resultStatus === 'F') {
    // An F accompanied by session output or a SUCCESS code is contradictory.
    if (result.resultCode === 'SUCCESS' ||
        ['normalUrl', 'paymentSessionId', 'paymentSessionData', 'paymentSessionExpiryTime'].some(key => key in response)) throw unresolved();
    throw new PaymentRejectedError('Antom rejected session creation');
  }
  if (result.resultStatus !== 'S' || result.resultCode !== 'SUCCESS' ||
      !text(response.normalUrl, 8192) || !text(response.paymentSessionId, 512) ||
      !text(response.paymentSessionExpiryTime, 64)) throw unresolved();
  const normalUrl = response.normalUrl;
  let url: URL;
  try { url = new URL(normalUrl); } catch { throw unresolved(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !checkoutHosts.includes(url.hostname) || url.hash || /[\\\s]/.test(normalUrl)) throw unresolved();
  const expiry = response.paymentSessionExpiryTime;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(expiry) ||
      !Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()) throw unresolved();
  // Preserve Antom's exact URL; never add merchant, price or attribution parameters.
  return { normalUrl, paymentSessionId: response.paymentSessionId, paymentSessionExpiryTime: expiry };
}

/** Airtable-specific Hosted Checkout, isolated from the original storefront API. */
export function createAirtablePayments(
  config: AirtableConfig,
  post: AirtableAntomPost = antomPostWithConfig,
): CheckoutPayments {
  const origin = new URL(config.appOrigin);
  if (config.antom.env !== 'sandbox' || origin.protocol !== 'https:' ||
      origin.origin !== config.appOrigin || origin.username || origin.password ||
      !config.checkoutHosts.length || !/^[A-Z]{3}$/.test(config.settlementCurrency)) {
    throw new Error('Invalid Airtable payment configuration');
  }
  return {
    async create(snapshot, attemptId) {
      validateInput(snapshot, attemptId, config);
      const amount = { currency: snapshot.currency, value: snapshot.amountMinor };
      const buyer = snapshot.buyer;
      const payload = {
        productCode: 'CASHIER_PAYMENT',
        productScene: 'CHECKOUT_PAYMENT',
        paymentRequestId: attemptId,
        order: {
          referenceOrderId: snapshot.orderId,
          orderDescription: snapshot.description,
          orderAmount: { ...amount },
          ...(buyer ? { buyer: {
            ...(buyer.referenceBuyerId ? { referenceBuyerId: buyer.referenceBuyerId } : {}),
            ...(buyer.buyerName ? { buyerName: { ...buyer.buyerName } } : {}),
            ...(buyer.buyerEmail ? { buyerEmail: buyer.buyerEmail } : {}),
          } } : {}),
        },
        paymentAmount: { ...amount },
        paymentFactor: { captureMode: 'AUTOMATIC' },
        settlementStrategy: { settlementCurrency: config.settlementCurrency },
        paymentRedirectUrl: `${config.appOrigin}/airtable?recordId=${encodeURIComponent(snapshot.recordId)}`,
        paymentNotifyUrl: `${config.appOrigin}/api/airtable/webhooks/antom`,
        env: { terminalType: 'WEB' },
      };
      // This transport verifies the raw response before returning parsed business data.
      // Network/verification errors propagate as unknown, never as a confirmed F.
      const response = await post(config.antom, SESSION_PATH, payload);
      return sessionFromVerifiedResponse(response, config.checkoutHosts);
    },
  };
}
