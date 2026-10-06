import { supabase } from './supabase'
import { requireAuthenticatedUserId } from './authenticatedUser'
import type { ProfileRecord } from '../types/app'

export type CommentRecord = {
  id: string
  post_id: string
  user_id: string
  content: string
  parent_id: string | null
  created_at: string
  author: Pick<ProfileRecord, 'username' | 'display_name' | 'avatar_url'> | null
}

export async function loadPostLikes(postId: string) {
  const userId = await requireAuthenticatedUserId()
  const [{ count, error: countError }, { data: ownLike, error: ownLikeError }] = await Promise.all([
    supabase.from('post_likes').select('post_id', { count: 'exact', head: true }).eq('post_id', postId),
    supabase.from('post_likes').select('user_id').eq('post_id', postId).eq('user_id', userId).maybeSingle(),
  ])
  if (countError) throw countError
  if (ownLikeError) throw ownLikeError
  return { count: count ?? 0, liked: Boolean(ownLike) }
}

export async function loadPostLikesBatch(postIds: string[]) {
  const userId = await requireAuthenticatedUserId()
  if (!postIds.length) return new Map<string, { count: number; liked: boolean }>()
  const { data, error } = await supabase.from('post_likes').select('post_id,user_id').in('post_id', postIds)
  if (error) throw error
  const results = new Map<string, { count: number; liked: boolean }>()
  for (const postId of postIds) results.set(postId, { count: 0, liked: false })
  for (const like of data ?? []) {
    const current = results.get(like.post_id) ?? { count: 0, liked: false }
    current.count += 1
    if (like.user_id === userId) current.liked = true
    results.set(like.post_id, current)
  }
  return results
}

export async function togglePostLike(postId: string, currentlyLiked: boolean) {
  const userId = await requireAuthenticatedUserId()
  if (currentlyLiked) {
    const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId })
    if (error) throw error
  }
  return loadPostLikes(postId)
}

export async function loadComments(postId: string, offset = 0, limit = 50): Promise<{ comments: CommentRecord[]; hasMore: boolean }> {
  const { data, error } = await supabase.from('comments')
    .select('id,post_id,user_id,content,parent_id,created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit)
  if (error) throw error
  const fetched = data ?? []
  const hasMore = fetched.length > limit
  const comments = fetched.slice(0, limit)
  if (!comments.length) return { comments: [], hasMore: false }

  const userIds = [...new Set(comments.map((comment) => comment.user_id))]
  const { data: profiles, error: profileError } = await supabase.from('profiles')
    .select('id,username,display_name,avatar_url')
    .in('id', userIds)
  if (profileError) throw profileError
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  return {
    comments: comments.map((comment) => ({ ...comment, author: profileMap.get(comment.user_id) ?? null })) as CommentRecord[],
    hasMore,
  }
}

export async function createComment(postId: string, content: string, parentId: string | null = null) {
  const normalizedContent = content.trim()
  if (!normalizedContent) throw new Error('Comment cannot be empty.')
  const userId = await requireAuthenticatedUserId()
  const { error } = await supabase.from('comments').insert({
    post_id: postId,
    user_id: userId,
    content: normalizedContent,
    parent_id: parentId,
  })
  if (error) throw error
  return loadComments(postId)
}

export async function updateComment(commentId: string, content: string) {
  const normalizedContent = content.trim()
  if (!normalizedContent) throw new Error('Comment cannot be empty.')
  const userId = await requireAuthenticatedUserId()
  const { data, error } = await supabase.from('comments')
    .update({ content: normalizedContent })
    .eq('id', commentId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('This comment could not be updated. It may have been removed or you may not own it.')
}

export async function deleteComment(commentId: string) {
  const userId = await requireAuthenticatedUserId()
  const { data, error } = await supabase.from('comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('This comment could not be deleted. It may have been removed or you may not own it.')
}

export async function loadCommentLikes(commentIds: string[]) {
  const userId = await requireAuthenticatedUserId()
  if (!commentIds.length) return new Map<string, { count: number; liked: boolean }>()
  const { data, error } = await supabase.from('comment_likes')
    .select('comment_id,user_id')
    .in('comment_id', commentIds)
  if (error) throw error
  const results = new Map<string, { count: number; liked: boolean }>()
  for (const like of data) {
    const current = results.get(like.comment_id) ?? { count: 0, liked: false }
    current.count += 1
    if (like.user_id === userId) current.liked = true
    results.set(like.comment_id, current)
  }
  return results
}

export async function toggleCommentLike(commentId: string, currentlyLiked: boolean) {
  const userId = await requireAuthenticatedUserId()
  if (currentlyLiked) {
    const { error } = await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: userId })
    if (error) throw error
  }
  const likes = await loadCommentLikes([commentId])
  return likes.get(commentId) ?? { count: 0, liked: false }
}