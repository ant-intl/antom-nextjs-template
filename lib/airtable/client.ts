import { AirtableError, type AirtableRecord, validateRecordId } from './domain';

export interface AirtableRecords {
  get(recordId: string): Promise<AirtableRecord>;
  writePayment(recordId: string, fields: Record<string, string>): Promise<void>;
  writeSession(recordId: string, fields: Record<string, string>): Promise<void>;
}

export function createAirtableRecords(options: {
  token: string;
  baseId: string;
  tableId: string;
  fetch?: typeof fetch;
}): AirtableRecords {
  if (!/^app[A-Za-z0-9]{14}$/.test(options.baseId) || !/^tbl[A-Za-z0-9]{14}$/.test(options.tableId) || !options.token) {
    throw new AirtableError('INVALID_AIRTABLE_BINDING', 503);
  }
  const fetcher = options.fetch ?? fetch;
  const base = `https://api.airtable.com/v0/${options.baseId}/${options.tableId}`;
  async function request(recordId: string, fields?: Record<string, string>): Promise<AirtableRecord> {
    validateRecordId(recordId);
    let response: Response;
    try {
      response = await fetcher(`${base}/${recordId}`, {
        method: fields ? 'PATCH' : 'GET',
        headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
        body: fields ? JSON.stringify({ fields, typecast: false }) : undefined,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
    } catch { throw new AirtableError('AIRTABLE_UNAVAILABLE', 502); }
    if (!response.ok) {
      if (response.status === 404) throw new AirtableError('ORDER_NOT_FOUND', 404);
      if (response.status === 429) throw new AirtableError('AIRTABLE_RATE_LIMITED', 429);
      throw new AirtableError('AIRTABLE_REQUEST_FAILED', 502);
    }
    let value: unknown;
    try { value = await response.json(); } catch { throw new AirtableError('AIRTABLE_INVALID_RESPONSE', 502); }
    if (!value || typeof value !== 'object' || !('id' in value) || value.id !== recordId || !('fields' in value) || !value.fields || typeof value.fields !== 'object') {
      throw new AirtableError('AIRTABLE_INVALID_RESPONSE', 502);
    }
    return value as AirtableRecord;
  }
  return {
    get: recordId => request(recordId),
    async writePayment(recordId, fields) {
      const permitted = new Set(['Payment result', 'Capture result', 'Antom payment ID', 'Checkout URL']);
      if (Object.keys(fields).some(key => !permitted.has(key)) || (fields['Checkout URL'] !== undefined && fields['Checkout URL'] !== '')) {
        throw new AirtableError('INVALID_WRITEBACK_FIELDS', 500);
      }
      await request(recordId, fields);
    },
    async writeSession(recordId, fields) {
      const permitted = new Set(['Checkout state', 'Checkout URL', 'Payment request ID', 'Payment session ID', 'Session expires at', 'Last error']);
      if (Object.keys(fields).some(key => !permitted.has(key))) throw new AirtableError('INVALID_WRITEBACK_FIELDS', 500);
      await request(recordId, fields);
    },
  };
}
