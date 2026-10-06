import { supabase } from './supabase'
import { requireAuthenticatedUserId } from './authenticatedUser'
import { loadBlockedUserIds } from './blockData'
import { createChatMediaUrl, deleteChatMedia, uploadChatMedia } from './chatMediaData'
import type { ProfileRecord } from '../types/app'
import { subscribeToPostgresChanges, type RealtimeSubscriptionStatus } from './realtimeData'

export type ChatMessage = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  media_url: string | null
  media_type: string | null
  media_signed_url?: string | null
  is_deleted_for_everyone: boolean
  created_at: string
  updated_at: string
}

export type ConversationSummary = {
  id: string
  member: Pick<ProfileRecord, 'id' | 'username' | 'display_name' | 'avatar_url'>
  lastMessage: ChatMessage | null
  unreadCount: number
}

const messageColumns = 'id,conversation_id,sender_id,content,media_url,media_type,is_deleted_for_everyone,created_at,updated_at'
const pendingConversationRequests = new Map<string, Promise<string>>()
const conversationMessagePageSize = 50

export async function getOrCreateConversation(targetUserId: string) {
  const userId = await requireAuthenticatedUserId()
  if (userId === targetUserId) throw new Error('You cannot start a conversation with yourself.')
  const requestKey = [userId, targetUserId].sort().join(':')
  const pendingRequest = pendingConversationRequests.get(requestKey)
  if (pendingRequest) return pendingRequest

  const request = createOrFindConversation(userId, targetUserId).finally(() => {
    pendingConversationRequests.delete(requestKey)
  })
  pendingConversationRequests.set(requestKey, request)
  return request
}

async function createOrFindConversation(userId: string, targetUserId: string) {
  const [{ data: outgoingBlock, error: outgoingBlockError }, { data: incomingBlock, error: incomingBlockError }] = await Promise.all([
    supabase.from('blocks').select('blocker_id').eq('blocker_id', userId).eq('blocked_id', targetUserId).maybeSingle(),
    supabase.from('blocks').select('blocker_id').eq('blocker_id', targetUserId).eq('blocked_id', userId).maybeSingle(),
  ])
  if (outgoingBlockError) throw outgoingBlockError
  if (incomingBlockError) throw incomingBlockError
  if (outgoingBlock || incomingBlock) throw new Error('Messaging is unavailable for this profile.')

  const { data: ownMemberships, error: membershipError } = await supabase.from('conversation_members')
    .select('conversation_id').eq('user_id', userId)
  if (membershipError) throw membershipError
  const conversationIds = [...new Set((ownMemberships ?? []).map((row) => row.conversation_id as string))]
  if (conversationIds.length) {
    const { data: members, error } = await supabase.from('conversation_members')
      .select('conversation_id,user_id').in('conversation_id', conversationIds)
    if (error) throw error
    const memberMap = new Map<string, string[]>()
    for (const member of members ?? []) {
      const current = memberMap.get(member.conversation_id) ?? []
      current.push(member.user_id)
      memberMap.set(member.conversation_id, current)
    }
    const existing = conversationIds.find((id) => {
      const ids = memberMap.get(id) ?? []
      return ids.length === 2 && ids.includes(userId) && ids.includes(targetUserId)
    })
    if (existing) return existing
  }

  const { data: conversation, error: conversationError } = await supabase.from('conversations')
    .insert({ created_by: userId }).select('id').single()
  if (conversationError) throw conversationError

  const { error: createMembersError } = await supabase.from('conversation_members').insert([
    { conversation_id: conversation.id, user_id: userId },
    { conversation_id: conversation.id, user_id: targetUserId },
  ])
  if (createMembersError) {
    const { error: cleanupError } = await supabase.from('conversations').delete()
      .eq('id', conversation.id).eq('created_by', userId)
    if (cleanupError) {
      if (import.meta.env.DEV) {
        console.error('Conversation setup and cleanup failed.', {
          memberErrorCode: createMembersError.code,
          cleanupErrorCode: cleanupError.code,
        })
      }
      throw new Error('Could not finish creating the conversation. Please try again.')
    }
    throw createMembersError
  }
  return conversation.id as string
}

async function loadConversationSummaryMessages(conversationId: string, userId: string) {
  const pageSize = 500
  let offset = 0
  let lastMessage: ChatMessage | null = null
  let unreadCount = 0

  while (true) {
    const { data, error } = await supabase.from('messages').select(messageColumns)
      .eq('conversation_id', conversationId)
      .eq('is_deleted_for_everyone', false)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    let page = (data ?? []) as ChatMessage[]
    if (page.length) {
      const ids = page.map((message) => message.id)
      const { data: hidden, error: hiddenError } = await supabase.from('message_deletions').select('message_id').eq('user_id', userId).in('message_id', ids)
      if (hiddenError) throw hiddenError
      const hiddenIds = new Set((hidden ?? []).map((row) => row.message_id as string))
      page = page.filter((message) => !hiddenIds.has(message.id))
    }
    if (offset === 0) lastMessage = page[0] ?? null

    const incomingIds = page.filter((message) => message.sender_id !== userId).map((message) => message.id)
    if (incomingIds.length) {
      const { data: readRows, error: readsError } = await supabase.from('message_reads')
        .select('message_id').eq('user_id', userId).in('message_id', incomingIds)
      if (readsError) throw readsError
      const readIds = new Set((readRows ?? []).map((row) => row.message_id))
      unreadCount += incomingIds.filter((id) => !readIds.has(id)).length
    }

    if (page.length < pageSize) break
    offset += pageSize
  }

  return { lastMessage, unreadCount }
}

