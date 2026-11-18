import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Household',
    short_name: 'Household',
    description: 'Shared expense tracker',
    start_url: '/',
    display: 'standalone',
    background_color: '#0C1A24',
    theme_color: '#0C1A24',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android keeps only the middle 80% of a maskable icon, so this one
      // draws the mark smaller on the same full-bleed tile.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Android only. Chrome puts the app in the system share sheet, so sharing
    // an SMS straight to it works with no Shortcut and no extra taps.
    // iOS Safari does not support this, which is why iPhones use a Shortcut.
    share_target: {
      action: '/add',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    },
  } as MetadataRoute.Manifest
}
