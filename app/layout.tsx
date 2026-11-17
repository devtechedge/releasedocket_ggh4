import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Public_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-public-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ReleaseDocket — Verifiable Delivery Receipts for Software Agencies',
  description:
    'Delivery receipt, engineering evidence verification, and client acceptance platform for boutique software and AI-automation agencies.',
  openGraph: {
    title: 'ReleaseDocket — Verifiable Delivery Receipts for Software Agencies',
    description:
      'Delivery receipt, engineering evidence verification, and client acceptance platform for boutique software and AI-automation agencies.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReleaseDocket — Verifiable Delivery Receipts for Software Agencies',
    description:
      'Delivery receipt, engineering evidence verification, and client acceptance platform for boutique software and AI-automation agencies.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${publicSans.variable} ${jetbrainsMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-blue-100 selection:text-blue-900"
      >
        {children}
      </body>
    </html>
  );
}
