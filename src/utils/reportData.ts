import { supabase } from './supabase'
import { requireAuthenticatedUserId } from './authenticatedUser'

export type ReportTarget = { postId?: string; commentId?: string }

export async function createReport(target: ReportTarget, reason: string, details: string) {
  const hasPost = Boolean(target.postId)
  const hasComment = Boolean(target.commentId)
  if (hasPost === hasComment) throw new Error('Choose exactly one post or comment to report.')
  if (!reason.trim()) throw new Error('Choose a report reason.')
  const reporterId = await requireAuthenticatedUserId()

  if (target.postId) {
    const { data, error } = await supabase.from('posts').select('id').eq('id', target.postId).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('The selected post is not available.')
  }
  if (target.commentId) {
    const { data, error } = await supabase.from('comments').select('id').eq('id', target.commentId).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('The selected comment is not available.')
  }

  const { data, error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    post_id: target.postId ?? null,
    comment_id: target.commentId ?? null,
    reason: reason.trim(),
    details: details.trim() || null,
  }).select('id').single()
  if (error) throw error
  return data.id as string
}