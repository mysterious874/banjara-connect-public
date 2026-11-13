import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = 'BITSr08gNEQ0VOy_wwklF8Z2OBA1v2jNCelJAusx7jmj4Ke1d19uCec5i-FLxrErz2snmyN3zbFKrORtPIGEOfM'

export type PushNotificationStatus = 'checking' | 'enabled' | 'not-enabled' | 'blocked' | 'unsupported' | 'service-unavailable' | 'unknown'

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
  const { data: health, error: healthError } = await supabase.functions.invoke('send-chat-push', {
    body: { health_check: true, vapid_public_key: VAPID_PUBLIC_KEY },
  })
  if (healthError || health?.ready !== true) return 'service-unavailable'
  return 'enabled'
}

export async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false
  if (!VAPID_PUBLIC_KEY) return false

  const registration = await navigator.serviceWorker.ready
  let permission = Notification.permission
  if (permission === 'default') permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return false

  const expectedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  let subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    const existingKey = subscription.options.applicationServerKey
    const existingBytes = existingKey ? new Uint8Array(existingKey) : null
    const keyMatches = Boolean(existingBytes && existingBytes.length === expectedKey.length &&
      expectedKey.every((byte, index) => byte === existingBytes[index]))
    if (!keyMatches) {
      const oldEndpoint = subscription.endpoint
      await subscription.unsubscribe()
      const { error: removeError } = await supabase.from('push_subscriptions').delete().eq('endpoint', oldEndpoint)
      if (removeError) throw removeError
      subscription = null
    }
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: expectedKey,
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
  const endpoint = subscription.endpoint
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
  const unsubscribed = await subscription.unsubscribe()
  if (!unsubscribed) throw new Error('The browser could not disable this push subscription.')
}


export async function sendPushEvent(body: Record<string, string>) {
  try {
    const { error } = await supabase.functions.invoke('send-chat-push', { body })
    if (error) throw error
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Background push delivery could not be requested.', error)
  }
}

export async function sendActivityPushNotification(body: {
  event_type: 'story_like'
  story_id: string
  notification_id: string
}) {
  await sendPushEvent(body)
}
