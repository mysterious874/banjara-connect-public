import { supabase } from './supabase'
import type { ProfileRecord } from '../types/app'
import { loadBlockedUserIds } from './blockData'
import { requireAuthenticatedUserId } from './authenticatedUser'

const profileColumns = 'id,username,display_name,avatar_url,bio,location,is_verified,created_at'
const profilePageSize = 50

export async function loadProfilesPage(offset = 0): Promise<{ profiles: ProfileRecord[]; hasMore: boolean; nextOffset: number }> {
  const currentUserId = await requireAuthenticatedUserId()
  const query = supabase.from('profiles')
    .select(profileColumns)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .neq('id', currentUserId)
    .range(offset, offset + profilePageSize - 1)
  const [{ data, error }, blockedIds] = await Promise.all([
    query,
    loadBlockedUserIds(),
  ])
  if (error) throw error
  const rows = (data ?? []) as ProfileRecord[]
  return {
    profiles: rows.filter((profile) => !blockedIds.includes(profile.id)),
    hasMore: rows.length === profilePageSize,
    nextOffset: offset + rows.length,
  }
}

export async function loadProfiles(): Promise<ProfileRecord[]> {
  const { profiles } = await loadProfilesPage()
  return profiles
}

export function filterProfiles(profiles: ProfileRecord[], query: string) {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return profiles
  return profiles.filter((profile) => [profile.username, profile.display_name, profile.bio, profile.location]
    .some((value) => value?.toLocaleLowerCase().includes(normalized)))
}