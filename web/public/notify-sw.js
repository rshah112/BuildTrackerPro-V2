// Custom notification handlers, importScripts'd into the Workbox-generated service worker
// (see vite.config.ts → VitePWA workbox.importScripts). Keeps the auto-managed precaching
// intact while adding notification routing + a push receiver.

// Tap a notification → focus an existing app window (and route it) or open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of wins) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client && url) {
            try {
              await client.navigate(url)
            } catch (e) {
              /* cross-origin or detached — ignore */
            }
          }
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url)
    })(),
  )
})

// Phase 2: server-sent web push (VAPID). Harmless until a PushSubscription exists — no
// pushes arrive without one, so this listener simply sits idle in Phase 1.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'BuildTracker Pro'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || '/' },
    }),
  )
})
