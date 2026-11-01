import { supabase } from './supabase'
import { prepareImageForUpload } from './imageUpload'
import { uploadStorageFile } from './storageUpload'

export const BANJARA_GROUP_MEDIA_BUCKET = 'banjara-group-media'
export const MAX_GROUP_MEDIA_SIZE = 50 * 1024 * 1024

const ALLOWED_GROUP_MEDIA_TYPES = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/webm','video/quicktime',
])

export type GroupMediaData = {
  path: string
  type: 'image' | 'video'
  mimeType: string
}

function extensionForGroupMedia(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension && /^[a-z0-9]{1,8}$/.test(extension)) return extension
  const fallback: Record<string, string> = {
    'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif',
    'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov',
  }
  return fallback[file.type] ?? 'bin'
}

export function validateGroupMedia(file: File) {
  if (!ALLOWED_GROUP_MEDIA_TYPES.has(file.type)) {
    throw new Error('Only JPG, PNG, WEBP, GIF, MP4, WebM, and MOV files are supported.')
  }
  if (file.size > MAX_GROUP_MEDIA_SIZE) {
    throw new Error('Photo and video files must be 50 MB or smaller.')
  }
}

export async function uploadGroupMedia(file: File, userId: string, groupId: string, messageId: string): Promise<GroupMediaData> {
  validateGroupMedia(file)
  const uploadFile = await prepareImageForUpload(file)
  const path = `${userId}/${groupId}/${messageId}/${crypto.randomUUID()}.${extensionForGroupMedia(uploadFile)}`
  await uploadStorageFile(BANJARA_GROUP_MEDIA_BUCKET, path, uploadFile)
  return { path, type: file.type.startsWith('video/') ? 'video' : 'image', mimeType: uploadFile.type }
}

export async function createGroupMediaUrls(paths: string[]) {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  if (!uniquePaths.length) return new Map<string, string>()
  const { data, error } = await supabase.storage.from(BANJARA_GROUP_MEDIA_BUCKET).createSignedUrls(uniquePaths, 60 * 60)
  if (error) throw error
  return new Map((data ?? []).flatMap((item) =>
    item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
  ))
}

export async function createGroupMediaUrl(path: string) {
  const urls = await createGroupMediaUrls([path])
  const signedUrl = urls.get(path)
  if (!signedUrl) throw new Error('Could not create group media URL.')
  return signedUrl
}

export async function hydrateGroupMediaUrls<T extends { media_url?: string | null; media_signed_url?: string | null }>(messages: T[]) {
  const pending = messages.filter((message) => message.media_url && !message.media_signed_url)
  if (!pending.length) return messages
  const paths = [...new Set(pending.map((message) => message.media_url as string))]
  try {
    const signedByPath = await createGroupMediaUrls(paths)
    for (const message of pending) message.media_signed_url = signedByPath.get(message.media_url as string) ?? null
  } catch {
    for (const message of pending) message.media_signed_url = null
  }
  return messages
}

export async function deleteGroupMedia(paths: string[]) {
  if (!paths.length) return
  const { error } = await supabase.storage.from(BANJARA_GROUP_MEDIA_BUCKET).remove(paths)
  if (error) throw error
}
