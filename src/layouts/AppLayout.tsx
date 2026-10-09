import { useRef, useState, type TouchEvent } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BottomNavigation, DesktopNavigation, Header } from '../components/navigation'
import { ErrorState, Loading, Toast } from '../components/ui'
import { useAuth } from '../hooks/AuthProvider'
import { userFacingError } from '../utils/userFacingError'
import type { ToastApi } from '../types/app'

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = location.pathname
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const mainTabs = ['/home', '/chat', '/connect', '/create', '/community', '/notifications', '/settings']
  const tabForPath = (path: string) => {
    if (path.startsWith('/chat')) return 1
    if (path.startsWith('/connect')) return 2
    if (path.startsWith('/create')) return 3
    if (path.startsWith('/community')) return 4
    if (path.startsWith('/notifications')) return 5
    if (path.startsWith('/settings')) return 6
    if (path.startsWith('/home') || path === '/') return 0
    return -1
  }
  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (window.innerWidth >= 800 || event.touches.length !== 1) {
      touchStart.current = null
      return
    }
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('input, textarea, select, button, a, [role="button"], .chat-messages, .stories-rail__items, .story-fullscreen, .community-group-members-panel, [data-no-page-swipe]')) {
      touchStart.current = null
      return
    }
    const touch = event.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }
  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start || window.innerWidth >= 800 || event.changedTouches.length !== 1) return
    if (pathname.startsWith('/chat/') || pathname.startsWith('/community/groups/') || pathname === '/stories') return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.25) return
    const currentTab = tabForPath(pathname)
    if (currentTab < 0) return
    const nextTab = dx < 0 ? currentTab + 1 : currentTab - 1
    if (nextTab < 0 || nextTab >= mainTabs.length) return
    navigate(mainTabs[nextTab])
  }
  const assistantOpen = pathname === '/assistant'
  const chatOpen = pathname.startsWith('/chat/') && pathname !== '/chat'
  const communityGroupOpen = pathname.startsWith('/community/groups/')
  const storiesOpen = pathname === '/stories'
  const [message, setMessage] = useState('')
  const { session, isLoading, initializationError } = useAuth()
  function notify(nextMessage: string) {
    setMessage(nextMessage)
    window.setTimeout(() => setMessage(''), 3200)
  }
  if (isLoading) return <Loading label="Checking your session" />
  if (initializationError) return <ErrorState title="Could not check your session" description={userFacingError(initializationError, 'Could not check your session. Please try again.')} />
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  return <div className={`app-shell${assistantOpen ? ' app-shell--assistant' : ''}${chatOpen ? ' app-shell--chat' : ''}${communityGroupOpen ? ' app-shell--community-group' : ''}${storiesOpen ? ' app-shell--stories' : ''}`}>{!chatOpen && !communityGroupOpen && <><Header /><DesktopNavigation /></>}<div className="app-shell__body"><main className="route-content" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={() => { touchStart.current = null }}><Outlet context={{ notify } satisfies ToastApi} /></main></div>{!chatOpen && !communityGroupOpen && <BottomNavigation />}<Toast message={message} onClose={() => setMessage('')} /></div>
}
