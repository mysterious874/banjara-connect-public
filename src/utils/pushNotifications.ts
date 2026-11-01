import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = 'BOKRQvTFtfg4n13X-JoqffDlTHyuXiR10Wry7OLi4-XmSJU1Z2s3ooQEl_ul5nJApnp4Z04ndXNXk1tYS0612TQ'

export type PushNotificationStatus = 'checking' | 'enabled' | 'not-enabled' | 'blocked' | 'unsupported' | 'unknown'

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
  return data ? 'enabled' : 'not-enabled'
}

export async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false
  if (!VAPID_PUBLIC_KEY) return false

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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

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
  const endpoint = subscription.endpoint
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
  const unsubscribed = await subscription.unsubscribe()
  if (!unsubscribed) throw new Error('The browser could not disable this push subscription.')
}
