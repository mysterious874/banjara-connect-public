import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AssistantButton, BottomNavigation, DesktopNavigation, Header } from '../components/navigation'
import { Toast } from '../components/ui'
import type { ToastApi } from '../types/app'

export function AppLayout() {
  const pathname = useLocation().pathname
  const assistantOpen = pathname === '/assistant'
  const chatOpen = pathname.startsWith('/chat/') && pathname !== '/chat'
  const [message, setMessage] = useState('')
  function notify(nextMessage: string) {
    setMessage(nextMessage)
    window.setTimeout(() => setMessage(''), 3200)
  }
  return <div className={`app-shell${assistantOpen ? ' app-shell--assistant' : ''}${chatOpen ? ' app-shell--chat' : ''}`}><Header /><DesktopNavigation /><div className="app-shell__body"><main className="route-content"><Outlet context={{ notify } satisfies ToastApi} /></main></div>{!assistantOpen && !chatOpen && <AssistantButton />}<BottomNavigation /><Toast message={message} onClose={() => setMessage('')} /></div>
}
