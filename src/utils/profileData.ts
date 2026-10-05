import { supabase } from './supabase'
import type { ProfileRecord } from '../types/app'
import { loadBlockedUserIds } from './blockData'
import { requireAuthenticatedUserId } from './authenticatedUser'

export async function loadProfiles(): Promise<ProfileRecord[]> {
  const currentUserId = await requireAuthenticatedUserId()
  let query = supabase.from('profiles')
    .select('id,username,display_name,avatar_url,bio,location,is_verified,created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  query = query.neq('id', currentUserId)
  const [{ data, error }, blockedIds] = await Promise.all([
    query,
    loadBlockedUserIds(),
  ])
  if (error) throw error
  return ((data ?? []) as ProfileRecord[]).filter((profile) => !blockedIds.includes(profile.id))
}

export function filterProfiles(profiles: ProfileRecord[], query: string) {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return profiles
  return profiles.filter((profile) => [profile.username, profile.display_name, profile.bio, profile.location]
    .some((value) => value?.toLocaleLowerCase().includes(normalized)))
}