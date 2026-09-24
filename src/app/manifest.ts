import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Seekers’ Hub | Kingdom Seekers',
    short_name: 'Seekers Hub',
    description: 'Discover, grow, pray, serve, and stay connected with Kingdom Seekers.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#faf7f3',
    theme_color: '#843522',
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
