/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { parseNotificationPayload, safeNotificationPath, type PushPayload } from './utils/pushNotificationUrl'

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
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
  denylist: [/^\/install\.html$/],
}))

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  if (event.data) {
    try {
      const payload = parseNotificationPayload(event.data.json())
      if (payload) {
        data = payload
      } else {
        data = { body: event.data.text() }
      }
    } catch {
      data = { body: event.data.text() }
    }
  }

  const title = data.title || 'Banjara Connect'
  const url = safeNotificationPath(data.url, self.location.origin)
  const eventId = typeof data.event_id === 'string' ? data.event_id : ''
  const requestedTag = typeof data.tag === 'string' ? data.tag : ''
  const tag = (requestedTag || (eventId ? `connect:${eventId}` : '')).slice(0, 128)
  const options: NotificationOptions = {
    body: data.body || 'You have a new notification.',
    icon: safeNotificationPath(data.icon || '/banjara-mark.svg', self.location.origin),
    badge: safeNotificationPath(data.badge || '/banjara-mark.svg', self.location.origin),
    data: { url },
  }
  if (tag) options.tag = tag
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const requestedUrl = event.notification.data?.url
  const url = new URL(safeNotificationPath(requestedUrl, self.location.origin), self.location.origin).href
  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windowClients) {
      if (!('focus' in client)) continue
      try {
        if ('navigate' in client) await client.navigate(url)
        await client.focus()
        return
      } catch {
        continue
      }
    }
    await self.clients.openWindow(url)
  })())
})
