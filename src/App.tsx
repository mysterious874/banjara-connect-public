import { Component, lazy, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { BrandMark } from './components/brand'
import { Loading } from './components/ui'

const SplashPage = lazy(() => import('./pages/AuthPages').then(({ SplashPage }) => ({ default: SplashPage })))
const LoginPage = lazy(() => import('./pages/AuthPages').then(({ LoginPage }) => ({ default: LoginPage })))
const SignupPage = lazy(() => import('./pages/AuthPages').then(({ SignupPage }) => ({ default: SignupPage })))
const HomePage = lazy(() => import('./pages/Pages').then(({ HomePage }) => ({ default: HomePage })))
const ConnectPage = lazy(() => import('./pages/Pages').then(({ ConnectPage }) => ({ default: ConnectPage })))
const CommunityPage = lazy(() => import('./pages/Pages').then(({ CommunityPage }) => ({ default: CommunityPage })))
const BanjaraHistoryPage = lazy(() => import('./pages/BanjaraHistoryPage').then(({ BanjaraHistoryPage }) => ({ default: BanjaraHistoryPage })))
const CommunityGroupPage = lazy(() => import('./pages/Pages').then(({ CommunityGroupPage }) => ({ default: CommunityGroupPage })))
const SearchPage = lazy(() => import('./pages/Pages').then(({ SearchPage }) => ({ default: SearchPage })))
const CreatePostPage = lazy(() => import('./pages/Pages').then(({ CreatePostPage }) => ({ default: CreatePostPage })))
const PostDetailsPage = lazy(() => import('./pages/Pages').then(({ PostDetailsPage }) => ({ default: PostDetailsPage })))
const CommentsPage = lazy(() => import('./pages/Pages').then(({ CommentsPage }) => ({ default: CommentsPage })))
const ProfilePage = lazy(() => import('./pages/Pages').then(({ ProfilePage }) => ({ default: ProfilePage })))
const EditProfilePage = lazy(() => import('./pages/Pages').then(({ EditProfilePage }) => ({ default: EditProfilePage })))
const StoriesPage = lazy(() => import('./pages/Pages').then(({ StoriesPage }) => ({ default: StoriesPage })))
const ReelsPage = lazy(() => import('./pages/Pages').then(({ ReelsPage }) => ({ default: ReelsPage })))
const ChatListPage = lazy(() => import('./pages/Pages').then(({ ChatListPage }) => ({ default: ChatListPage })))
const ChatConversationPage = lazy(() => import('./pages/Pages').then(({ ChatConversationPage }) => ({ default: ChatConversationPage })))
const NotificationsPage = lazy(() => import('./pages/Pages').then(({ NotificationsPage }) => ({ default: NotificationsPage })))
const AssistantPage = lazy(() => import('./pages/Pages').then(({ AssistantPage }) => ({ default: AssistantPage })))
const SettingsPage = lazy(() => import('./pages/Pages').then(({ SettingsPage }) => ({ default: SettingsPage })))
const PrivacyPage = lazy(() => import('./pages/Pages').then(({ PrivacyPage }) => ({ default: PrivacyPage })))
const ChangePasswordPage = lazy(() => import('./pages/Pages').then(({ ChangePasswordPage }) => ({ default: ChangePasswordPage })))
const BlockedUsersPage = lazy(() => import('./pages/Pages').then(({ BlockedUsersPage }) => ({ default: BlockedUsersPage })))
const ReportPage = lazy(() => import('./pages/Pages').then(({ ReportPage }) => ({ default: ReportPage })))
const DeleteAccountPage = lazy(() => import('./pages/Pages').then(({ DeleteAccountPage }) => ({ default: DeleteAccountPage })))
const AboutPage = lazy(() => import('./pages/Pages').then(({ AboutPage }) => ({ default: AboutPage })))
const DeveloperPage = lazy(() => import('./pages/DeveloperPage').then(({ DeveloperPage }) => ({ default: DeveloperPage })))
const NotFoundPage = lazy(() => import('./pages/Pages').then(({ NotFoundPage }) => ({ default: NotFoundPage })))

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error('Banjara Connect failed to render:', error)

    // A previous PWA build can remain in the service-worker cache after a rollback.
    // Recover once automatically from stale cached JavaScript instead of trapping
    // the user on the error screen.
    const message = error?.message || ''
    const looksLikeStaleBuild =
      /dynamically imported module|loading chunk|failed to fetch|importing a module script|module script/i.test(message)

    if (looksLikeStaleBuild && window.sessionStorage.getItem('connect-cache-recovery') !== '1') {
      window.sessionStorage.setItem('connect-cache-recovery', '1')
      void (async () => {
        try {
          const registrations = await navigator.serviceWorker?.getRegistrations()
          await Promise.all((registrations ?? []).map((registration) => registration.unregister()))
          if ('caches' in window) {
            const keys = await caches.keys()
            await Promise.all(keys.map((key) => caches.delete(key)))
          }
        } finally {
          window.location.reload()
        }
      })()
    }
  }

  handleRetry = () => {
    window.sessionStorage.removeItem('connect-cache-recovery')
    void (async () => {
      try {
        const registrations = await navigator.serviceWorker?.getRegistrations()
        await Promise.all((registrations ?? []).map((registration) => registration.unregister()))
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((key) => caches.delete(key)))
        }
      } finally {
        window.location.reload()
      }
    })()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="state-block state-block--error" role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '24px' }}>
        <div style={{ maxWidth: '420px', textAlign: 'center' }}>
          <h2>Connect could not load</h2>
          <p>Please reload the app. Your account and data are safe.</p>
          <button className="button button--primary" type="button" onClick={this.handleRetry}>Reload app</button>
        </div>
      </main>
    )
  }
}