export async function loadUnreadChatCount(): Promise<number> {
  const conversations = await loadConversations()
  return conversations.reduce((total, conversation) => total + conversation.unreadCount, 0)
}

export async function loadConversations(): Promise<ConversationSummary[]> {
  const userId = await requireAuthenticatedUserId()
  const { data: ownMemberships, error: membershipError } = await supabase.from('conversation_members')
    .select('conversation_id').eq('user_id', userId)
  if (membershipError) throw membershipError
  const conversationIds = [...new Set((ownMemberships ?? []).map((row) => row.conversation_id as string))]
  if (!conversationIds.length) return []

  const { data: members, error: membersError } = await supabase.from('conversation_members')
    .select('conversation_id,user_id').in('conversation_id', conversationIds)
  if (membersError) throw membersError

  const otherUsers = new Map<string, string>()
  for (const member of members ?? []) {
    if (member.user_id !== userId && conversationIds.includes(member.conversation_id)) otherUsers.set(member.conversation_id, member.user_id)
  }
  const blockedIds = new Set(await loadBlockedUserIds())
  for (const [conversationId, peerId] of otherUsers) {
    if (blockedIds.has(peerId)) otherUsers.delete(conversationId)
  }
  const visibleConversationIds = conversationIds.filter((id) => otherUsers.has(id))
  if (!visibleConversationIds.length) return []
  const otherUserIds = [...new Set(otherUsers.values())]
  if (!otherUserIds.length) return []

  const summaryMessages: Array<{ lastMessage: ChatMessage | null; unreadCount: number }> = []
  for (let offset = 0; offset < visibleConversationIds.length; offset += 5) {
    const batch = await Promise.all(visibleConversationIds.slice(offset, offset + 5)
      .map((id) => loadConversationSummaryMessages(id, userId)))
    summaryMessages.push(...batch)
  }
  const { data: profiles, error: profilesError } = await supabase.from('profiles')
    .select('id,username,display_name,avatar_url').in('id', otherUserIds)
  if (profilesError) throw profilesError

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  return visibleConversationIds.flatMap((id, index) => {
    const memberId = otherUsers.get(id)
    const member = memberId ? profileMap.get(memberId) : undefined
    if (!member) return []
    return [{ id, member, ...summaryMessages[index] }]
  }).sort((left, right) => (right.lastMessage?.created_at ?? '').localeCompare(left.lastMessage?.created_at ?? ''))
}

