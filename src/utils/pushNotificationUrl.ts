export type PushPayload = {
  title?: string
  body?: string
  url?: string
  icon?: string
  badge?: string
  tag?: string
  event_id?: string
}

export function parseNotificationPayload(value: unknown): PushPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const stringValue = (key: string, maximumLength = 256) => {
    const field = record[key]
    return typeof field === 'string' ? field.slice(0, maximumLength) : undefined
  }
  return {
    title: stringValue('title', 120),
    body: stringValue('body', 240),
    url: stringValue('url', 2048),
    icon: stringValue('icon', 256),
    badge: stringValue('badge', 256),
    tag: stringValue('tag', 128),
    event_id: stringValue('event_id', 128),
  }
}

export function safeNotificationPath(requestedUrl: unknown, origin: string) {
  if (typeof requestedUrl !== 'string') return '/notifications'
  try {
    const parsedUrl = new URL(requestedUrl, origin)
    if (parsedUrl.origin !== origin) return '/notifications'
    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`
  } catch {
    return '/notifications'
  }
}

export async function runBestEffortPush(
  operation: () => Promise<unknown>,
  reportError: (error: unknown) => void,
) {
  try {
    await operation()
  } catch (error) {
    try {
      reportError(error)
    } catch {
      return
    }
  }
}
