import { clientEnv } from '@/config/env';
import { STORE } from '@/config/store';
import { PaymentMethods } from './PaymentMethods';

const REPO = 'https://github.com/ant-intl/antom-nextjs-template';

export function StoreFooter() {
  const isSandbox = clientEnv.antomEnv === 'sandbox';
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <div className="text-base font-semibold tracking-tight text-gray-950">
              {STORE.name}
            </div>
            <p className="mt-1 text-sm text-gray-500">{STORE.tagline}</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-400" aria-hidden>
                <path
                  d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Secure checkout powered by Antom
            </div>
            <PaymentMethods />
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-gray-100 pt-6 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              © {year} {STORE.name}
            </span>
            <span className="text-gray-300">·</span>
            <span>For demonstration purposes only</span>
            <a href={`${REPO}/blob/master/LEGAL.md`} className="text-gray-500 underline-offset-2 hover:underline">
              Legal
            </a>
            <a href={`${REPO}/blob/master/LICENSE`} className="text-gray-500 underline-offset-2 hover:underline">
              License
            </a>
          </div>
          {isSandbox && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Demo · Sandbox
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
