import { useCallback, useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const lastUpdateCheckAt = useRef(0)
  const checkForUpdate = useCallback(() => {
    const registration = registrationRef.current
    if (!registration || document.visibilityState !== 'visible' || Date.now() - lastUpdateCheckAt.current < 30_000) return
    lastUpdateCheckAt.current = Date.now()
    void registration.update().catch((error: unknown) => {
      console.warn('Could not check for an app update:', error)
    })
  }, [])
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration || typeof window === 'undefined') return
      registrationRef.current = registration
      checkForUpdate()
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error)
      setRegistrationError('App update checks could not start. You can keep using Connect online.')
    },
  })

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }
    window.addEventListener('focus', handleVisible)
    document.addEventListener('visibilitychange', handleVisible)
    return () => {
      window.removeEventListener('focus', handleVisible)
      document.removeEventListener('visibilitychange', handleVisible)
      registrationRef.current = null
    }
  }, [checkForUpdate])

  async function applyUpdate() {
    setIsUpdating(true)
    setRegistrationError(null)
    try {
      await updateServiceWorker(true)
    } catch (error) {
      console.error('Could not apply the app update:', error)
      setRegistrationError('The app could not update. Please try again while online.')
      setIsUpdating(false)
    }
  }

  if (!needRefresh && !registrationError) return null

  return (
    <aside className="pwa-status" aria-live="polite" aria-label="App update status">
      {needRefresh ? (
        <>
          <p>New update available for Connect.</p>
          <button className="button" onClick={() => void applyUpdate()} disabled={isUpdating}>
            {isUpdating ? 'Updating…' : 'Update now'}
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
