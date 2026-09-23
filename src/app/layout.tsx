import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Seekers’ Hub | Kingdom Seekers',
  description: 'Discover, grow, pray, serve and see the impact we make together.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
