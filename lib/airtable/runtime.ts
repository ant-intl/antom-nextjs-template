import 'server-only';
import { Pool } from 'pg';
import { readAirtableConfig } from './config';
import { createAirtableRecords } from './client';
import { PostgresAttemptStore } from './postgres';
import { createCheckoutService } from './service';
import { createAirtablePayments } from './payment';
import type { AirtableRuntime } from './http';

let cached: AirtableRuntime | undefined;

/** Disabled by default; neither connections nor migrations run on import/build. */
export function getAirtableRuntime(): AirtableRuntime | null {
  if (cached) return cached;
  const config = readAirtableConfig(process.env);
  if (!config) return null;
  const pool = new Pool({ connectionString: config.databaseUrl, max: 2,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000, statement_timeout: 10_000 });
  // Idle connection failures must not crash the process or expose connection details.
  pool.on('error', () => {});
  const service = createCheckoutService({
    records: createAirtableRecords({ token: config.token, baseId: config.baseId, tableId: config.tableId }),
    attempts: new PostgresAttemptStore(pool, config.bindingId),
    payments: createAirtablePayments(config),
    allowedCurrencies: config.allowedCurrencies, bindingId: config.bindingId,
  });
  cached = { config, service,
    async allowLogin() {
      // Shared across workers; a global per-merchant bucket avoids spoofable client-IP headers.
      const result = await pool.query(
        `INSERT INTO airtable_login_limits (bucket,hits,resets_at) VALUES ($1,1,now()+interval '1 minute')
         ON CONFLICT (bucket) DO UPDATE SET
           hits=CASE WHEN airtable_login_limits.resets_at<=now() THEN 1 ELSE LEAST(airtable_login_limits.hits+1,11) END,
           resets_at=CASE WHEN airtable_login_limits.resets_at<=now() THEN now()+interval '1 minute' ELSE airtable_login_limits.resets_at END
         RETURNING hits`, [config.bindingId]);
      return result.rows[0].hits <= 10;
    },
  };
  return cached;
}
