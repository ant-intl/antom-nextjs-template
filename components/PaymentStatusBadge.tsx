import type { RenderablePaymentStatus } from '@/lib/api-contracts';

interface PaymentStatusBadgeProps {
  status: RenderablePaymentStatus;
}

const STYLES: Record<RenderablePaymentStatus, string> = {
  SUCCESS: 'bg-green-50 text-green-700 border-green-200',
  FAIL: 'bg-red-50 text-red-700 border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-700 border-gray-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  PROCESSING: 'bg-amber-50 text-amber-700 border-amber-200',
  UNKNOWN: 'bg-gray-100 text-gray-600 border-gray-200',
};

const DOTS: Record<RenderablePaymentStatus, string> = {
  SUCCESS: 'bg-green-500',
  FAIL: 'bg-red-500',
  CANCELLED: 'bg-gray-400',
  PENDING: 'bg-amber-500',
  PROCESSING: 'bg-amber-500',
  UNKNOWN: 'bg-gray-400',
};

const LABELS: Record<RenderablePaymentStatus, string> = {
  SUCCESS: 'Paid',
  FAIL: 'Failed',
  CANCELLED: 'Cancelled',
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  UNKNOWN: 'Unknown',
};

export function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[status]}`} />
      {LABELS[status]}
    </span>
  );
}
