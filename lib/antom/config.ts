import 'server-only';
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

/**
 * Hostnames we will sign requests to. Anything else fails fast at boot —
 * a misconfigured ANTOM_GATEWAY_URL must never cause the private key to
 * be used against an attacker-controlled domain.
 */
const ALLOWED_GATEWAY_HOSTS = new Set<string>([
  'open-sea-global.alipay.com',
  'open-eu-global.alipay.com',
  'open-us-global.alipay.com',
  'open-global.alipay.com',
]);

function validateGateway(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`[antom] ANTOM_GATEWAY_URL is not a valid URL: ${raw}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`[antom] ANTOM_GATEWAY_URL must use https, got: ${url.protocol}`);
  }
  if (!ALLOWED_GATEWAY_HOSTS.has(url.hostname)) {
    throw new Error(
      `[antom] ANTOM_GATEWAY_URL host '${url.hostname}' is not in the allowed list. ` +
        `Allowed: ${[...ALLOWED_GATEWAY_HOSTS].join(', ')}`,
    );
  }
  // Reject paths / query / fragment — base URL only.
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error(`[antom] ANTOM_GATEWAY_URL must not include a path, got: ${url.pathname}`);
  }
  if (url.search || url.hash) {
    throw new Error(`[antom] ANTOM_GATEWAY_URL must not include query or fragment`);
  }
  return `${url.protocol}//${url.host}`;
}

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
