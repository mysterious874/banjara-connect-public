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
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryAttempt = 0
  let stopped = false

  const connect = () => {
    if (stopped) return
    const subscribers = entry?.subscribers ?? new Set<Subscriber>([subscriber])
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
        if (!currentEntry || currentEntry.channel !== channel || stopped) return
        currentEntry.status = status
        if (status === 'SUBSCRIBED') {
          retryAttempt = 0
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          if (retryTimer === null && !stopped) {
            const delay = Math.min(1000 * 2 ** retryAttempt, 15000)
            retryAttempt += 1
            retryTimer = setTimeout(() => {
              retryTimer = null
              if (stopped) return
              if (subscriptions.get(key)?.channel === channel) {
                subscriptions.delete(key)
                void supabase.removeChannel(channel).catch(() => undefined)
              }
              connect()
            }, delay)
          }
        }
        if (status !== 'CLOSED') {
          for (const current of currentEntry.subscribers) current.onStatus?.(status)
        }
      })
    entry = { channel, subscribers }
    subscriptions.set(key, entry)
  }

  if (!entry) {
    entry = { channel: supabase.channel(subscription.topic), subscribers: new Set<Subscriber>([subscriber]) }
    subscriptions.set(key, entry)
    void supabase.removeChannel(entry.channel).catch(() => undefined)
    connect()
  } else {
    entry.subscribers.add(subscriber)
    if (entry.status) subscriber.onStatus?.(entry.status)
  }

  let active = true
  return () => {
    if (!active) return
    active = false
    stopped = true
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    entry?.subscribers.delete(subscriber)
    if (!entry || entry.subscribers.size) return

    queueMicrotask(() => {
      const currentEntry = entry
      if (!currentEntry || currentEntry.subscribers.size || subscriptions.get(key) !== currentEntry) return
      subscriptions.delete(key)
      void supabase.removeChannel(currentEntry.channel).catch((error: unknown) => {
        console.error(`Could not remove realtime channel ${subscription.topic}.`, error)
      })
    })
  }
}
