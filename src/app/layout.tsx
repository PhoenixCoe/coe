import type { Metadata, Viewport } from 'next';
import './fonts.generated.css';
import './globals.css';

const SITE = 'https://coe.pmcstudios.uk';
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Coe: chat, study help and code check', template: '%s | Coe' },
  description: 'Chat, get step-by-step study help, and check code for errors. Add pictures, pick a model, and keep your chats on your device or in your account.',
  openGraph: { siteName: 'Coe', type: 'website' },
  icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/favicon.svg', type: 'image/svg+xml' }], apple: '/apple-touch-icon.png' },
};
export const viewport: Viewport = { themeColor: '#171717', viewportFit: 'cover' };

const LD = {
  '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Coe', url: SITE, applicationCategory: 'EducationalApplication', operatingSystem: 'Any',
  description: 'Chat, study help and a code checker in one place. Conversations stay on your device.', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LD) }} /></head>
      <body>{children}</body>
    </html>
  );
}
