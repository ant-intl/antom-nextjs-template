import { airtableHandlers } from '@/lib/airtable/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: { recordId: string } }): Promise<Response> {
  return airtableHandlers.syncPayment(request, context.params.recordId);
}
