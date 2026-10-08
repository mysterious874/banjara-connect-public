import { supabase } from './supabase'
import { requireAuthenticatedUserId } from './authenticatedUser'
import type { ProfileRecord } from '../types/app'

export type NotificationRecord = {
  id: string
  user_id: string
  actor_id: string | null
  type: string
  post_id: string | null
  comment_id: string | null
  message_id: string | null
  group_id: string | null
  group_message_id: string | null
  group_join_request_id: string | null
  is_read: boolean
  created_at: string
  actor: Pick<ProfileRecord, 'username' | 'display_name' | 'avatar_url'> | null
}

export async function loadUnreadNotificationCount(): Promise<number> {
  const userId = await requireAuthenticatedUserId()
  const { count, error } = await supabase.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
     .eq('is_read', false)
    .neq('type', 'message')
  if (error) throw error
  return count ?? 0
}

export async function loadNotifications(): Promise<NotificationRecord[]> {
  const userId = await requireAuthenticatedUserId()
  const { data, error } = await supabase.from('notifications')
    .select('id,user_id,actor_id,type,post_id,comment_id,message_id,group_id,group_message_id,group_join_request_id,is_read,created_at')
    .eq('user_id', userId)
    .not('type', 'in', '(message,group_message)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  const notifications = data ?? []
  const actorIds = [...new Set(notifications.map((notification) => notification.actor_id).filter((id): id is string => Boolean(id)))]
  if (!actorIds.length) return notifications.map((notification) => ({ ...notification, actor: null })) as NotificationRecord[]
  const { data: actors, error: actorError } = await supabase.from('profiles')
    .select('id,username,display_name,avatar_url')
    .in('id', actorIds)
  if (actorError) throw actorError
  const actorsById = new Map((actors ?? []).map((actor) => [actor.id, actor]))
  return notifications.map((notification) => ({
    ...notification,
    actor: notification.actor_id ? actorsById.get(notification.actor_id) ?? null : null,
  })) as NotificationRecord[]
}

export async function markAllNotificationsRead() {
  const userId = await requireAuthenticatedUserId()
  const { error } = await supabase.from('notifications').update({ is_read: true })
    .eq('user_id', userId).eq('is_read', false)
  if (error) throw error
}

export async function markNotificationRead(notificationId: string) {
  const userId = await requireAuthenticatedUserId()
  const { error } = await supabase.from('notifications').update({ is_read: true })
    .eq('id', notificationId).eq('user_id', userId)
  if (error) throw error
}