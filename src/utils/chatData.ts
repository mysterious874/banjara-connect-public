import { supabase } from './supabase'
import { requireAuthenticatedUserId } from './authenticatedUser'
import { loadBlockedUserIds } from './blockData'
import { createChatMediaUrl, createChatMediaUrls, deleteChatMedia, uploadChatMedia } from './chatMediaData'
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
  return {
    lastMessage: (latestRows?.[0] as ChatMessage | undefined) ?? null,
    incomingMessageIds: (incoming ?? []).map((row) => row.id as string),
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
  // Fetch all direct-chat summaries and unread counts in one RLS-protected RPC.
  // This replaces two message queries per conversation plus read-receipt batches.
  const [blockedIds, summariesResult] = await Promise.all([
    loadBlockedUserIds(),
    supabase.rpc('get_direct_conversation_summaries'),
  ])
  const { data: summaries, error: summariesError } = summariesResult
  if (summariesError) throw summariesError
  const blocked = new Set(blockedIds)
  const visible = (summaries ?? []).filter((row) => !blocked.has(row.peer_id as string))
  if (!visible.length) return []

  const peerIds = [...new Set(visible.map((row) => row.peer_id as string))]
  const { data: profiles, error: profilesError } = await supabase.from('profiles')
    .select('id,username,display_name,avatar_url').in('id', peerIds)
  if (profilesError) throw profilesError
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]))

  return visible.flatMap((row) => {
    const member = profileMap.get(row.peer_id as string)
    if (!member) return []
    return [{
      id: row.conversation_id as string,
      member,
      lastMessage: (row.last_message as ChatMessage | null) ?? null,
      unreadCount: Number(row.unread_count ?? 0),
    }]
  })
    .sort((left, right) => (right.lastMessage?.created_at ?? '').localeCompare(left.lastMessage?.created_at ?? ''))
}

async function loadConversationPeerId(conversationId: string, userId: string) {
  const { data: members, error } = await supabase.from('conversation_members')
    .select('user_id').eq('conversation_id', conversationId)
  if (error) throw error
  const memberIds = (members ?? []).map((member) => member.user_id as string)
  if (!memberIds.includes(userId)) throw new Error('You are not a member of this conversation.')
  const peerId = memberIds.find((memberId) => memberId !== userId)
  if (!peerId) throw new Error('Conversation member could not be found.')
  return peerId
}

async function fetchConversationMessagePage(
  conversationId: string,
  before?: Pick<ChatMessage, 'created_at' | 'id'>,
) {
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
  return (data ?? []) as ChatMessage[]
}

async function prepareConversationMessagePage(page: ChatMessage[], userId: string, peerId: string) {
  const hasMore = page.length === conversationMessagePageSize
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
  if (messages.length) {
    const outgoingIds = messages.filter((message) => message.sender_id === userId).map((message) => message.id)
    if (outgoingIds.length) {
      void supabase.from('message_reads').select('message_id')
        .eq('user_id', peerId).in('message_id', outgoingIds)
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
  return { messages, hasMore }
}

export async function loadConversationMessages(
  conversationId: string,
  before?: Pick<ChatMessage, 'created_at' | 'id'>,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const userId = await requireAuthenticatedUserId()
  const [peerId, page] = await Promise.all([
    loadConversationPeerId(conversationId, userId),
    fetchConversationMessagePage(conversationId, before),
  ])
  return prepareConversationMessagePage(page, userId, peerId)
}

export async function hydrateConversationMediaUrls(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const pendingMessages = messages.filter((message) => message.media_url && !message.media_signed_url)
  if (!pendingMessages.length) return messages

  const paths = [...new Set(pendingMessages.map((message) => message.media_url as string))]
  try {
    // Sign the whole visible page in one Storage request instead of one request
    // per attachment. This is especially important on high-latency mobile data.
    const signedByPath = await createChatMediaUrls(paths)
    for (const message of pendingMessages) {
      message.media_signed_url = signedByPath.get(message.media_url as string) ?? null
    }
  } catch (mediaError) {
    if (import.meta.env.DEV) console.error('Could not create chat media URLs.', mediaError)
    for (const message of pendingMessages) message.media_signed_url = null
  }
  return messages
}

async function loadConversationPeerProfile(peerId: string, userId: string) {
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

export async function loadConversation(conversationId: string) {
  const userId = await requireAuthenticatedUserId()
  const [peerId, page] = await Promise.all([
    loadConversationPeerId(conversationId, userId),
    fetchConversationMessagePage(conversationId),
  ])
  const [peer, history] = await Promise.all([
    loadConversationPeerProfile(peerId, userId),
    prepareConversationMessagePage(page, userId, peerId),
  ])
  return { peer, history }
}

export async function sendConversationMessage(conversationId: string, content: string, mediaFile?: File) {
  const normalized = content.trim()
  if (!normalized && !mediaFile) throw new Error('Message cannot be empty.')
  const senderId = await requireAuthenticatedUserId()

  // Upload before inserting the message so realtime never displays an empty
  // placeholder row that later changes into a media bubble.
  const messageId = crypto.randomUUID()
  let uploadedPath = ''
  try {
    let media: Awaited<ReturnType<typeof uploadChatMedia>> | null = null
    if (mediaFile) {
      media = await uploadChatMedia(mediaFile, senderId, conversationId, messageId)
      uploadedPath = media.path
    }

    const payload: Record<string, unknown> = {
      id: messageId,
      conversation_id: conversationId,
      sender_id: senderId,
      content: normalized,
    }
    if (media) {
      payload.media_url = media.path
      payload.media_type = media.type
    }

    const { data, error } = await supabase.from('messages').insert(payload)
      .select(messageColumns).single()
    if (error) throw error
    const created = data as ChatMessage
    if (media) {
      try {
        created.media_signed_url = await createChatMediaUrl(media.path)
      } catch (mediaUrlError) {
        if (import.meta.env.DEV) console.error('Could not create chat media URL after sending.', mediaUrlError)
        created.media_signed_url = null
      }
    }

    // Best-effort push runs in the background; it never blocks the UI.
    void supabase.functions.invoke('send-chat-push', { body: { message_id: created.id } }).catch(() => {})
    return created
  } catch (caught) {
    if (uploadedPath) {
      try {
        await deleteChatMedia([uploadedPath])
      } catch (cleanupError) {
        if (import.meta.env.DEV) console.error('Could not clean up failed chat media upload.', cleanupError)
      }
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