export async function loadConversationMessages(
  conversationId: string,
  before?: Pick<ChatMessage, 'created_at' | 'id'>,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const userId = await requireAuthenticatedUserId()
  const { data: membership, error: membershipError } = await supabase.from('conversation_members')
    .select('conversation_id').eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) throw new Error('You are not a member of this conversation.')

  let query = supabase.from('messages').select(messageColumns)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(conversationMessagePageSize)
  if (before) {
    query = query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`)
  }
  const { data, error } = await query
  if (error) throw error
  let page = (data ?? []) as ChatMessage[]
  if (page.length) {
    const ids = page.map((message) => message.id)
    const { data: hidden, error: hiddenError } = await supabase.from('message_deletions').select('message_id').eq('user_id', userId).in('message_id', ids)
    if (hiddenError) throw hiddenError
    const hiddenIds = new Set((hidden ?? []).map((row) => row.message_id as string))
    page = page.filter((message) => !hiddenIds.has(message.id))
  }
  const messages = page.reverse()
  for (const chatMessage of messages) {
    if (chatMessage.media_url) {
      try {
        chatMessage.media_signed_url = await createChatMediaUrl(chatMessage.media_url)
      } catch (mediaError) {
        if (import.meta.env.DEV) console.error('Could not create chat media URL.', mediaError)
        chatMessage.media_signed_url = null
      }
    }
  }
  const unreadIds = messages.filter((message) => message.sender_id !== userId).map((message) => message.id)
  if (unreadIds.length) {
    const { data: existingReads, error: readError } = await supabase.from('message_reads').select('message_id')
      .eq('user_id', userId).in('message_id', unreadIds)
    if (readError) throw readError
    const readSet = new Set((existingReads ?? []).map((read) => read.message_id))
    const newReads = unreadIds.filter((id) => !readSet.has(id)).map((message_id) => ({ message_id, user_id: userId }))
    if (newReads.length) {
      const { error: insertError } = await supabase.from('message_reads').insert(newReads.map((read) => ({ ...read, read_at: new Date().toISOString() })))
      if (insertError && insertError.code !== '23505') throw insertError
    }
  }
  return { messages, hasMore: page.length === conversationMessagePageSize }
}

export async function loadConversationPeer(conversationId: string) {
  const userId = await requireAuthenticatedUserId()
  const { data: ownMembership, error: ownError } = await supabase.from('conversation_members')
    .select('conversation_id').eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle()
  if (ownError) throw ownError
  if (!ownMembership) throw new Error('You are not a member of this conversation.')
  const { data: members, error: membersError } = await supabase.from('conversation_members')
    .select('user_id').eq('conversation_id', conversationId).neq('user_id', userId)
  if (membersError) throw membersError
  const peerId = members?.[0]?.user_id
  if (!peerId) throw new Error('Conversation member could not be found.')
  const [{ data: outgoingBlock, error: outgoingBlockError }, { data: incomingBlock, error: incomingBlockError }] = await Promise.all([
    supabase.from('blocks').select('blocker_id').eq('blocker_id', userId).eq('blocked_id', peerId).maybeSingle(),
    supabase.from('blocks').select('blocker_id').eq('blocker_id', peerId).eq('blocked_id', userId).maybeSingle(),
  ])
  if (outgoingBlockError) throw outgoingBlockError
  if (incomingBlockError) throw incomingBlockError
  if (outgoingBlock || incomingBlock) throw new Error('Messaging is unavailable for this profile.')
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('id,username,display_name,avatar_url').eq('id', peerId).maybeSingle()
  if (profileError) throw profileError
  if (!profile) throw new Error('Conversation profile is unavailable.')
  return profile
}

export async function sendConversationMessage(conversationId: string, content: string, mediaFile?: File) {
  const normalized = content.trim()
  if (!normalized && !mediaFile) throw new Error('Message cannot be empty.')
  const senderId = await requireAuthenticatedUserId()
  const { data: membership, error: membershipError } = await supabase.from('conversation_members')
    .select('conversation_id').eq('conversation_id', conversationId).eq('user_id', senderId).maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) throw new Error('You are not a member of this conversation.')

  const { data, error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content: normalized,
  }).select(messageColumns).single()
  if (error) throw error
  const created = data as ChatMessage
  if (!mediaFile) return created

  let uploadedPath = ''
  try {
    const media = await uploadChatMedia(mediaFile, senderId, conversationId, created.id)
    uploadedPath = media.path
    const { error: updateError, data: updated } = await supabase.from('messages').update({
      media_url: media.path,
      media_type: media.type,
      updated_at: new Date().toISOString(),
    }).eq('id', created.id).eq('sender_id', senderId).select(messageColumns).single()
    if (updateError) throw updateError
    const result = updated as ChatMessage
    result.media_signed_url = await createChatMediaUrl(media.path)
    return result
  } catch (caught) {
    if (uploadedPath) {
      try {
        await deleteChatMedia([uploadedPath])
      } catch (cleanupError) {
        if (import.meta.env.DEV) console.error('Could not clean up failed chat media upload.', cleanupError)
      }
    }
    try {
      await supabase.from('messages').delete().eq('id', created.id).eq('sender_id', senderId)
    } catch (cleanupError) {
      if (import.meta.env.DEV) console.error('Could not clean up failed chat media message.', cleanupError)
    }
    throw caught
  }
}

export async function deleteMessageForMe(messageId: string) {
  const userId = await requireAuthenticatedUserId()
  const { data: membership, error: membershipError } = await supabase.from('messages').select('id,conversation_id').eq('id', messageId).maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) throw new Error('Message not found.')
  const { data: member, error: memberError } = await supabase.from('conversation_members').select('conversation_id').eq('conversation_id', membership.conversation_id).eq('user_id', userId).maybeSingle()
  if (memberError) throw memberError
  if (!member) throw new Error('You are not a member of this conversation.')
  const { error } = await supabase.from('message_deletions').upsert({ message_id: messageId, user_id: userId }, { onConflict: 'message_id,user_id' })
  if (error) throw error
}

export async function deleteMessageForEveryone(messageId: string) {
  const userId = await requireAuthenticatedUserId()
  const { data: existing, error: existingError } = await supabase.from('messages')
    .select('id,media_url').eq('id', messageId).eq('sender_id', userId).maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw new Error('Only the sender can delete this message for everyone.')

  const { data, error } = await supabase.from('messages').update({
    is_deleted_for_everyone: true,
    content: '',
    media_url: null,
    media_type: null,
    updated_at: new Date().toISOString(),
  }).eq('id', messageId).eq('sender_id', userId).select(messageColumns).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Only the sender can delete this message for everyone.')

  if (existing.media_url) {
    try {
      await deleteChatMedia([existing.media_url])
    } catch (mediaError) {
      if (import.meta.env.DEV) console.error('Could not delete chat media object.', mediaError)
    }
  }
  return data as ChatMessage
}

export function subscribeToConversation(
  conversationId: string,
  onMessage: () => void,
  onStatus?: (status: RealtimeSubscriptionStatus) => void,
) {
  return subscribeToPostgresChanges({
    topic: `conversation:${conversationId}`,
    event: '*',
    table: 'messages',
    filter: `conversation_id=eq.${conversationId}`,
  }, onMessage, onStatus)
}