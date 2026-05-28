/**
 * Antom integration constants that are stable across deployments but
 * may need to change when you reconfigure your merchant account.
 *
 * These live in source (not env) on purpose — changing them implies a
 * matching change in Antom Dashboard, which is a coordinated code +
 * platform change rather than an ops dial. Bumping any of these
 * requires a redeploy.
 */

/**
 * Version of the merchant RSA key pair currently uploaded to Antom Dashboard.
 *
 * When rotating keys:
 *   1. Generate a new RSA-2048 pair.
 *   2. Upload the new public key to Antom Dashboard → Developer → Key configuration
 *      and obtain its assigned key version (typically '2', '3', ...).
 *   3. Bump this constant to match.
 *   4. Replace ANTOM_PRIVATE_KEY env in Vercel with the new private key.
 *   5. Redeploy.
 *
 * Mismatch symptom: every outbound API call gets `SIGN_VERIFY_FAILURE`
 * from Antom, with no other clue. So treat this constant as load-bearing.
 */
export const ANTOM_KEY_VERSION = '1';

/**
 * Antom platform signature algorithm. The runtime verifier in
 * `sign.ts` is hard-coded to RSA-SHA256, so a change here without
 * also changing that function is a no-op (and a bug). Pinned as a
 * constant so the value travels with the code that depends on it.
 */
export const ANTOM_SIGNATURE_ALGORITHM = 'RSA256';

/**
 * Webhook freshness window. Notifications whose `Request-Time` header
 * is older or more future-dated than this are rejected — this is the
 * defence against replay of previously-captured valid notifications.
 *
 * Tune up if you see legitimate webhooks getting 401 due to clock skew
 * on the Antom side; tune down for stricter replay protection.
 */
export const WEBHOOK_REPLAY_WINDOW_MS = 5 * 60 * 1000;
