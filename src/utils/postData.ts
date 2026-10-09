import { supabase } from './supabase'
import type { FeedPost, ProfileRecord, PostRecord } from '../types/app'
import { createPostMediaUrls } from './mediaData'
import { getCached, setCached } from './performanceCache'

const postColumns = 'id,user_id,group_id,content,created_at,visibility,media_urls,media_type'

async function attachAuthors(posts: PostRecord[]): Promise<FeedPost[]> {
  const userIds = [...new Set(posts.map((post) => post.user_id))]
  if (!userIds.length) return []

  // Resolve authors and all media URLs in parallel. Signing URLs once per post
  // caused 20+ Storage requests for a single feed page on mobile connections.
  const mediaPaths = [...new Set(posts.flatMap((post) => post.media_urls ?? []))]
  const [authorResult, signedUrls] = await Promise.all([
    supabase.from('profiles')
      .select('id,username,display_name,avatar_url,location')
      .in('id', userIds),
    mediaPaths.length
      ? createPostMediaUrls(mediaPaths).catch((error: unknown) => {
          // Keep text and author content usable if Storage temporarily fails.
          console.warn('Post media URLs could not be loaded; feed will remain available.', error)
          return new Map<string, string>()
        })
      : Promise.resolve(new Map<string, string>()),
  ])
  if (authorResult.error) throw authorResult.error

  const authorsById = new Map((authorResult.data as Pick<ProfileRecord, 'id' | 'username' | 'display_name' | 'avatar_url' | 'location'>[]).map((author) => [author.id, author]))
  return posts.map((post) => {
    const paths = post.media_urls ?? []
    const media = paths.map((path) => ({
      path,
      type: post.media_type === 'video' ? 'video' as const : 'image' as const,
      mimeType: post.media_type === 'video' ? 'video/*' : 'image/*',
      signedUrl: signedUrls.get(path) ?? '',
    }))
    return { ...post, author: authorsById.get(post.user_id) ?? null, media }
  }) as FeedPost[]
}

export async function loadPostsPage(
  options: { userId?: string; groupIds?: string[]; excludeUserIds?: string[]; offset?: number; limit?: number } = {},
): Promise<{ posts: FeedPost[]; hasMore: boolean; nextOffset: number }> {
  const limit = options.limit ?? 20
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