import 'server-only';
import { validateGateway } from './transport';
import {
  ANTOM_KEY_VERSION,
  ANTOM_SIGNATURE_ALGORITHM,
  WEBHOOK_REPLAY_WINDOW_MS,
} from './constants';

/**
 * Antom integration runtime config.
 * Validates required env vars at startup; fails fast on missing values.
 */

const REQUIRED = [
  'ANTOM_CLIENT_ID',
  'ANTOM_PRIVATE_KEY',
  'ANTOM_PUBLIC_KEY',
  'ANTOM_GATEWAY_URL',
  'NEXT_PUBLIC_ANTOM_ENV',
  'NEXT_PUBLIC_SITE_URL',
] as const;

function loadConfig() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `[antom] Missing required env vars: ${missing.join(', ')}\n` +
        `See .env.example for setup instructions.`,
    );
  }

  const env = process.env.NEXT_PUBLIC_ANTOM_ENV;
  if (env !== 'sandbox' && env !== 'prod') {
    throw new Error(
      `[antom] NEXT_PUBLIC_ANTOM_ENV must be 'sandbox' or 'prod', got: ${env}`,
    );
  }

  const gateway = validateGateway(process.env.ANTOM_GATEWAY_URL!);

  // Site URL fallback chain: explicit env -> Vercel URL -> localhost
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  return {
    clientId: process.env.ANTOM_CLIENT_ID!,
    privateKey: process.env.ANTOM_PRIVATE_KEY!,
    publicKey: process.env.ANTOM_PUBLIC_KEY!,
    gateway,
    env: env as 'sandbox' | 'prod',
    siteUrl: siteUrl.replace(/\/$/, ''),
    notifyPath: process.env.ANTOM_NOTIFY_PATH ?? '/api/webhooks/antom',
    defaultCurrency: process.env.ANTOM_DEFAULT_CURRENCY ?? 'USD',
    keyVersion: ANTOM_KEY_VERSION,
    /** Antom platform signature algorithm name as it appears in the Signature header. */
    signatureAlgorithm: ANTOM_SIGNATURE_ALGORITHM,
    replayWindowMs: WEBHOOK_REPLAY_WINDOW_MS,
    /**
     * Secret used to sign paymentRequestId tokens handed to the browser.
     * Derived from the merchant private key — both are server-only and
     * rotated together.
     */
    prsigSecret: process.env.ANTOM_PRIVATE_KEY!,
  };
}

export const antomConfig = loadConfig();

export type AntomConfig = typeof antomConfig;
