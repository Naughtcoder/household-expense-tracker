// Caches the shell so the app opens instantly and survives a dead signal.
// Data is never cached: money must not be shown stale.
const SHELL = 'household-shell-v1'
const ASSETS = ['/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  if (url.origin !== location.origin) return
  // Pages and API calls always go to the network.
  if (!ASSETS.includes(url.pathname)) return
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)))
})

// A payment is waiting for a category. Tapping opens it.
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { /* show a plain one */ }
  e.waitUntil(self.registration.showNotification(d.title || 'A payment needs a category', {
    body: d.body || 'Tap to pick one',
    tag: d.tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url || '/review' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/review'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => 'focus' in c)
    if (open) return open.navigate(url).then(c => (c || open).focus())
    return self.clients.openWindow(url)
  }))
})
