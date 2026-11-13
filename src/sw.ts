/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<unknown>
}

// Activate updated app workers immediately so installed PWAs do not stay on stale navigation bundles.
self.skipWaiting()
clientsClaim()

// Allow the in-app Update button to activate the waiting service worker.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  if (!event.data) return
  let data: { title?: string; body?: string; url?: string; icon?: string; badge?: string; tag?: string } = {}
  try { data = event.data.json() } catch { data = { body: event.data.text() } }

  const title = data.title || 'Banjara Connect'
  const options: NotificationOptions & { renotify?: boolean } = {
    body: data.body || 'You have a new notification.',
    icon: data.icon || '/banjara-mark.svg',
    badge: data.badge || '/banjara-mark.svg',
    data: { url: data.url || '/notifications' },
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const requestedUrl = new URL((event.notification.data?.url || '/notifications') as string, self.location.origin)
  const url = requestedUrl.origin === self.location.origin ? requestedUrl.href : new URL('/notifications', self.location.origin).href
  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windowClients) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) await client.navigate(url)
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
