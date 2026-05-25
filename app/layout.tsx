import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Antom Payment Demo',
  description:
    'Accept global payments with Antom CKP Embedded mode on Vercel + Next.js.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}
