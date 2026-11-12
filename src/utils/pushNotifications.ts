import { supabase } from './supabase'
import { runBestEffortPush } from './pushNotificationUrl'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BOKRQvTFtfg4n13X-JoqffDlTHyuXiR10Wry7OLi4-XmSJU1Z2s3ooQEl_ul5nJApnp4Z04ndXNXk1tYS0612TQ'

export type PushNotificationStatus = 'checking' | 'enabled' | 'server-error' | 'not-enabled' | 'blocked' | 'unsupported' | 'unknown'

export type PushEventRequest =
  | { message_id: string }
  | { group_message_id: string }
  | { event_type: 'post_like'; post_id: string }
  | { comment_id: string }
  | { event_type: 'follow'; followed_user_id: string }
  | { event_type: 'story_like'; story_id: string; notification_id: string }
  | { event_type: 'group_join_request' | 'group_join_request_result'; group_join_request_id: string }
  | { event_type: 'group_member_added' | 'group_role_changed' | 'group_member_removed'; group_id: string; target_user_id: string }

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export async function getPushNotificationStatus(): Promise<PushNotificationStatus> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  if (Notification.permission !== 'granted') return 'not-enabled'

  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return 'not-enabled'

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return 'not-enabled'

  const { data, error } = await supabase.from('push_subscriptions').select('endpoint')
    .eq('user_id', user.id).eq('endpoint', subscription.endpoint).maybeSingle()
  if (error) throw error
  if (!data) return 'not-enabled'

  try {
    const { error: serverError } = await supabase.functions.invoke('send-chat-push', {
      body: { health_check: true, vapid_public_key: VAPID_PUBLIC_KEY },
    })
    if (serverError) return 'server-error'
  } catch (error) {
    console.error('Could not verify push delivery service.', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return 'server-error'
  }
  return 'enabled'
}

export async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false
  if (!VAPID_PUBLIC_KEY) return false

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('You must be signed in to enable phone notifications.')

  const registration = await navigator.serviceWorker.ready
  let permission = Notification.permission
  if (permission === 'default') permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const payload = subscription.toJSON()
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) return false

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: payload.endpoint,
    subscription: payload,
    user_agent: navigator.userAgent,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })

  if (error) throw error
  return true
}

export async function unregisterPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('You must be signed in to disable phone notifications.')

  const endpoint = subscription.endpoint
  let databaseError: unknown
  try {
    const { error } = await supabase.from('push_subscriptions').delete()
      .eq('user_id', user.id).eq('endpoint', endpoint)
    if (error) databaseError = error
  } catch (error) {
    databaseError = error
  }
  const unsubscribed = await subscription.unsubscribe()
  if (!unsubscribed) throw new Error('The browser could not disable this push subscription.')
  if (databaseError instanceof Error) throw databaseError
  if (databaseError) throw new Error('The device subscription was removed locally but not from the server.')
}

async function sendPushWithRetry(body: PushEventRequest) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await supabase.functions.invoke('send-chat-push', { body })
      if (error) {
        const context = typeof error === 'object' && error !== null && 'context' in error ? error.context : null
        const retryable = !(context instanceof Response) || context.status >= 500 || context.status === 429
        if (attempt === 0 && retryable) {
          await new Promise((resolve) => window.setTimeout(resolve, 350))
          continue
        }
        console.error('Push notification delivery failed.', { errorType: error.name })
        return
      }

      const failedCount = typeof data === 'object' && data !== null && 'failed' in data &&
        typeof data.failed === 'number' ? data.failed : 0
      if (failedCount > 0 && attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 350))
        continue
      }
      if (failedCount > 0) console.error('Some push notifications could not be delivered.', { failedCount })
      return
    } catch (error) {
      if (attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 350))
        continue
      }
      console.error('Push notification delivery failed.', {
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
    }
  }
}

function sendPush(body: PushEventRequest) {
  void runBestEffortPush(
    () => sendPushWithRetry(body),
    (error) => console.error('Push notification delivery failed.', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }),
  )
}

export function sendChatPushNotification(messageId: string) {
  return sendPush({ message_id: messageId })
}

export function sendGroupPushNotification(messageId: string) {
  return sendPush({ group_message_id: messageId })
}

export function sendActivityPushNotification(body: Exclude<PushEventRequest, { message_id: string } | { group_message_id: string }>) {
  return sendPush(body)
}
