export type SearchableChatMessage = {
  content: string
  media_type?: string | null
}

export function getChatSearchIndexes(messages: SearchableChatMessage[], query: string) {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return []
  return messages.flatMap((message, index) =>
    `${message.content} ${message.media_type ?? ''}`.toLocaleLowerCase().includes(normalized) ? [index] : [],
  )
}

export function canEditChatMessage(message: {
  sender_id: string
  content: string
  is_deleted_for_everyone: boolean
}, currentUserId: string | undefined) {
  return Boolean(currentUserId && message.sender_id === currentUserId && message.content && !message.is_deleted_for_everyone)
}

export function chatReplyPreview(content: string, mediaType?: string | null) {
  const trimmed = content.trim()
  if (trimmed) return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed
  return mediaType ? `${mediaType[0].toUpperCase()}${mediaType.slice(1)} message` : 'Message unavailable'
}

export function isTypingFresh(updatedAt: string, now = Date.now(), freshnessMs = 6000) {
  const timestamp = Date.parse(updatedAt)
  return Number.isFinite(timestamp) && now >= timestamp && now - timestamp < freshnessMs
}

export function isMessageReadByReceipt(
  message: { id: string; created_at: string },
  receipt: { last_read_message_id: string | null; last_read_at: string | null },
) {
  if (!receipt.last_read_at) return false
  const readAt = Date.parse(receipt.last_read_at)
  const messageAt = Date.parse(message.created_at)
  if (!Number.isFinite(readAt) || !Number.isFinite(messageAt)) return false
  return readAt > messageAt || receipt.last_read_message_id === message.id
}

export function isAudioMediaPath(path: string | null | undefined) {
  return Boolean(path && /\.(aac|m4a|mp3|ogg|wav|webm)$/i.test(path.split('?')[0]))
}
