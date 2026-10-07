import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { supabase } from '../utils/supabase'
import { userFacingError } from '../utils/userFacingError'
import type { ProfileRecord, ProfileUpdate } from '../types/app'

const profileColumns = 'id,username,display_name,avatar_url,bio,location,is_verified'

async function loadOrCreateProfile(user: User): Promise<ProfileRecord> {
  const { data, error } = await supabase.from('profiles').select(profileColumns).eq('id', user.id).maybeSingle()
  if (error) throw error

  const displayBase = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? 'Banjara member'
  const username = `member-${user.id.slice(0, 8)}`
  const displayName = displayBase || 'Banjara member'
  if (data) {
    const missingFields: Partial<Pick<ProfileRecord, 'username' | 'display_name'>> = {}
    if (!data.username) missingFields.username = username
    if (!data.display_name) missingFields.display_name = displayName
    if (!Object.keys(missingFields).length) return data as ProfileRecord

    const { data: repaired, error: repairError } = await supabase.from('profiles')
      .update(missingFields).eq('id', user.id).select(profileColumns).single()
    if (repairError) throw repairError
    return repaired as ProfileRecord
  }

  const { data: created, error: createError } = await supabase.from('profiles').insert({
    id: user.id,
    username,
    display_name: displayName,
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
  onlineUserIds: Set<string>
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
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    let receivedAuthEvent = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        receivedAuthEvent = true
        setSession(nextSession)
        setIsLoading(false)
        setInitializationError(null)
      }
    })

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (!receivedAuthEvent) {
        setSession(data.session)
        setInitializationError(error ? userFacingError(error, 'Could not check your session. Please try again.') : null)
      }
      setIsLoading(false)
    }).catch((error: unknown) => {
      if (!active) return
      setInitializationError(userFacingError(error, 'Could not initialize your session.'))
      setIsLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const user = session?.user

  // App-level presence: online as soon as the authenticated app is open,
  // offline when the app/tab is backgrounded. This is intentionally global,
  // not tied to the chat route.
  useEffect(() => {
    if (!user?.id) {
      setOnlineUserIds(new Set())
      return
    }
    const channel = supabase.channel('banjara-app-presence', {
      config: { presence: { key: user.id } },
    })
    let active = true
    const sync = () => {
      if (!active) return
      const state = channel.presenceState() as Record<string, Array<{ userId?: string }>>
      const ids = new Set<string>()
      Object.entries(state).forEach(([key, entries]) => {
        const id = entries?.[0]?.userId ?? key
        if (id) ids.add(id)
      })
      setOnlineUserIds(ids)
    }
    channel.on('presence', { event: 'sync' }, sync)
    channel.on('presence', { event: 'join' }, sync)
    channel.on('presence', { event: 'leave' }, sync)
    const track = async () => {
      try { await channel.track({ userId: user.id, online_at: new Date().toISOString() }) } catch { /* reconnect handles this */ }
    }
    const untrack = async () => {
      try { await channel.untrack() } catch { /* channel may already be closed */ }
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void track()
      else void untrack()
    }
    const handleBeforeUnload = () => { void untrack() }
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && document.visibilityState === 'visible') await track()
    })
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      void untrack()
      void supabase.removeChannel(channel)
      setOnlineUserIds(new Set())
    }
  }, [user?.id])

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
      if (active) setProfileError(userFacingError(error, 'Could not load your profile.'))
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
      setProfileError(userFacingError(error, 'Could not load your profile.'))
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
        const message = userFacingError(error, 'Could not update your profile.')
        setProfileError(message)
        return { data: null, error: message }
      }
      const nextProfile = data as ProfileRecord
      setProfile(nextProfile)
      return { data: nextProfile, error: null }
    } catch (error) {
      const message = userFacingError(error, 'Could not update your profile.')
      setProfileError(message)
      return { data: null, error: message }
    } finally {
      setIsProfileLoading(false)
    }
  }

  return <AuthContext.Provider value={{ session, isLoading, initializationError, profile, isProfileLoading, profileError, onlineUserIds, refreshProfile, updateProfile, signOut: () => supabase.auth.signOut() }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider.')
  return context
}