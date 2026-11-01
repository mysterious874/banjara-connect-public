import { supabase } from './supabase'
import { prepareImageForUpload } from './imageUpload'
import { uploadStorageFile } from './storageUpload'

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
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

export type ChatMediaData = {
  path: string
  type: 'image' | 'video' | 'document'
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
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/zip': 'zip',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  }
  return fallback[file.type] ?? 'bin'
}

export function validateChatMedia(file: File) {
  if (!ALLOWED_CHAT_MEDIA_TYPES.has(file.type)) {
    throw new Error('Photos, videos, PDF and common document files are supported.')
  }
  if (file.size > MAX_CHAT_MEDIA_SIZE) {
    throw new Error('Photo and video files must be 50 MB or smaller.')
  }
}

export async function uploadChatMedia(file: File, userId: string, conversationId: string, messageId: string): Promise<ChatMediaData> {
  validateChatMedia(file)
  const uploadFile = await prepareImageForUpload(file)
  const path = `${userId}/${conversationId}/${messageId}/${crypto.randomUUID()}.${extensionForChatMedia(uploadFile)}`
  await uploadStorageFile(BANJARA_CHAT_MEDIA_BUCKET, path, uploadFile)
  return {
    path,
    type: file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : 'document',
    mimeType: uploadFile.type,
  }
}

export async function createChatMediaUrls(paths: string[]) {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  if (!uniquePaths.length) return new Map<string, string>()
  const { data, error } = await supabase.storage.from(BANJARA_CHAT_MEDIA_BUCKET).createSignedUrls(uniquePaths, 60 * 60)
  if (error) throw error
  return new Map((data ?? []).flatMap((item) =>
    item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
  ))
}

export async function createChatMediaUrl(path: string) {
  const urls = await createChatMediaUrls([path])
  const signedUrl = urls.get(path)
  if (!signedUrl) throw new Error('Could not create chat media URL.')
  return signedUrl
}

export async function deleteChatMedia(paths: string[]) {
  if (!paths.length) return
  const { error } = await supabase.storage.from(BANJARA_CHAT_MEDIA_BUCKET).remove(paths)
  if (error) throw error
}
