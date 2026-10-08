/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<unknown>
}

// deployment refresh marker — keep production build moving to the latest main
clientsClaim()

// Allow the in-app Update button to activate the waiting service worker.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  if (!event.data) return
  let data: { title?: string; body?: string; url?: string; icon?: string; badge?: string } = {}
  try { data = event.data.json() } catch { data = { body: event.data.text() } }

  const title = data.title || 'Banjara Connect'
  const options: NotificationOptions = {
    body: data.body || 'You have a new notification.',
    icon: data.icon || '/banjara-mark.svg',
    badge: data.badge || '/banjara-mark.svg',
    data: { url: data.url || '/notifications' },
    tag: 'banjara-connect',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data?.url || '/notifications') as string, self.location.origin).href
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
