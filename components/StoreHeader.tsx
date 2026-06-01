import Link from 'next/link';
import { STORE } from '@/config/store';

function Logo() {
  return (
    <svg viewBox="0 0 28 28" className="h-6 w-6" aria-hidden>
      <rect width="28" height="28" rx="8" fill="#1d1d1f" />
      <circle cx="14" cy="14" r="5.5" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="14" cy="14" r="1.6" fill="#fff" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-ui-ink" aria-hidden>
      <path
        d="M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function StoreHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-ui-line/50 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight text-ui-ink">
            {STORE.name}
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-[12px] text-ui-gray">
          <Link href="/" className="hidden transition hover:text-ui-ink sm:inline">
            Store
          </Link>
          <Link href="/" className="hidden transition hover:text-ui-ink sm:inline">
            Support
          </Link>
          <button
            type="button"
            aria-label="Bag"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-ui-panel"
          >
            <BagIcon />
          </button>
        </nav>
      </div>
    </header>
  );
}
