import { lazy, Suspense, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { BrandMark } from './components/brand'

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

export default function App() {
  const [showLaunchIntro, setShowLaunchIntro] = useState(false)

  useEffect(() => {
    const isSplashRoute = window.location.pathname === '/' || window.location.pathname === '/splash'
    if (!isSplashRoute) {
      setShowLaunchIntro(true)
      const timer = window.setTimeout(() => setShowLaunchIntro(false), 4000)
      return () => window.clearTimeout(timer)
    }
  }, [])

  // Warm the main app chunk while the launch intro is visible so route changes do not wait on it.
  useEffect(() => {
    void import('./pages/Pages')
    void import('./pages/BanjaraHistoryPage')
    void import('./pages/DeveloperPage')
  }, [])

  return (
    <>
      <Suspense fallback={<div className="state-block" role="status">Loading page…</div>}>
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
      {showLaunchIntro && (
        <main className="splash" aria-label="Banjara Connect intro">
          <div className="splash__pattern" aria-hidden="true" />
          <div className="splash__content">
            <span className="splash__logo-wrap"><span className="splash__logo-ring" /><BrandMark size="large" /></span>
            <h1>Banjara Connect</h1>
            <span className="splash__line" />
            <p>Apni community. Apni pehchaan. Apna connection.</p>
            <span className="splash__loader" aria-hidden="true"><span /></span>
          </div>
        </main>
      )}
    </>
  )
}
