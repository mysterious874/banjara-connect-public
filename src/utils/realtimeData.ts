import { supabase } from './supabase'

export type RealtimeSubscriptionStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'

type PostgresEvent = '*' | 'INSERT' | 'UPDATE' | 'DELETE'
type PostgresSubscription = {
  topic: string
  event: PostgresEvent
  table: string
  filter?: string
}
type Subscriber = {
  onChange: () => void
  onStatus?: (status: RealtimeSubscriptionStatus) => void
}
type SubscriptionEntry = {
  channel: ReturnType<typeof supabase.channel>
  subscribers: Set<Subscriber>
  status?: RealtimeSubscriptionStatus
}

const subscriptions = new Map<string, SubscriptionEntry>()

export function subscribeToPostgresChanges(
  subscription: PostgresSubscription,
  onChange: () => void,
  onStatus?: (status: RealtimeSubscriptionStatus) => void,
) {
  const key = [subscription.topic, subscription.event, subscription.table, subscription.filter ?? ''].join(':')
  const subscriber = { onChange, onStatus }
  let entry = subscriptions.get(key)

  if (!entry) {
    const subscribers = new Set<Subscriber>([subscriber])
    const channel = supabase.channel(subscription.topic)
      .on('postgres_changes', {
        event: subscription.event,
        schema: 'public',
        table: subscription.table,
        ...(subscription.filter ? { filter: subscription.filter } : {}),
      }, () => {
        for (const current of subscribers) current.onChange()
      })
      .subscribe((status) => {
        const currentEntry = subscriptions.get(key)
        if (!currentEntry || currentEntry.channel !== channel) return
        currentEntry.status = status
        for (const current of currentEntry.subscribers) current.onStatus?.(status)
      })
    entry = { channel, subscribers }
    subscriptions.set(key, entry)
  } else {
    entry.subscribers.add(subscriber)
    if (entry.status) subscriber.onStatus?.(entry.status)
  }

  let active = true
  return () => {
    if (!active) return
    active = false
    entry?.subscribers.delete(subscriber)
    if (!entry || entry.subscribers.size) return

    queueMicrotask(() => {
      if (entry?.subscribers.size || subscriptions.get(key) !== entry) return
      subscriptions.delete(key)
      void supabase.removeChannel(entry.channel).then((status) => {
        if (status !== 'ok') {
          console.error(`Could not remove realtime channel ${subscription.topic}: ${status}.`)
        }
      }).catch((error: unknown) => {
        console.error(`Could not remove realtime channel ${subscription.topic}.`, error)
      })
    })
  }
}
