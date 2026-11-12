import { requireAuthenticatedUserId } from './authenticatedUser'
import { supabase } from './supabase'
import type { ChatReaction } from './chatData'

export async function editCommunityGroupMessage(messageId: string, content: string) {
  const { data, error } = await supabase.rpc('edit_community_group_message', {
    p_message_id: messageId,
    p_content: content,
  })
  if (error) throw error
  if (!data) throw new Error('This message can no longer be edited.')
  return data
}

export async function loadGroupMessageReactions(messageIds: string[]) {
  if (!messageIds.length) return new Map<string, Array<{ emoji: ChatReaction; user_id: string }>>()
  const { data, error } = await supabase.from('connect_group_message_reactions')
    .select('message_id,emoji,user_id').in('message_id', messageIds)
  if (error) throw error
  const results = new Map<string, Array<{ emoji: ChatReaction; user_id: string }>>()
  for (const row of data ?? []) {
    const current = results.get(row.message_id as string) ?? []
    current.push({ emoji: row.emoji as ChatReaction, user_id: row.user_id as string })
    results.set(row.message_id as string, current)
  }
  return results
}

export async function toggleGroupMessageReaction(messageId: string, emoji: ChatReaction) {
  const userId = await requireAuthenticatedUserId()
  const table = supabase.from('connect_group_message_reactions')
  const { data: existing, error: lookupError } = await table.select('id')
    .eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji).maybeSingle()
  if (lookupError) throw lookupError
  if (existing) {
    const { error } = await table.delete().eq('id', existing.id)
    if (error) throw error
    return false
  }
  const { error } = await table.insert({ message_id: messageId, user_id: userId, emoji })
  if (error && error.code !== '23505') throw error
  return true
}

export async function loadGroupMessagePins(messageIds: string[]) {
  const userId = await requireAuthenticatedUserId()
  if (!messageIds.length) return new Set<string>()
  const { data, error } = await supabase.from('connect_group_message_pins').select('message_id')
    .eq('user_id', userId).in('message_id', messageIds)
  if (error) throw error
  return new Set((data ?? []).map((row) => row.message_id as string))
}

export async function toggleGroupMessagePin(messageId: string) {
  const userId = await requireAuthenticatedUserId()
  const { data: existing, error: lookupError } = await supabase.from('connect_group_message_pins')
    .select('message_id').eq('user_id', userId).eq('message_id', messageId).maybeSingle()
  if (lookupError) throw lookupError
  if (existing) {
    const { error } = await supabase.from('connect_group_message_pins')
      .delete().eq('user_id', userId).eq('message_id', messageId)
    if (error) throw error
    return false
  }
  const { error } = await supabase.from('connect_group_message_pins').insert({ user_id: userId, message_id: messageId })
  if (error && error.code !== '23505') throw error
  return true
}

export async function loadGroupMemberReadReceipts(groupId: string) {
  const { data: receipts, error: receiptError } = await supabase.from('community_group_message_reads')
    .select('user_id,last_read_message_id').eq('group_id', groupId)
  if (receiptError) throw receiptError
  const lastReadIds = [...new Set((receipts ?? []).flatMap((row) => row.last_read_message_id ? [row.last_read_message_id as string] : []))]
  const { data: readMessages, error: messagesError } = lastReadIds.length
    ? await supabase.from('community_group_messages').select('id,created_at').in('id', lastReadIds)
    : { data: [], error: null }
  if (messagesError) throw messagesError
  const timeByMessage = new Map((readMessages ?? []).map((row) => [row.id as string, row.created_at as string]))
  return (receipts ?? []).map((row) => ({
    user_id: row.user_id as string,
    last_read_message_id: row.last_read_message_id as string | null,
    last_read_at: row.last_read_message_id ? timeByMessage.get(row.last_read_message_id as string) ?? null : null,
  }))
}