export default function App() {
  const navigate = useNavigate()
  const [showStartupIntro, setShowStartupIntro] = useState(() => {
    return window.sessionStorage.getItem('connect-startup-intro-seen') !== '1'
  })

  // Warm the main app route bundle during the intro so the first navigation
  // does not have to wait for the large shared Pages module to download.
  useEffect(() => {
    let timeoutId: number | undefined
    let idleId: number | undefined
    let cancelled = false
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    const preload = () => {
      if (!cancelled) void import('./pages/Pages').catch(() => {})
    }
    if (win.requestIdleCallback) {
      idleId = win.requestIdleCallback(preload, { timeout: 1200 })
    } else {
      timeoutId = window.setTimeout(preload, 800)
    }
    return () => {
      cancelled = true
      if (idleId !== undefined) win.cancelIdleCallback?.(idleId)
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    if (!showStartupIntro) return
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem('connect-startup-intro-seen', '1')
      setShowStartupIntro(false)
      navigate('/home', { replace: true })
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [navigate, showStartupIntro])

  useEffect(() => {
    const applyTheme = () => {
      const saved = window.localStorage.getItem('banjara-theme') || 'light'
      const dark = saved === 'dark' || (saved === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.dataset.theme = saved
      document.documentElement.classList.toggle('theme-dark', dark)
    }
    applyTheme()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener?.('change', applyTheme)
    window.addEventListener('banjara-theme-change', applyTheme)
    return () => {
      media.removeEventListener?.('change', applyTheme)
      window.removeEventListener('banjara-theme-change', applyTheme)
    }
  }, [])


  if (showStartupIntro) {
    return (
      <AppErrorBoundary>
        <Suspense fallback={<Loading label="Loading intro…" />}>
          <SplashPage />
        </Suspense>
      </AppErrorBoundary>
    )
  }

  return (
    <AppErrorBoundary>
      <Suspense fallback={<Loading label="Loading page…" />}>
        <Routes>
          <Route path="/" element={<SplashPage />} />
          <Route path="/splash" element={<SplashPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<AppLayout />}>
            <Route path="home" element={<HomePage />} />
            <Route path="connect" element={<ConnectPage />} />
            <Route path="community" element={<CommunityPage />} />
            <Route path="community/history" element={<BanjaraHistoryPage />} />
            <Route path="community/groups/:groupId" element={<CommunityGroupPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="create" element={<CreatePostPage />} />
            <Route path="posts/:postId" element={<PostDetailsPage />} />
            <Route path="posts/:postId/comments" element={<CommentsPage />} />
            <Route path="profile/:handle?" element={<ProfilePage />} />
            <Route path="edit-profile" element={<EditProfilePage />} />
            <Route path="stories" element={<StoriesPage />} />
            <Route path="reels" element={<ReelsPage />} />
            <Route path="chat" element={<ChatListPage />} />
            <Route path="chat/:conversationId" element={<ChatConversationPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/privacy" element={<PrivacyPage />} />
            <Route path="settings/security" element={<ChangePasswordPage />} />
            <Route path="settings/blocked" element={<BlockedUsersPage />} />
            <Route path="report" element={<ReportPage />} />
            <Route path="settings/delete-account" element={<DeleteAccountPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="about/developer" element={<DeveloperPage />} />
          </Route>
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  )
}
