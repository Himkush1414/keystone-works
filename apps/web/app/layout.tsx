import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { cssVariables } from '@lamplight/tokens';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { nightClass } from '../lib/night';
import { fontVariables } from './fonts';
import './globals.css';

const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://keystone-works-three.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: 'Lamplight: books read aloud, offline', template: '%s · Lamplight' },
  description:
    'Books, PDFs and articles read aloud by natural voices that run entirely on your phone. Offline, private, one price. Coming soon to Google Play.',
  applicationName: 'Lamplight',
  icons: {
    icon: [
      { url: '/mark.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: { type: 'website', siteName: 'Lamplight', images: ['/og-image.png'] },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4EEE3' },
    { media: '(prefers-color-scheme: dark)', color: '#100E0B' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <style href="lamplight-tokens" precedence="default">
          {`${cssVariables()}\n${nightClass()}`}
        </style>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
