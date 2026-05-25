/**
 * Antom Open API request/response TypeScript types.
 * Covers a minimal subset used by this template.
 */

export type ResultStatus = 'S' | 'F' | 'U';

export interface AntomResult {
  resultCode: string;
  resultStatus: ResultStatus;
  resultMessage: string;
}

export interface AntomAmount {
  currency: string;
  /** Integer string in the smallest unit (e.g. cents). */
  value: string;
}

// --- createPaymentSession --------------------------------------------------

export interface CreatePaymentSessionRequest {
  productCode: 'CASHIER_PAYMENT';
  /** Required for embedded CKP. Use 'CHECKOUT_PAYMENT'. */
  productScene: 'CHECKOUT_PAYMENT';
  paymentRequestId: string;
  order: {
    referenceOrderId: string;
    orderDescription: string;
    orderAmount: AntomAmount;
    /** Some sandbox accounts require buyer info even for one-time payment. */
    buyer?: {
      referenceBuyerId?: string;
      buyerName?: { firstName?: string; lastName?: string };
      buyerEmail?: string;
      buyerPhoneNo?: string;
    };
  };
  paymentAmount: AntomAmount;
  paymentMethod?: { paymentMethodType?: string };
  settlementStrategy?: { settlementCurrency: string };
  paymentRedirectUrl: string;
  paymentNotifyUrl: string;
  env: { terminalType: 'WEB' | 'WAP' | 'APP' };
}

export interface CreatePaymentSessionResponse {
  result: AntomResult;
  paymentSessionData?: string;
  paymentSessionId?: string;
  paymentSessionExpiryTime?: string;
  normalUrl?: string;
}

// --- inquiryPayment --------------------------------------------------------

export interface InquiryPaymentRequest {
  paymentRequestId: string;
}

export type PaymentStatus = 'SUCCESS' | 'FAIL' | 'PROCESSING' | 'CANCELLED';

export interface InquiryPaymentResponse {
  result: AntomResult;
  paymentStatus?: PaymentStatus;
  paymentRequestId?: string;
  paymentId?: string;
  paymentAmount?: AntomAmount;
  paymentTime?: string;
}

// --- webhook payload -------------------------------------------------------

export interface PaymentNotifyPayload {
  notifyType: 'PAYMENT_RESULT' | string;
  result: AntomResult;
  paymentRequestId: string;
  paymentId?: string;
  paymentAmount?: AntomAmount;
  paymentCreateTime?: string;
  paymentTime?: string;
}
