import { supabase } from './supabase'
import { prepareImageForUpload } from './imageUpload'
import { uploadStorageFile } from './storageUpload'

export const BANJARA_PROFILE_AVATAR_BUCKET = 'banjara-profile-avatars'
export const MAX_PROFILE_AVATAR_SIZE = 5 * 1024 * 1024

const allowedAvatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function validateProfileAvatar(file: File) {
  if (!allowedAvatarTypes.has(file.type)) {
    throw new Error('Choose a JPG, PNG, WEBP, or GIF profile photo.')
  }
  if (file.size > MAX_PROFILE_AVATAR_SIZE) {
    throw new Error('Profile photos must be 5 MB or smaller.')
  }
}

export async function uploadProfileAvatar(file: File, userId: string) {
  validateProfileAvatar(file)
  const uploadFile = await prepareImageForUpload(file)
  const extension = uploadFile.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  await uploadStorageFile(BANJARA_PROFILE_AVATAR_BUCKET, path, uploadFile)
  const { data } = supabase.storage.from(BANJARA_PROFILE_AVATAR_BUCKET).getPublicUrl(path)
  return { path, publicUrl: data.publicUrl }
}

export async function deleteProfileAvatar(path: string) {
  if (!path) return
  const { error } = await supabase.storage.from(BANJARA_PROFILE_AVATAR_BUCKET).remove([path])
  if (error) throw error
}

export function profileAvatarPathFromUrl(url: string | null | undefined) {
  if (!url) return null
  const marker = `/storage/v1/object/public/${BANJARA_PROFILE_AVATAR_BUCKET}/`
  const index = url.indexOf(marker)
  if (index === -1) return null
  return decodeURIComponent(url.slice(index + marker.length))
}
