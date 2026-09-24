import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Seekers’ Hub | Kingdom Seekers',
  description: 'Discover, grow, pray, serve and see the impact we make together.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Seekers Hub', statusBarStyle: 'default' },
  icons: { apple: '/pwa-192.png' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
