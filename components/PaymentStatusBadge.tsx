interface PaymentStatusBadgeProps {
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAIL' | 'CANCELLED' | string;
}

const STYLES: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-800 border-green-200',
  FAIL: 'bg-red-100 text-red-800 border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-800 border-gray-200',
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  PROCESSING: 'bg-amber-100 text-amber-800 border-amber-200',
};

const LABELS: Record<string, string> = {
  SUCCESS: 'Paid',
  FAIL: 'Failed',
  CANCELLED: 'Cancelled',
  PENDING: 'Pending',
  PROCESSING: 'Processing',
};

export function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
  const style = STYLES[status] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  const label = LABELS[status] ?? status;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${style}`}
    >
      {label}
    </span>
  );
}
