/**
 * Neutral, generic payment iconography. Intentionally NOT real third-party
 * brand logos (Visa / Mastercard / etc.) to avoid trademark concerns in a
 * public template — we represent the *capability*, not specific brands.
 */

const icon = 'h-6 w-9 rounded-md border border-gray-200 bg-white p-1 text-gray-400';

function CardGlyph() {
  return (
    <svg viewBox="0 0 36 24" className={icon} aria-hidden>
      <rect x="1" y="3" width="34" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="7" width="34" height="3.5" fill="currentColor" />
    </svg>
  );
}

function WalletGlyph() {
  return (
    <svg viewBox="0 0 36 24" className={icon} aria-hidden>
      <rect x="2" y="5" width="32" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="28" cy="12.5" r="2.2" fill="currentColor" />
    </svg>
  );
}

function BankGlyph() {
  return (
    <svg viewBox="0 0 36 24" className={icon} aria-hidden>
      <path d="M18 4l13 6H5z" fill="currentColor" />
      <rect x="8" y="12" width="2.5" height="6" fill="currentColor" />
      <rect x="16.75" y="12" width="2.5" height="6" fill="currentColor" />
      <rect x="25.5" y="12" width="2.5" height="6" fill="currentColor" />
      <rect x="6" y="19" width="24" height="2" fill="currentColor" />
    </svg>
  );
}

function QrGlyph() {
  return (
    <svg viewBox="0 0 36 24" className={icon} aria-hidden>
      <rect x="6" y="4" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="23" y="4" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="6" y="13" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="23" y="15" width="3" height="3" fill="currentColor" />
      <rect x="28" y="13" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

export function PaymentMethods({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <CardGlyph />
      <WalletGlyph />
      <BankGlyph />
      <QrGlyph />
      <span className="text-xs text-gray-500">100+ global payment methods</span>
    </div>
  );
}
