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
  const touchStart = useRef<{ x: number; y: number; page: HTMLElement | null } | null>(null)
  const [swipeAnimation, setSwipeAnimation] = useState<{ direction: 'next' | 'previous'; offset: string } | null>(null)
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
    if (tabForPath(pathname) < 0 || pathname.startsWith('/chat/') || pathname.startsWith('/community/groups/') || pathname === '/stories') {
      touchStart.current = null
      return
    }
    if (window.innerWidth >= 800 || event.touches.length !== 1) {
      touchStart.current = null
      return
    }
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('input, textarea, select, [contenteditable="true"], .chat-messages, .stories-rail__items, .story-fullscreen, .community-group-members-panel, .community-discover-list, .connect-page, .connect-people-carousel, [data-no-page-swipe]')) {
      touchStart.current = null
      return
    }
    const touch = event.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY, page: event.currentTarget.querySelector('.route-content__page') }
  }
  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current
    if (!start || window.innerWidth >= 800 || event.touches.length !== 1 || !start.page) return
    const touch = event.touches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.1) {
      start.page.style.transition = 'transform 160ms ease-out'
      start.page.style.transform = ''
      start.page.style.opacity = ''
      touchStart.current = null
      window.setTimeout(() => { if (start.page) start.page.style.transition = '' }, 180)
      return
    }
    if (Math.abs(dx) < 3 || Math.abs(dx) < Math.abs(dy) * 1.1) return
    start.page.style.transition = 'none'
    start.page.style.transform = `translate3d(${dx}px, 0, 0)`
  }
  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start || window.innerWidth >= 800 || event.changedTouches.length !== 1) return
    if (pathname.startsWith('/chat/') || pathname.startsWith('/community/groups/') || pathname === '/stories') return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.25) {
      if (start.page) {
        start.page.style.transition = 'transform 180ms cubic-bezier(.22,.7,.25,1)'
        start.page.style.transform = ''
        start.page.style.opacity = ''
        window.setTimeout(() => { if (start.page) start.page.style.transition = '' }, 200)
      }
      return
    }
    const currentTab = tabForPath(pathname)
    if (currentTab < 0) return
    const nextTab = dx < 0 ? currentTab + 1 : currentTab - 1
    if (nextTab < 0 || nextTab >= mainTabs.length) {
      if (start.page) {
        start.page.style.transition = 'transform 200ms cubic-bezier(.22,.7,.25,1)'
        start.page.style.transform = ''
        window.setTimeout(() => { if (start.page) start.page.style.transition = '' }, 220)
      }
      return
    }
    const direction = dx < 0 ? 'next' : 'previous'
    const remaining = Math.max(36, Math.round(window.innerWidth - Math.abs(dx)))
    setSwipeAnimation({ direction, offset: `${direction === 'next' ? remaining : -remaining}px` })
    window.setTimeout(() => setSwipeAnimation(null), 360)
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
  return <div className={`app-shell${assistantOpen ? ' app-shell--assistant' : ''}${chatOpen ? ' app-shell--chat' : ''}${communityGroupOpen ? ' app-shell--community-group' : ''}${storiesOpen ? ' app-shell--stories' : ''}`}>{!chatOpen && !communityGroupOpen && <><Header /><DesktopNavigation /></>}<div className="app-shell__body"><main className="route-content" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={() => { const page = touchStart.current?.page; if (page) { page.style.transition = 'transform 180ms ease-out'; page.style.transform = ''; page.style.opacity = ''; window.setTimeout(() => { if (page) page.style.transition = '' }, 200) }; touchStart.current = null }}><div key={pathname} style={swipeAnimation ? ({ '--swipe-enter-offset': swipeAnimation.offset } as React.CSSProperties) : undefined} className={`route-content__page${swipeAnimation ? ` route-content__page--${swipeAnimation.direction}` : ''}`}><Outlet context={{ notify } satisfies ToastApi} /></div></main></div>{!chatOpen && !communityGroupOpen && <BottomNavigation />}<Toast message={message} onClose={() => setMessage('')} /></div>
}
