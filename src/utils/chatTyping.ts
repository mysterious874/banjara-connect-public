import { requireAuthenticatedUserId } from './authenticatedUser'
import { supabase } from './supabase'
import { isTypingFresh } from './chatMessageFeatures'

export async function publishDirectTyping(conversationId: string, typing: boolean) {
  await requireAuthenticatedUserId()
  const { error } = await supabase.rpc('set_direct_chat_typing', {
    p_conversation_id: conversationId,
    p_typing: typing,
  })
  if (error) throw error
}

export async function loadDirectPeerTyping(conversationId: string, peerId: string) {
  const { data, error } = await supabase.from('connect_direct_chat_typing')
    .select('updated_at').eq('conversation_id', conversationId).eq('user_id', peerId).maybeSingle()
  if (error) throw error
  return Boolean(data && isTypingFresh(data.updated_at as string))
}

export async function publishGroupTyping(groupId: string, typing: boolean) {
  await requireAuthenticatedUserId()
  const { error } = await supabase.rpc('set_group_chat_typing', {
    p_group_id: groupId,
    p_typing: typing,
  })
  if (error) throw error
}

export async function loadGroupTyping(groupId: string) {
  const userId = await requireAuthenticatedUserId()
  const { data, error } = await supabase.from('connect_group_chat_typing')
    .select('user_id,updated_at').eq('group_id', groupId).neq('user_id', userId)
  if (error) throw error
  const now = Date.now()
  return (data ?? [])
    .filter((row) => isTypingFresh(row.updated_at as string, now))
    .map((row) => row.user_id as string)
}
