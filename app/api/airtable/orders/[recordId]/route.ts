import { airtableHandlers } from '@/lib/airtable/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: { recordId: string } }): Promise<Response> {
  return airtableHandlers.preview(request, context.params.recordId);
}
