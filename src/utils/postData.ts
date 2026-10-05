import { supabase } from './supabase'
import type { FeedPost, ProfileRecord, PostRecord } from '../types/app'

const postColumns = 'id,user_id,content,created_at,visibility'

async function attachAuthors(posts: PostRecord[]): Promise<FeedPost[]> {
  const userIds = [...new Set(posts.map((post) => post.user_id))]
  if (!userIds.length) return []

  const { data: authors, error } = await supabase.from('profiles')
    .select('id,username,display_name,avatar_url,location')
    .in('id', userIds)
  if (error) throw error

  const authorsById = new Map((authors as Pick<ProfileRecord, 'id' | 'username' | 'display_name' | 'avatar_url' | 'location'>[]).map((author) => [author.id, author]))
  return posts.map((post) => ({ ...post, author: authorsById.get(post.user_id) ?? null }))
}

export async function loadPosts(options: { userId?: string; postId?: string; excludeUserIds?: string[] } = {}): Promise<FeedPost[]> {
  let query = supabase.from('posts').select(postColumns).order('created_at', { ascending: false })
  if (options.userId) query = query.eq('user_id', options.userId)
  if (options.postId) query = query.eq('id', options.postId).limit(1)
  if (options.excludeUserIds?.length) query = query.not('user_id', 'in', `(${options.excludeUserIds.join(',')})`)

  const { data, error } = await query
  if (error) throw error
  return attachAuthors((data ?? []) as PostRecord[])
}

export async function loadPost(postId: string): Promise<FeedPost | null> {
  const posts = await loadPosts({ postId })
  return posts[0] ?? null
}