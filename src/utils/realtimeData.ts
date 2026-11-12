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
  channel: ReturnType<typeof supabase.channel> | null
  subscribers: Set<Subscriber>
  status?: RealtimeSubscriptionStatus
  retryTimer: ReturnType<typeof setTimeout> | null
  retryAttempt: number
  stopped: boolean
}

const subscriptions = new Map<string, SubscriptionEntry>()

function connect(key: string, subscription: PostgresSubscription, entry: SubscriptionEntry) {
  if (entry.stopped || entry.subscribers.size === 0) return

  const channel = supabase.channel(subscription.topic)
  entry.channel = channel
  channel
    .on('postgres_changes', {
      event: subscription.event,
      schema: 'public',
      table: subscription.table,
      ...(subscription.filter ? { filter: subscription.filter } : {}),
    }, () => {
      if (subscriptions.get(key) !== entry || entry.channel !== channel || entry.stopped) return
      for (const subscriber of entry.subscribers) subscriber.onChange()
    })
    .subscribe((status) => {
      if (subscriptions.get(key) !== entry || entry.channel !== channel || entry.stopped) return
      entry.status = status

      if (status === 'SUBSCRIBED') {
        entry.retryAttempt = 0
        if (entry.retryTimer !== null) {
          clearTimeout(entry.retryTimer)
          entry.retryTimer = null
        }
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        if (entry.retryTimer === null) {
          const delay = Math.min(1000 * 2 ** entry.retryAttempt, 15000)
          entry.retryAttempt += 1
          entry.retryTimer = setTimeout(() => {
            entry.retryTimer = null
            if (subscriptions.get(key) !== entry || entry.channel !== channel || entry.stopped) return
            void (async () => {
              try {
                const removalStatus = await supabase.removeChannel(channel)
                if (removalStatus !== 'ok') {
                  console.error(`Could not cleanly replace realtime channel ${subscription.topic}.`, removalStatus)
                }
              } catch (error) {
                console.error(`Could not remove failed realtime channel ${subscription.topic}.`, error)
              }
              if (subscriptions.get(key) !== entry || entry.channel !== channel || entry.stopped) return
              entry.channel = null
              entry.status = undefined
              connect(key, subscription, entry)
            })()
          }, delay)
        }
      }

      if (status !== 'CLOSED') {
        for (const subscriber of entry.subscribers) subscriber.onStatus?.(status)
      }
    })
}

export function subscribeToPostgresChanges(
  subscription: PostgresSubscription,
  onChange: () => void,
  onStatus?: (status: RealtimeSubscriptionStatus) => void,
) {
  const key = [subscription.topic, subscription.event, subscription.table, subscription.filter ?? ''].join(':')
  const subscriber = { onChange, onStatus }
  let entry = subscriptions.get(key)

  if (!entry) {
    entry = {
      channel: null,
      subscribers: new Set(),
      retryTimer: null,
      retryAttempt: 0,
      stopped: false,
    }
    subscriptions.set(key, entry)
  }
  entry.subscribers.add(subscriber)
  if (entry.status) subscriber.onStatus?.(entry.status)
  if (!entry.channel && entry.retryTimer === null) connect(key, subscription, entry)

  let active = true
  return () => {
    if (!active) return
    active = false
    entry?.subscribers.delete(subscriber)
    if (!entry || entry.subscribers.size) return

    queueMicrotask(() => {
      const currentEntry = entry
      if (!currentEntry || currentEntry.subscribers.size || subscriptions.get(key) !== currentEntry) return
      currentEntry.stopped = true
      if (currentEntry.retryTimer !== null) {
        clearTimeout(currentEntry.retryTimer)
        currentEntry.retryTimer = null
      }
      subscriptions.delete(key)
      const channel = currentEntry.channel
      currentEntry.channel = null
      if (!channel) return
      void supabase.removeChannel(channel).then((status) => {
        if (status !== 'ok') console.error(`Could not remove realtime channel ${subscription.topic}.`, status)
      }).catch((error: unknown) => {
        console.error(`Could not remove realtime channel ${subscription.topic}.`, error)
      })
    })
  }
}
