import { supabase } from './supabase'
import { requireAuthenticatedUserId } from './authenticatedUser'

export async function loadFollowState(targetUserId: string) {
  const userId = await requireAuthenticatedUserId()
  if (userId === targetUserId) return { following: false, self: true }
  const { data, error } = await supabase.from('follows').select('follower_id')
    .eq('follower_id', userId).eq('following_id', targetUserId).maybeSingle()
  if (error) throw error
  return { following: Boolean(data), self: false }
}

export async function toggleFollow(targetUserId: string, currentlyFollowing: boolean) {
  const userId = await requireAuthenticatedUserId()
  if (userId === targetUserId) throw new Error('You cannot follow yourself.')
  if (currentlyFollowing) {
    const { error } = await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetUserId)
    if (error) throw error
    return false
  }
  const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: targetUserId })
  if (error?.code === '23505') {
    const state = await loadFollowState(targetUserId)
    if (state.following) return true
  }
  if (error) throw error
  return true
}