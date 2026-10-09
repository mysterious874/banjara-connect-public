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
  readByPeer?: boolean
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
const conversationListCache = new Map<string, { expiresAt: number; value: ConversationSummary[] }>()
const conversationListRequests = new Map<string, Promise<ConversationSummary[]>>()
const CONVERSATION_LIST_CACHE_TTL_MS = 1500

export function invalidateConversationListCache() {
  conversationListCache.clear()
}

export async function getOrCreateConversation(targetUserId: string) {
  const userId = await requireAuthenticatedUserId()
  if (userId === targetUserId) throw new Error('You cannot start a conversation with yourself.')
  const requestKey = [userId, targetUserId].sort().join(':')
  const pendingRequest = pendingConversationRequests.get(requestKey)
  if (pendingRequest) return pendingRequest

  const request = createOrFindConversation(targetUserId).finally(() => {
    pendingConversationRequests.delete(requestKey)
  })
  pendingConversationRequests.set(requestKey, request)
  return request
}

async function createOrFindConversation(targetUserId: string) {
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
    p_target_user_id: targetUserId,
  })
  if (error) throw error
  if (!data) throw new Error('Could not create the conversation.')
  return data as string
}
async function loadConversationSummaryMessages(conversationId: string, userId: string) {
  // These reads are independent; run them together to avoid adding a network
  // round-trip for every conversation on the chat list.
  const [latestResult, incomingResult] = await Promise.all([
    supabase.from('messages').select(messageColumns)
      .eq('conversation_id', conversationId)
      .eq('is_deleted_for_everyone', false)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1),
    // Keep the list fast: only inspect the most recent incoming messages when
    // calculating the badge instead of walking the entire conversation history.
    supabase.from('messages').select('id')
      .eq('conversation_id', conversationId)
      .eq('is_deleted_for_everyone', false)
      .neq('sender_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
  ])
  const { data: latestRows, error: latestError } = latestResult
  const { data: incoming, error: incomingError } = incomingResult
  if (latestError) throw latestError
  if (incomingError) throw incomingError
  if (!incoming?.length) return { lastMessage: (latestRows?.[0] as ChatMessage | undefined) ?? null, unreadCount: 0 }

  const { data: reads, error: readsError } = await supabase.from('message_reads').select('message_id')
    .eq('user_id', userId).in('message_id', incoming.map((row) => row.id))
  if (readsError) throw readsError
  const readIds = new Set((reads ?? []).map((row) => row.message_id))
  return {
    lastMessage: (latestRows?.[0] as ChatMessage | undefined) ?? null,
    unreadCount: incoming.filter((row) => !readIds.has(row.id)).length,
  }
}

export async function loadUnreadChatCount(): Promise<number> {
  const conversations = await loadConversations()
  return conversations.reduce((total, conversation) => total + conversation.unreadCount, 0)
}

export async function loadConversations(): Promise<ConversationSummary[]> {
  const userId = await requireAuthenticatedUserId()
  const now = Date.now()
  const cached = conversationListCache.get(userId)
  if (cached && cached.expiresAt > now) return cached.value
  const pending = conversationListRequests.get(userId)
  if (pending) return pending
  const request = loadConversationsUncached(userId).then((value) => {
    conversationListCache.set(userId, { expiresAt: Date.now() + CONVERSATION_LIST_CACHE_TTL_MS, value })
    return value
  }).finally(() => conversationListRequests.delete(userId))
  conversationListRequests.set(userId, request)
  return request
}

async function loadConversationsUncached(userId: string): Promise<ConversationSummary[]> {
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

  // Conversation summaries and profile cards are independent; avoid making
  // the user wait for every summary before starting the profile query.
  const [summaryMessages, profilesResult] = await Promise.all([
    Promise.all(visibleConversationIds.map((id) => loadConversationSummaryMessages(id, userId))),
    supabase.from('profiles')
      .select('id,username,display_name,avatar_url').in('id', otherUserIds),
  ])
  const { data: profiles, error: profilesError } = profilesResult
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
  let query = supabase.from('messages').select(messageColumns)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(conversationMessagePageSize)
  if (before) {
    query = query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`)
  }
  const [
    { data: membership, error: membershipError },
    { data, error },
    { data: peerMember, error: peerMemberError },
  ] = await Promise.all([
    supabase.from('conversation_members').select('conversation_id').eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle(),
    query,
    supabase.from('conversation_members').select('user_id').eq('conversation_id', conversationId).neq('user_id', userId).maybeSingle(),
  ])
  if (membershipError) throw membershipError
  if (!membership) throw new Error('You are not a member of this conversation.')
  if (error) throw error
  if (peerMemberError) throw peerMemberError
  let page = (data ?? []) as ChatMessage[]
  if (page.length) {
    const ids = page.map((message) => message.id)
    const { data: hidden, error: hiddenError } = await supabase.from('message_deletions').select('message_id').eq('user_id', userId).in('message_id', ids)
    if (hiddenError) throw hiddenError
    const hiddenIds = new Set((hidden ?? []).map((row) => row.message_id as string))
    page = page.filter((message) => !hiddenIds.has(message.id))
  }
  const messages = page.reverse()
  // Read receipts and media URL signing should not delay the text conversation
  // from opening. Both are best-effort follow-up work and realtime refreshes will
  // reconcile read status after the chat is already visible.
  if (peerMember?.user_id && messages.length) {
    const outgoingIds = messages.filter((message) => message.sender_id === userId).map((message) => message.id)
    if (outgoingIds.length) {
      void supabase.from('message_reads').select('message_id')
        .eq('user_id', peerMember.user_id).in('message_id', outgoingIds)
        .then(({ data: peerReads, error: peerReadError }) => {
          if (peerReadError) {
            if (import.meta.env.DEV) console.error('Could not load peer read receipts.', peerReadError)
            return
          }
          const readSet = new Set((peerReads ?? []).map((row) => row.message_id as string))
          for (const message of messages) message.readByPeer = readSet.has(message.id)
        })
    }
  }
  const mediaMessages = messages.filter((message) => message.media_url)
  void Promise.all(mediaMessages.map(async (chatMessage) => {
    try {
      chatMessage.media_signed_url = await createChatMediaUrl(chatMessage.media_url!)
    } catch (mediaError) {
      if (import.meta.env.DEV) console.error('Could not create chat media URL.', mediaError)
      chatMessage.media_signed_url = null
    }
  }))
  const unreadIds = messages.filter((message) => message.sender_id !== userId).map((message) => message.id)
  if (unreadIds.length) {
    void (async () => {
      try {
        const { data: existingReads, error: readError } = await supabase.from('message_reads').select('message_id')
          .eq('user_id', userId).in('message_id', unreadIds)
        if (readError) throw readError
        const readSet = new Set((existingReads ?? []).map((read) => read.message_id))
        const newReads = unreadIds.filter((id) => !readSet.has(id)).map((message_id) => ({ message_id, user_id: userId }))
        if (newReads.length) {
          const { error: insertError } = await supabase.from('message_reads').insert(newReads.map((read) => ({ ...read, read_at: new Date().toISOString() })))
          if (insertError && insertError.code !== '23505') throw insertError
        }
      } catch (readError) {
        if (import.meta.env.DEV) console.error('Could not mark chat messages as read.', readError)
      }
    })()
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

  // Fire-and-forget server push. The Edge Function authenticates the sender,
  // finds the other conversation member, and sends to their registered devices.
  void supabase.functions.invoke('send-chat-push', {
    body: { message_id: created.id },
  }).catch(() => {})

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