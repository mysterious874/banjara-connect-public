import { supabase } from './supabase'

export const BANJARA_CHAT_MEDIA_BUCKET = 'banjara-chat-media'
export const MAX_CHAT_MEDIA_SIZE = 50 * 1024 * 1024

const ALLOWED_CHAT_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
])

export type ChatMediaData = {
  path: string
  type: 'image' | 'video'
  mimeType: string
}

function extensionForChatMedia(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension && /^[a-z0-9]{1,8}$/.test(extension)) return extension
  const fallback: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  }
  return fallback[file.type] ?? 'bin'
}

export function validateChatMedia(file: File) {
  if (!ALLOWED_CHAT_MEDIA_TYPES.has(file.type)) {
    throw new Error('Only JPG, PNG, WEBP, GIF, MP4, WebM, and MOV files are supported.')
  }
  if (file.size > MAX_CHAT_MEDIA_SIZE) {
    throw new Error('Photo and video files must be 50 MB or smaller.')
  }
}

export async function uploadChatMedia(file: File, userId: string, conversationId: string, messageId: string): Promise<ChatMediaData> {
  validateChatMedia(file)
  const path = `${userId}/${conversationId}/${messageId}/${crypto.randomUUID()}.${extensionForChatMedia(file)}`
  const { error } = await supabase.storage.from(BANJARA_CHAT_MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  return {
    path,
    type: file.type.startsWith('video/') ? 'video' : 'image',
    mimeType: file.type,
  }
}

export async function createChatMediaUrl(path: string) {
  const { data, error } = await supabase.storage.from(BANJARA_CHAT_MEDIA_BUCKET).createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

export async function deleteChatMedia(paths: string[]) {
  if (!paths.length) return
  const { error } = await supabase.storage.from(BANJARA_CHAT_MEDIA_BUCKET).remove(paths)
  if (error) throw error
}
