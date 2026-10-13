import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration || typeof window === 'undefined') return

      // Check for newly deployed versions while the website stays open.
      // The browser still controls whether the worker can be installed.
      const checkForUpdate = () => {
        void registration.update().catch((error) => {
          console.warn('Could not check for an app update:', error)
        })
      }
      checkForUpdate()
      window.setInterval(checkForUpdate, 60_000)
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error)
      setRegistrationError('App update checks could not start. You can keep using Connect online.')
    },
  })

  if (!needRefresh && !registrationError) return null

  return (
    <aside className="pwa-status" aria-live="polite" aria-label="App update status">
      {needRefresh ? (
        <>
          <p>New update available for Connect.</p>
          <button className="button" onClick={() => void updateServiceWorker(true)}>
            Update now
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
