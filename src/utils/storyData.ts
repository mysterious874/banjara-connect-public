import { supabase } from './supabase'
import type { ProfileRecord } from '../types/app'

export const BANJARA_STORIES_BUCKET = 'banjara-stories'
export const MAX_STORY_MEDIA_SIZE = 50 * 1024 * 1024

const allowedStoryTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
])

export type StoryRecord = {
  id: string
  user_id: string
  content: string
  media_url: string | null
  media_path?: string | null
  media_type: 'image' | 'video' | null
  created_at: string
  expires_at: string
  author: Pick<ProfileRecord, 'id' | 'username' | 'display_name' | 'avatar_url'> | null
}

export function validateStoryMedia(file: File) {
  if (!allowedStoryTypes.has(file.type)) throw new Error('Choose a JPG, PNG, WEBP, GIF, MP4, WebM, or MOV file.')
  if (file.size > MAX_STORY_MEDIA_SIZE) throw new Error('Story media must be 50 MB or smaller.')
}

export async function uploadStoryMedia(file: File, userId: string, storyId: string) {
  validateStoryMedia(file)
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${storyId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(BANJARA_STORIES_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  return { path }
}

export async function deleteStoryMedia(paths: string[]) {
  const clean = paths.filter(Boolean)
  if (!clean.length) return
  const { error } = await supabase.storage.from(BANJARA_STORIES_BUCKET).remove(clean)
  if (error) throw error
}

export async function loadActiveStories() {
  const { data, error } = await supabase.from('stories')
    .select('id,user_id,content,media_url,media_type,created_at,expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  const rows = data ?? []
  const userIds = [...new Set(rows.map((item) => item.user_id))]
  if (!userIds.length) return [] as StoryRecord[]
  const { data: profiles, error: profileError } = await supabase.from('profiles')
    .select('id,username,display_name,avatar_url')
    .in('id', userIds)
  if (profileError) throw profileError
  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  const mediaPaths = rows.map((item) => item.media_url).filter((path): path is string => Boolean(path))
  const signedByPath = new Map<string, string>()
  if (mediaPaths.length) {
    try {
      const { data: signedUrls, error: signedError } = await supabase.storage
        .from(BANJARA_STORIES_BUCKET)
        .createSignedUrls(mediaPaths, 60 * 60)
      if (!signedError) {
        for (const signed of signedUrls ?? []) {
          if (signed.path && signed.signedUrl) signedByPath.set(signed.path, signed.signedUrl)
        }
      }
    } catch {
      // Individual media failures should not block the stories list.
    }
  }

  return rows.map((item) => {
    const mediaPath = item.media_url
    return {
      ...item,
      media_url: mediaPath ? (signedByPath.get(mediaPath) ?? null) : null,
      media_path: mediaPath,
      media_type: item.media_type === 'video' ? 'video' : item.media_type === 'image' ? 'image' : null,
      author: byId.get(item.user_id) ?? null,
    }
  }) as StoryRecord[]
}

export async function createStory(userId: string, content: string, mediaFile?: File | null) {
  if (!content.trim() && !mediaFile) throw new Error('Add a photo, video, or message to your story.')
  const { data, error } = await supabase.from('stories').insert({
    user_id: userId,
    content: content.trim(),
    media_url: null,
    media_type: mediaFile?.type.startsWith('video/') ? 'video' : mediaFile ? 'image' : null,
  }).select('id').single()
  if (error) throw error
  let uploadedPath = ''
  try {
    if (mediaFile) {
      const uploaded = await uploadStoryMedia(mediaFile, userId, data.id)
      uploadedPath = uploaded.path
      const { error: updateError } = await supabase.from('stories').update({
        media_url: uploaded.path,
      }).eq('id', data.id).eq('user_id', userId)
      if (updateError) throw updateError
    }
    return data.id
  } catch (error) {
    if (uploadedPath) await deleteStoryMedia([uploadedPath]).catch(() => undefined)
    await supabase.from('stories').delete().eq('id', data.id).eq('user_id', userId)
    throw error
  }
}

export async function deleteStory(story: StoryRecord) {
  const { error } = await supabase.from('stories').delete().eq('id', story.id).eq('user_id', story.user_id)
  if (error) throw error
  const storedPath = story.media_path ?? story.media_url
  if (storedPath) {
    const marker = `/storage/v1/object/public/${BANJARA_STORIES_BUCKET}/`
    const path = storedPath.includes(marker)
      ? decodeURIComponent(storedPath.slice(storedPath.indexOf(marker) + marker.length))
      : storedPath
    await deleteStoryMedia([path])
  }
}
