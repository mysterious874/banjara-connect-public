import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus } from 'lucide-react'
import type { PreviewUser } from '../types/app'
import { Avatar, Button } from './ui'

export function UserCard({ user, compact = false }: { user: PreviewUser; compact?: boolean }) {
  const [following, setFollowing] = useState(false)
  return <div className={`user-card${compact ? ' user-card--compact' : ''}`}><Link className="user-card__identity" to="/profile"><Avatar name={user.name} initials={user.initials} tone={user.tone} /><span className="user-card__copy"><strong>{user.name}</strong><span>@{user.handle} · {user.detail}</span></span></Link><Button variant={following ? 'quiet' : 'outline'} iconOnly className="user-card__follow" aria-label={`${following ? 'Unfollow' : 'Follow'} ${user.name} in preview`} onClick={() => setFollowing(!following)}>{following ? <Check size={17} /> : <Plus size={17} />}</Button></div>
}
