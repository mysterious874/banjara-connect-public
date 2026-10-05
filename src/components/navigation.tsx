import { NavLink, useLocation } from 'react-router-dom'
import { Bell, Compass, Ellipsis, House, MessageCircle, Plus, Settings, UserRound, Users, WandSparkles } from 'lucide-react'
import { BrandLockup } from './brand'
import { Avatar } from './ui'
import { useAuth } from '../hooks/AuthProvider'

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
  { to: '/assistant', label: 'AI', icon: WandSparkles },
  { to: '/notifications', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'More', icon: Ellipsis },
]

export function Header() {
  const { session, profile } = useAuth()
  const name = profile?.display_name || profile?.username || session?.user.email || 'Your profile'
  return <header className="topbar"><div className="topbar__inner"><BrandLockup /><div className="topbar__actions"><NavLink to="/notifications" className="icon-button topbar__notice" aria-label="Notifications"><Bell size={19} /><span className="notification-dot" /></NavLink><NavLink to="/profile" className="topbar__avatar" aria-label="Your profile"><Avatar name={name} image={profile?.avatar_url ?? undefined} size="small" /></NavLink></div></div></header>
}

function isActiveRoute(pathname: string, to: string) {
  return pathname === to || (to === '/chat' && pathname.startsWith('/chat/')) || (to === '/profile' && pathname.startsWith('/profile')) || (to === '/settings' && pathname.startsWith('/settings'))
}

export function DesktopNavigation() {
  const { pathname } = useLocation()
  return <nav className="desktop-nav" aria-label="Main navigation">{desktopItems.map(({ to, label, icon: Icon }) => {
    const active = isActiveRoute(pathname, to)
    return <NavLink key={to} to={to} aria-current={active ? 'page' : undefined} className={`desktop-nav__item${active ? ' is-active' : ''}`}><Icon size={16} /><span>{label}</span></NavLink>
  })}</nav>
}

export function BottomNavigation() {
  const location = useLocation()
  return <nav className="bottom-nav" aria-label="Main navigation">{mobileItems.map(({ to, label, icon: Icon, emphasized }) => {
    const active = isActiveRoute(location.pathname, to)
    return <NavLink key={to} to={to} aria-label={label === 'AI' ? 'AI Assistant' : label === 'More' ? 'More settings' : label} aria-current={active ? 'page' : undefined} className={`bottom-nav__item${active ? ' is-active' : ''}${emphasized ? ' bottom-nav__item--create' : ''}`}><span className="bottom-nav__icon"><Icon size={emphasized ? 20 : 16} strokeWidth={active ? 2.4 : 1.8} /></span><span>{label}</span></NavLink>
  })}</nav>
}

export function AssistantButton() {
  const location = useLocation()
  if (location.pathname === '/home') return null
  return <NavLink className="assistant-fab" to="/assistant" aria-label="Open Banjara AI assistant"><WandSparkles size={19} /><span>Ask Banjara</span></NavLink>
}
