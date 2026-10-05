import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import {
  AboutPage,
  AssistantPage,
  BlockedUsersPage,
  ChatConversationPage,
  ChatListPage,
  CommentsPage,
  CommunityPage,
  ConnectPage,
  CreatePostPage,
  DeleteAccountPage,
  EditProfilePage,
  HomePage,
  LoginPage,
  NotFoundPage,
  NotificationsPage,
  PostDetailsPage,
  PrivacyPage,
  ProfilePage,
  ReportPage,
  ReelsPage,
  SearchPage,
  SettingsPage,
  SignupPage,
  SplashPage,
  StoriesPage,
} from './pages/Pages'
import { DeveloperPage } from './pages/DeveloperPage'
import { BanjaraHistoryPage } from './pages/BanjaraHistoryPage'

export default function App() {
  return (
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
        <Route path="settings/blocked" element={<BlockedUsersPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="settings/delete-account" element={<DeleteAccountPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="about/developer" element={<DeveloperPage />} />
      </Route>
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
