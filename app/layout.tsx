import type { Metadata } from 'next';
import './globals.css';
import { StoreHeader } from '@/components/StoreHeader';
import { StoreFooter } from '@/components/StoreFooter';
import { STORE } from '@/config/store';

export const metadata: Metadata = {
  title: `${STORE.name} — Premium Audio`,
  description: `${STORE.tagline} Secure global checkout powered by Antom.`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <StoreHeader />
        <div className="flex-1">{children}</div>
        <StoreFooter />
      </body>
    </html>
  );
}
