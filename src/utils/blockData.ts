import { supabase } from './supabase'
import { requireAuthenticatedUserId } from './authenticatedUser'

export async function loadBlockedUserIds() {
  const ownerId = await requireAuthenticatedUserId()
  const { data, error } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', ownerId)
  if (error) throw error
  return (data ?? []).map((row) => row.blocked_id as string)
}

export async function loadBlockState(targetUserId: string) {
  const userId = await requireAuthenticatedUserId()
  if (userId === targetUserId) return { blocked: false, self: true }
  const { data, error } = await supabase.from('blocks').select('blocked_id')
    .eq('blocker_id', userId).eq('blocked_id', targetUserId).maybeSingle()
  if (error) throw error
  return { blocked: Boolean(data), self: false }
}

export async function toggleBlock(targetUserId: string, currentlyBlocked: boolean) {
  const userId = await requireAuthenticatedUserId()
  if (userId === targetUserId) throw new Error('You cannot block yourself.')
  if (currentlyBlocked) {
    const { error } = await supabase.from('blocks').delete().eq('blocker_id', userId).eq('blocked_id', targetUserId)
    if (error) throw error
    return false
  }
  const { error } = await supabase.from('blocks').insert({ blocker_id: userId, blocked_id: targetUserId })
  if (error?.code === '23505') {
    const state = await loadBlockState(targetUserId)
    if (state.blocked) return true
  }
  if (error) throw error
  return true
}