import { useState } from 'react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus } from 'lucide-react'
import type { ProfileRecord } from '../types/app'
import { useAuth } from '../hooks/AuthProvider'
import { loadFollowState, toggleFollow } from '../utils/followData'
import { Avatar, Button } from './ui'

export function UserCard({ user, compact = false }: { user: ProfileRecord; compact?: boolean }) {
  const { session } = useAuth()
  const [following, setFollowing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState('')
  const name = user.display_name || user.username || 'Community member'
  const profileHandle = user.username || user.id
  const detail = user.location || user.bio || 'Community profile'
  const isSelf = session?.user.id === user.id

  useEffect(() => {
    let active = true
    if (!session?.user || isSelf) {
      setFollowing(false)
      setIsLoading(false)
      return () => { active = false }
    }
    setIsLoading(true)
    loadFollowState(user.id).then((state) => {
      if (active) setFollowing(state.following)
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Could not load follow state.')
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [isSelf, session?.user.id, user.id])

  async function handleFollow() {
    if (isLoading || isPending || isSelf) return
    setIsPending(true)
    setError('')
    try {
      setFollowing(await toggleFollow(user.id, following))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update follow state.')
    } finally {
      setIsPending(false)
    }
  }

  return <div className={`user-card${compact ? ' user-card--compact' : ''}`}><Link className="user-card__identity" to={`/profile/${profileHandle}`}><Avatar name={name} image={user.avatar_url ?? undefined} /><span className="user-card__copy"><strong>{name}</strong><span>@{user.username || `member-${user.id.slice(0, 8)}`} · {detail}</span></span></Link>{!isSelf && <Button variant={following ? 'quiet' : 'outline'} iconOnly className="user-card__follow" aria-label={following ? `Unfollow ${name}` : `Follow ${name}`} title={error || undefined} disabled={isLoading || isPending} onClick={handleFollow}>{following ? <Check size={17} /> : <Plus size={17} />}</Button>}</div>
}
