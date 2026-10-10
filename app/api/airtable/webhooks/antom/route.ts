import { airtableHandlers } from '@/lib/airtable/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return airtableHandlers.webhook(request);
}
