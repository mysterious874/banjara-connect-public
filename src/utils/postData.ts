import { supabase } from './supabase'
import type { FeedPost, ProfileRecord, PostRecord } from '../types/app'
import { createPostMediaUrls } from './mediaData'
import { getCached, setCached } from './performanceCache'

const postColumns = 'id,user_id,group_id,content,created_at,visibility,media_urls,media_type'

async function attachAuthors(posts: PostRecord[]): Promise<FeedPost[]> {
  const userIds = [...new Set(posts.map((post) => post.user_id))]
  if (!userIds.length) return []

  const { data: authors, error } = await supabase.from('profiles')
    .select('id,username,display_name,avatar_url,location')
    .in('id', userIds)
  if (error) throw error

  const authorsById = new Map((authors as Pick<ProfileRecord, 'id' | 'username' | 'display_name' | 'avatar_url' | 'location'>[]).map((author) => [author.id, author]))
  const withAuthors = posts.map((post) => ({ ...post, author: authorsById.get(post.user_id) ?? null })) as Array<FeedPost & { media_urls?: string[]; media_type?: string | null }>
  return await Promise.all(withAuthors.map(async (post) => {
    const paths = post.media_urls ?? []
    const signedUrls = await createPostMediaUrls(paths)
    const media = paths.map((path) => ({
      path,
      type: post.media_type === 'video' ? 'video' as const : 'image' as const,
      mimeType: post.media_type === 'video' ? 'video/*' : 'image/*',
      signedUrl: signedUrls.get(path) ?? '',
    }))
    return { ...post, media }
  }))
}

export async function loadPostsPage(
  options: { userId?: string; groupIds?: string[]; excludeUserIds?: string[]; offset?: number; limit?: number } = {},
): Promise<{ posts: FeedPost[]; hasMore: boolean; nextOffset: number }> {
  const limit = options.limit ?? 50
  const offset = options.offset ?? 0
  let query = supabase.from('posts').select(postColumns)
    .order('created_at', { ascending: false }).order('id', { ascending: true })
  if (options.userId) query = query.eq('user_id', options.userId)
  if (options.groupIds) {
    if (!options.groupIds.length) return { posts: [], hasMore: false, nextOffset: 0 }
    query = query.in('group_id', options.groupIds)
  }
  query = query.range(offset, offset + limit - 1)
  if (options.excludeUserIds?.length) query = query.not('user_id', 'in', `(${options.excludeUserIds.join(',')})`)

  const cacheKey = `posts:${options.userId ?? 'feed'}:${(options.groupIds ?? []).slice().sort().join(',')}:${offset}:${limit}:${(options.excludeUserIds ?? []).slice().sort().join(',')}`
  const cached = getCached<{ posts: FeedPost[]; hasMore: boolean; nextOffset: number }>(cacheKey)
  if (cached) return cached

  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as PostRecord[]
  const result = { posts: await attachAuthors(rows), hasMore: rows.length === limit, nextOffset: offset + rows.length }
  setCached(cacheKey, result, 30_000)
  return result
}

export async function loadPosts(options: { userId?: string; postId?: string; groupIds?: string[]; excludeUserIds?: string[] } = {}): Promise<FeedPost[]> {
  if (options.postId) {
    let query = supabase.from('posts').select(postColumns).eq('id', options.postId).limit(1)
    if (options.userId) query = query.eq('user_id', options.userId)
    if (options.groupIds) {
      if (!options.groupIds.length) return []
      query = query.in('group_id', options.groupIds)
    }
    if (options.excludeUserIds?.length) query = query.not('user_id', 'in', `(${options.excludeUserIds.join(',')})`)
    const { data, error } = await query
    if (error) throw error
    return attachAuthors((data ?? []) as PostRecord[])
  }
  const { posts } = await loadPostsPage(options)
  return posts
}

export async function loadPost(postId: string): Promise<FeedPost | null> {
  const posts = await loadPosts({ postId })
  return posts[0] ?? null
}