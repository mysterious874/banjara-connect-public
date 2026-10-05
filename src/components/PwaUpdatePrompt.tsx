import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisterError(error) {
      console.error('Service worker registration failed:', error)
      setRegistrationError('Offline support could not be started. The app remains available online.')
    },
  })

  if (!needRefresh && !registrationError) return null

  return (
    <aside className="pwa-status" aria-live="polite" aria-label="App update status">
      {needRefresh ? (
        <>
          <p>A new version of Banjara Connect is ready.</p>
          <button className="button" onClick={() => void updateServiceWorker(true)}>
            Update app
          </button>
        </>
      ) : (
        <>
          <p>{registrationError}</p>
          <button className="button button--quiet" onClick={() => setRegistrationError(null)}>
            Dismiss
          </button>
        </>
      )}
    </aside>
  )
}
