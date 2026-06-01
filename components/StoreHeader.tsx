import Link from 'next/link';
import { STORE } from '@/config/store';

function Logo() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
      <rect width="28" height="28" rx="8" fill="#0A0A0A" />
      <circle cx="14" cy="14" r="5.5" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="14" cy="14" r="1.6" fill="#fff" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-gray-700" aria-hidden>
      <path
        d="M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function StoreHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-base font-semibold tracking-tight text-gray-950">
            {STORE.name}
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="hidden text-gray-600 transition hover:text-gray-950 sm:inline">
            Shop
          </Link>
          <Link href="/" className="hidden text-gray-600 transition hover:text-gray-950 sm:inline">
            Support
          </Link>
          <button
            type="button"
            aria-label="Cart"
            className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-50"
          >
            <BagIcon />
          </button>
        </nav>
      </div>
    </header>
  );
}
