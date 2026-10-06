import { NavLink, useLocation } from 'react-router-dom'
import { Bell, Compass, Ellipsis, House, MessageCircle, Plus, Settings, UserRound, Users } from 'lucide-react'
import { BrandLockup } from './brand'
import { Avatar } from './ui'
import { useAuth } from '../hooks/AuthProvider'
import { useEffect, useState } from 'react'
import { loadUnreadNotificationCount } from '../utils/notificationData'
import { subscribeToPostgresChanges } from '../utils/realtimeData'
import { loadUnreadChatCount } from '../utils/chatData'

const desktopItems = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/chat', label: 'Chats', icon: MessageCircle },
  { to: '/connect', label: 'Connect', icon: Compass },
  { to: '/community', label: 'Community', icon: Users },
  { to: '/notifications', label: 'Alerts', icon: Bell },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const mobileItems = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/chat', label: 'Chats', icon: MessageCircle },
  { to: '/connect', label: 'Connect', icon: Compass },
  { to: '/create', label: 'Create', icon: Plus, emphasized: true },
  { to: '/community', label: 'Community', icon: Users },
  { to: '/notifications', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'More', icon: Ellipsis },
]

export function useUnreadChatCount(sessionUserId: string | undefined) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let active = true
    if (!sessionUserId) {
      setCount(0)
      return () => { active = false }
    }

    const refresh = async () => {
      try {
        const next = await loadUnreadChatCount()
        if (active) setCount(next)
      } catch {
        if (active) setCount(0)
      }
    }

    void refresh()
    const unsubscribeMessages = subscribeToPostgresChanges({
      topic: `chat-badge-messages:${sessionUserId}`,
      event: 'INSERT',
      table: 'messages',
    }, () => { void refresh() })
    const unsubscribeReads = subscribeToPostgresChanges({
      topic: `chat-badge-reads:${sessionUserId}`,
      event: '*',
      table: 'message_reads',
      filter: `user_id=eq.${sessionUserId}`,
    }, () => { void refresh() })

    return () => {
      active = false
      unsubscribeMessages()
      unsubscribeReads()
    }
  }, [sessionUserId])

  return count
}

export function Header() {
  const { profile, session } = useAuth()
  const name = profile?.display_name || profile?.username || 'Your profile'
  const [unreadCount, setUnreadCount] = useState(0)
  useEffect(() => {
    let active = true
    if (!session?.user.id) {
      setUnreadCount(0)
      return () => { active = false }
    }

    const refresh = async () => {
      try {
        const count = await loadUnreadNotificationCount()
        if (active) setUnreadCount(count)
      } catch {
        if (active) setUnreadCount(0)
      }
    }

    void refresh()
    const unsubscribe = subscribeToPostgresChanges({
      topic: `notifications-badge:${session.user.id}`,
      event: '*',
      table: 'notifications',
      filter: `user_id=eq.${session.user.id}`,
    }, () => { void refresh() })

    return () => {
      active = false
      unsubscribe()
    }
  }, [session?.user.id])

  const badge = unreadCount > 99 ? '99+' : String(unreadCount)

  return <header className="topbar"><div className="topbar__inner"><BrandLockup /><div className="topbar__actions"><NavLink to="/notifications" className="icon-button topbar__notice" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}><Bell size={19} />{unreadCount > 0 && <span className="notification-badge">{badge}</span>}</NavLink><NavLink to="/profile" className="topbar__avatar" aria-label="Your profile"><Avatar name={name} image={profile?.avatar_url ?? undefined} size="small" /></NavLink></div></div></header>
}

function isActiveRoute(pathname: string, to: string) {
  return pathname === to || (to === '/chat' && pathname.startsWith('/chat/')) || (to === '/profile' && pathname.startsWith('/profile')) || (to === '/settings' && pathname.startsWith('/settings'))
}

export function DesktopNavigation({ unreadChatCount = 0 }: { unreadChatCount?: number }) {
  const { pathname } = useLocation()
  return <nav className="desktop-nav" aria-label="Main navigation">{desktopItems.map(({ to, label, icon: Icon }) => {
    const active = isActiveRoute(pathname, to)
    return <NavLink key={to} to={to} aria-current={active ? 'page' : undefined} className={`desktop-nav__item${active ? ' is-active' : ''}`}><span className="nav-icon-wrap"><Icon size={16} />{to === '/chat' && unreadChatCount > 0 && <span className="nav-badge">{unreadChatCount > 99 ? '99+' : unreadChatCount}</span>}</span><span>{label}</span></NavLink>
  })}</nav>
}

export function BottomNavigation({ unreadChatCount = 0 }: { unreadChatCount?: number }) {
  const location = useLocation()
  return <nav className="bottom-nav" aria-label="Main navigation">{mobileItems.map(({ to, label, icon: Icon, emphasized }) => {
    const active = isActiveRoute(location.pathname, to)
    return <NavLink key={to} to={to} aria-label={label === 'AI' ? 'AI Assistant' : label === 'More' ? 'More settings' : label} aria-current={active ? 'page' : undefined} className={`bottom-nav__item${active ? ' is-active' : ''}${emphasized ? ' bottom-nav__item--create' : ''}`}><span className="bottom-nav__icon nav-icon-wrap"><Icon size={emphasized ? 20 : 16} strokeWidth={active ? 2.4 : 1.8} />{to === '/chat' && unreadChatCount > 0 && <span className="nav-badge">{unreadChatCount > 99 ? '99+' : unreadChatCount}</span>}</span><span>{label}</span></NavLink>
  })}</nav>
}
