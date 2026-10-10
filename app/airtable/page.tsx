import type { Metadata } from 'next';
import { AirtableCheckout } from '@/components/AirtableCheckout';
import { localPreviewEnabled, PREVIEW_ORDER } from '@/lib/airtable/local-preview';

export const metadata: Metadata = {
  title: 'Airtable order checkout | Antom',
  description: 'Review an Airtable order and prepare its Antom checkout.',
  robots: { index: false, follow: false },
};

export default function AirtablePage({
  searchParams,
}: {
  searchParams: { recordId?: string | string[] };
}) {
  const preview = localPreviewEnabled(process.env);
  const recordId = preview ? PREVIEW_ORDER.recordId : typeof searchParams.recordId === 'string'
    ? searchParams.recordId
    : null;

  return <AirtableCheckout key={preview ? 'preview' : 'connected'} recordId={recordId} preview={preview} />;
}
