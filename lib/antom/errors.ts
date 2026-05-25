/**
 * Map Antom result codes to human-readable messages.
 * Reference: https://docs.antom.com/docs/result-codes
 */

const KNOWN: Record<string, string> = {
  SUCCESS: 'Payment succeeded.',
  PAYMENT_IN_PROCESS: 'Payment is being processed.',
  ORDER_NOT_EXIST: 'Order not found.',
  ORDER_IS_CLOSED: 'Order is closed.',
  ORDER_IS_FINISHED: 'Order is already finished.',
  PAYMENT_TIMEOUT: 'Payment timed out.',
  USER_PAYMENT_VERIFICATION_FAILED: 'Payment verification failed.',
  PAYMENT_AMOUNT_EXCEED_LIMIT: 'Payment amount exceeds the limit.',
  RISK_REJECT: 'Payment rejected by risk control.',
  PROCESS_FAIL: 'Payment processing failed.',
  PARAM_ILLEGAL: 'Invalid request parameters.',
  SIGN_VERIFY_FAILURE: 'Signature verification failed.',
  ACCESS_DENIED: 'Access denied. Check Client ID and key configuration.',
};

export function describeAntomResult(code: string, fallback?: string): string {
  return KNOWN[code] ?? fallback ?? code;
}
