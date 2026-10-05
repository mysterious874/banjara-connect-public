import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { BottomNavigation, DesktopNavigation, Header } from '../components/navigation'
import { ErrorState, Loading, Toast } from '../components/ui'
import { useAuth } from '../hooks/AuthProvider'
import type { ToastApi } from '../types/app'

export function AppLayout() {
  const location = useLocation()
  const pathname = location.pathname
  const assistantOpen = pathname === '/assistant'
  const chatOpen = pathname.startsWith('/chat/') && pathname !== '/chat'
  const [message, setMessage] = useState('')
  const { session, isLoading, initializationError } = useAuth()
  function notify(nextMessage: string) {
    setMessage(nextMessage)
    window.setTimeout(() => setMessage(''), 3200)
  }
  if (isLoading) return <Loading label="Checking your session" />
  if (initializationError) return <ErrorState title="Could not check your session" description={initializationError} />
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  return <div className={`app-shell${assistantOpen ? ' app-shell--assistant' : ''}${chatOpen ? ' app-shell--chat' : ''}`}><Header /><DesktopNavigation /><div className="app-shell__body"><main className="route-content"><Outlet context={{ notify } satisfies ToastApi} /></main></div><BottomNavigation /><Toast message={message} onClose={() => setMessage('')} /></div>
}
