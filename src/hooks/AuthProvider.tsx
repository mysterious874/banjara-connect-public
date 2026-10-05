import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { supabase } from '../utils/supabase'
import type { ProfileRecord, ProfileUpdate } from '../types/app'

const profileColumns = 'id,username,display_name,avatar_url,bio,location,is_verified'

async function loadOrCreateProfile(user: User): Promise<ProfileRecord> {
  const { data, error } = await supabase.from('profiles').select(profileColumns).eq('id', user.id).maybeSingle()
  if (error) throw error
  if (data) return data as ProfileRecord

  const emailName = user.email?.split('@')[0] ?? 'member'
  const usernameBase = emailName.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18) || 'member'
  const username = `${usernameBase}-${user.id.slice(0, 8)}`
  const displayName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? emailName
  const { data: created, error: createError } = await supabase.from('profiles').insert({
    id: user.id,
    username,
    display_name: displayName || 'Banjara member',
  }).select(profileColumns).single()

  if (!createError && created) return created as ProfileRecord
  if (createError?.code === '23505') {
    const retry = await supabase.from('profiles').select(profileColumns).eq('id', user.id).maybeSingle()
    if (retry.data && !retry.error) return retry.data as ProfileRecord
  }
  throw createError ?? new Error('Could not create your profile.')
}

type AuthContextValue = {
  session: Session | null
  isLoading: boolean
  initializationError: string | null
  profile: ProfileRecord | null
  isProfileLoading: boolean
  profileError: string | null
  refreshProfile: () => Promise<ProfileRecord | null>
  updateProfile: (updates: ProfileUpdate) => Promise<{ data: ProfileRecord | null; error: string | null }>
  signOut: () => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [initializationError, setInitializationError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileRecord | null>(null)
  const [isProfileLoading, setIsProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession)
        setIsLoading(false)
        setInitializationError(null)
      }
    })

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setSession(data.session)
      setInitializationError(error?.message ?? null)
      setIsLoading(false)
    }).catch((error: unknown) => {
      if (!active) return
      setInitializationError(error instanceof Error ? error.message : 'Could not initialize your session.')
      setIsLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const user = session?.user
  useEffect(() => {
    let active = true
    if (!user) {
      setProfile(null)
      setProfileError(null)
      setIsProfileLoading(false)
      return () => { active = false }
    }

    setProfile(null)
    setProfileError(null)
    setIsProfileLoading(true)
    loadOrCreateProfile(user).then((nextProfile) => {
      if (active) setProfile(nextProfile)
    }).catch((error: unknown) => {
      if (active) setProfileError(error instanceof Error ? error.message : 'Could not load your profile.')
    }).finally(() => {
      if (active) setIsProfileLoading(false)
    })

    return () => { active = false }
  }, [user?.id])

  async function refreshProfile() {
    if (!user) return null
    setIsProfileLoading(true)
    setProfileError(null)
    try {
      const nextProfile = await loadOrCreateProfile(user)
      setProfile(nextProfile)
      return nextProfile
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Could not load your profile.')
      return null
    } finally {
      setIsProfileLoading(false)
    }
  }

  async function updateProfile(updates: ProfileUpdate) {
    if (!user) return { data: null, error: 'You must be signed in to update your profile.' }
    setIsProfileLoading(true)
    setProfileError(null)
    try {
      const { data, error } = await supabase.from('profiles').update(updates).eq('id', user.id).select(profileColumns).single()
      if (error) {
        setProfileError(error.message)
        return { data: null, error: error.message }
      }
      const nextProfile = data as ProfileRecord
      setProfile(nextProfile)
      return { data: nextProfile, error: null }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update your profile.'
      setProfileError(message)
      return { data: null, error: message }
    } finally {
      setIsProfileLoading(false)
    }
  }

  return <AuthContext.Provider value={{ session, isLoading, initializationError, profile, isProfileLoading, profileError, refreshProfile, updateProfile, signOut: () => supabase.auth.signOut() }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider.')
  return context
}