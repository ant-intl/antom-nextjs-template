/** Explicit operator command. Never imported or invoked by the application runtime. */
import { readFile } from 'node:fs/promises';
import pg from 'pg';

let client;
try {
  const connectionString = process.env.AIRTABLE_DATABASE_URL;
  if (!connectionString) throw new Error('configuration');
  const target = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.hostname) throw new Error('configuration');
  const schema = await readFile(new URL('../sql/airtable.sql', import.meta.url), 'utf8');
  client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await client.connect();
  // The checked-in migration contains its own BEGIN/COMMIT transaction.
  await client.query(schema);
  console.log('Airtable schema migration completed.');
} catch {
  // Driver exceptions may contain database addresses or usernames. Do not log them or the DSN.
  console.error('Airtable schema migration failed. Check AIRTABLE_DATABASE_URL, database access, and schema permissions.');
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
