import { createHash } from 'node:crypto';
import { validateGateway } from '../antom/transport';
import type { AntomTransportConfig } from '../antom/transport';
import { ANTOM_KEY_VERSION, ANTOM_SIGNATURE_ALGORITHM } from '../antom/constants';

/** Only runtime.ts reads deployment secrets. This pure parser is also tested with synthetic values. */
export interface AirtableConfig {
  token: string;
  baseId: string;
  tableId: string;
  databaseUrl: string;
  operatorPassword: string;
  sessionSecret: string;
  appOrigin: string;
  allowedCurrencies: string[];
  checkoutHosts: string[];
  bindingId: string;
  settlementCurrency: string;
  antom: AntomTransportConfig;
}

export class AirtableConfigurationError extends Error {
  constructor() { super('Airtable integration is not configured. Ask the deployment administrator to check the setup guide.'); }
}

type Environment = Readonly<Record<string, string | undefined>>;
function required(env: Environment, name: string, trim = false): string {
  const value = env[name];
  if (!value?.trim() || (!trim && value !== value.trim())) throw new AirtableConfigurationError();
  return trim ? value.trim() : value;
}

export function readAirtableConfig(env: Environment): AirtableConfig | null {
  if (env.AIRTABLE_ENABLED !== 'true') return null;
  try {
    const token = required(env, 'AIRTABLE_PAT');
    const baseId = required(env, 'AIRTABLE_BASE_ID');
    const tableId = required(env, 'AIRTABLE_TABLE_ID');
    if (!/^app[A-Za-z0-9]{14}$/.test(baseId) || !/^tbl[A-Za-z0-9]{14}$/.test(tableId)) throw new Error();
    const databaseUrl = required(env, 'AIRTABLE_DATABASE_URL');
    const db = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.hostname) throw new Error();
    const operatorPassword = required(env, 'AIRTABLE_OPERATOR_PASSWORD');
    const sessionSecret = required(env, 'AIRTABLE_SESSION_SECRET');
    if (operatorPassword.length < 32 || sessionSecret.length < 32 || operatorPassword === sessionSecret) throw new Error();
    const appOrigin = required(env, 'NEXT_PUBLIC_SITE_URL').replace(/\/$/, '');
    const site = new URL(appOrigin);
    if (site.protocol !== 'https:' || site.origin !== appOrigin || site.username || site.password) throw new Error();
    if (env.NEXT_PUBLIC_ANTOM_ENV !== 'sandbox' || env.AIRTABLE_TRUST_BASE_EDITORS !== 'true') throw new Error();
    const allowedCurrencies = required(env, 'AIRTABLE_ALLOWED_CURRENCIES').split(',').map(v => v.trim());
    if (!allowedCurrencies.length || allowedCurrencies.some(v => !/^[A-Z]{3}$/.test(v))) throw new Error();
    const checkoutHosts = required(env, 'AIRTABLE_CHECKOUT_HOSTS').split(',').map(v => v.trim().toLowerCase());
    if (!checkoutHosts.length || checkoutHosts.some(v => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(v))) throw new Error();
    const settlementCurrency = env.ANTOM_DEFAULT_CURRENCY || 'USD';
    if (!/^[A-Z]{3}$/.test(settlementCurrency)) throw new Error();
    const antom: AntomTransportConfig = {
      clientId: required(env, 'ANTOM_CLIENT_ID'),
      privateKey: required(env, 'ANTOM_PRIVATE_KEY', true),
      publicKey: required(env, 'ANTOM_PUBLIC_KEY', true),
      gateway: validateGateway(required(env, 'ANTOM_GATEWAY_URL')),
      env: 'sandbox', keyVersion: ANTOM_KEY_VERSION, signatureAlgorithm: ANTOM_SIGNATURE_ALGORITHM,
    };
    const bindingId = createHash('sha256').update(JSON.stringify([antom.env, antom.gateway, antom.clientId, baseId, tableId])).digest('hex');
    return { token, baseId, tableId, databaseUrl, operatorPassword, sessionSecret, appOrigin,
      allowedCurrencies, checkoutHosts, bindingId, settlementCurrency, antom };
  } catch { throw new AirtableConfigurationError(); }
}
