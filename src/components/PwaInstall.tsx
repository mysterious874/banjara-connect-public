import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { Button } from './ui'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type PwaInstallContextValue = {
  canPrompt: boolean
  isInstalled: boolean
  promptInstall: () => Promise<boolean>
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null)

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    const standaloneDisplay = window.matchMedia('(display-mode: standalone)').matches
    const iosStandalone = 'standalone' in navigator && navigator.standalone === true
    setIsInstalled(standaloneDisplay || iosStandalone)

    function captureInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }

    function markInstalled() {
      setInstallPrompt(null)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', captureInstallPrompt)
    window.addEventListener('appinstalled', markInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt)
      window.removeEventListener('appinstalled', markInstalled)
    }
  }, [])

  async function promptInstall() {
    if (!installPrompt) return false
    const prompt = installPrompt
    setInstallPrompt(null)
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') setIsInstalled(true)
    return choice.outcome === 'accepted'
  }

  return <PwaInstallContext.Provider value={{ canPrompt: installPrompt !== null, isInstalled, promptInstall }}>{children}</PwaInstallContext.Provider>
}

function usePwaInstall() {
  const context = useContext(PwaInstallContext)
  if (!context) throw new Error('usePwaInstall must be used within PwaInstallProvider.')
  return context
}

export function PwaInstallControl() {
  const { canPrompt, isInstalled, promptInstall } = usePwaInstall()
  const [showInstructions, setShowInstructions] = useState(false)
  const [error, setError] = useState('')

  async function install() {
    setError('')
    if (!canPrompt) {
      setShowInstructions((current) => !current)
      return
    }
    try {
      await promptInstall()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The browser could not open its install prompt.')
    }
  }

  return (
    <section className="settings-group">
      <h2>Install the app</h2>
      <p className="micro-note">Add Banjara Connect to your device for a standalone app experience.</p>
      <Button variant="outline" onClick={install} disabled={isInstalled}>
        <Download size={16} />{isInstalled ? 'App installed' : 'Install Banjara Connect'}
      </Button>
      {showInstructions && !isInstalled && <p className="pwa-install-help" role="status">In Chrome, open the browser menu and choose “Install app” or “Add to Home screen”. On iPhone or iPad, use Share, then “Add to Home Screen”.</p>}
      {error && <p className="field__error" role="alert">{error}</p>}
    </section>
  )
}
