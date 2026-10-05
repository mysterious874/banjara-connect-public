import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Compass, Heart, LockKeyhole, MapPin, MoreHorizontal, Plus, Send, ShieldCheck, Sparkles, UserRound, Users, WandSparkles } from 'lucide-react'
import { BrandLockup, BrandMark } from '../components/brand'
import { PostCard, PostComposer } from '../components/feed'
import { SearchBar } from '../components/search'
import { StoriesRail } from '../components/stories'
import { Avatar, Button, ConfirmationDialog, EmptyState, ErrorState, Input, Loading, Tabs } from '../components/ui'
import { UserCard } from '../components/users'
import { usePreviewToast } from '../hooks/usePreviewToast'
import { previewPosts, previewUsers } from '../utils/previewData'

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}

function PreviewNotice({ children = 'FRONTEND PREVIEW · LOCAL SAMPLE CONTENT' }: { children?: ReactNode }) {
  return <div className="preview-notice"><span className="preview-notice__dot" />{children}</div>
}

function CommunityPreviewCard({ name, detail, members, tone }: { name: string; detail: string; members: string; tone: string }) {
  const [joined, setJoined] = useState(false)
  const { notify } = usePreviewToast()
  return <article className="community-preview-card"><span className={`community-preview-card__icon community-preview-card__icon--${tone}`}><Users size={19} /></span><h3>{name}</h3><p>{detail}</p><span className="community-preview-card__members">{members} · sample community</span><Button variant={joined ? 'quiet' : 'outline'} onClick={() => { setJoined(!joined); notify('Community membership is only a local preview.') }}>{joined ? 'Joined in preview' : 'Explore community'}</Button></article>
}

export function SplashPage() {
  const navigate = useNavigate()
  useEffect(() => {
    const timer = window.setTimeout(() => navigate('/home', { replace: true }), 3200)
    return () => window.clearTimeout(timer)
  }, [navigate])
  return <main className="splash"><div className="splash__pattern" aria-hidden="true" /><div className="splash__content"><span className="splash__logo-wrap"><span className="splash__logo-ring" /><BrandMark size="large" /></span><h1>Banjara Connect</h1><span className="splash__line" /><p>Apni community. Apni pehchaan. Apna connection.</p><span className="splash__loader" aria-hidden="true"><span /></span></div></main>
}

export function LoginPage() {
  const navigate = useNavigate()
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); navigate('/home', { replace: true }) }
  return <main className="auth-page"><div className="auth-page__brand"><BrandLockup /></div><div className="auth-card"><PreviewNotice>FRONTEND PREVIEW · SIGN-IN NOT CONNECTED</PreviewNotice><span className="eyebrow">WELCOME BACK</span><h1>Come on in.</h1><p className="auth-card__intro">Your people and their stories are right here.</p><form className="form-stack" onSubmit={submit}><Input label="Email or phone" type="text" autoComplete="username" placeholder="you@example.com" required /><Input label="Password" type="password" autoComplete="current-password" placeholder="Enter your password" required /><Link to="/settings/privacy" className="text-link auth-card__forgot">Need help signing in?</Link><Button type="submit">Continue <ArrowRight size={17} /></Button></form><div className="auth-card__divider"><span>NEW TO THE COMMUNITY?</span></div><Button to="/signup" variant="outline" className="button--full">Create an account</Button><p className="auth-card__foot">Continuing is a visual preview only. No account is created.</p></div></main>
}

export function SignupPage() {
  const navigate = useNavigate()
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); navigate('/home', { replace: true }) }
  return <main className="auth-page"><div className="auth-page__brand"><BrandLockup /></div><div className="auth-card"><PreviewNotice>FRONTEND PREVIEW · REGISTRATION NOT CONNECTED</PreviewNotice><span className="eyebrow">MAKE YOURSELF AT HOME</span><h1>Join the circle.</h1><p className="auth-card__intro">A place for community, culture, and everyday life.</p><form className="form-stack" onSubmit={submit}><Input label="Your name" autoComplete="name" placeholder="Name you go by" required /><Input label="Email address" type="email" autoComplete="email" placeholder="you@example.com" required /><Input label="Create a password" type="password" autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required /><label className="check-row"><input type="checkbox" required /><span>I agree to the community guidelines and privacy notice.</span></label><Button type="submit">Create preview profile <ArrowRight size={17} /></Button></form><p className="auth-card__foot">Your details stay in this form and are not sent anywhere.</p><p className="auth-card__switch">Already part of the circle? <Link to="/login">Sign in</Link></p></div></main>
}

export function HomePage() {
  const { notify } = usePreviewToast()
  const [feedState, setFeedState] = useState('Posts')
  const states = ['Posts', 'Loading', 'Empty', 'Error']
  return (
    <div className="home-grid">
      <div className="home-main">
        <div className="home-intro">
          <div>
            <span className="eyebrow">A LITTLE HELLO FROM YOUR CIRCLE</span>
            <h1>Namaste, Asha <span>✦</span></h1>
            <p>There is always room in the circle.</p>
          </div>
          <div className="home-intro__tools">
            <PreviewNotice />
            <Button to="/assistant" variant="outline" iconOnly aria-label="Open Banjara Assistant" title="Open Banjara Assistant"><WandSparkles size={17} /></Button>
          </div>
        </div>
        <SearchBar />
        <StoriesRail />
        <PostComposer notify={notify} />
        <div className="feed-heading"><div><span className="eyebrow">FROM YOUR COMMUNITY</span><h2>Your feed</h2></div><span className="local-label">LOCAL PREVIEW</span></div>
        <div className="preview-state"><span>Preview state</span><Tabs label="Feed preview state" items={states} value={feedState} onChange={setFeedState} /></div>
        {feedState === 'Loading' ? <Loading label="Loading local preview posts" /> : feedState === 'Empty' ? <EmptyState title="Your circle is quiet" description="There are no sample posts in this view yet." action={<Button to="/connect" variant="outline">Find your people</Button>} /> : feedState === 'Error' ? <ErrorState title="Preview unavailable" description="This local sample feed could not be displayed." /> : <div className="feed-list">{previewPosts.map((post) => <PostCard key={post.id} post={post} notify={notify} />)}</div>}
      </div>
      <aside className="home-aside">
        <section className="aside-section"><div className="aside-section__heading"><h2>People to know</h2><Link className="text-link" to="/connect">More</Link></div><div className="user-list">{previewUsers.slice(0, 2).map((user) => <UserCard key={user.handle} user={user} compact />)}</div></section>
        <section className="community-note"><span className="community-note__symbol">✳</span><div><span className="eyebrow">A NOTE FOR THE CIRCLE</span><p>Carry your stories with pride. Make space for someone else's, too.</p></div></section>
        <Link to="/about" className="aside-about">About Banjara Connect <ChevronRight size={15} /></Link>
      </aside>
    </div>
  )
}

export function ConnectPage() {
  return <section className="page-stack"><PageHeading eyebrow="FIND YOUR CIRCLE" title="Connect" description="Meet community members and discover the places, traditions, and ideas they care about." /><PreviewNotice /><div className="connect-feature"><div className="connect-feature__icon"><Users size={23} /></div><div><span className="eyebrow">COMMUNITY PREVIEW</span><h2>Good things grow together.</h2><p>These suggested profiles are local sample content for the frontend preview.</p></div><Compass className="connect-feature__watermark" size={74} /></div><div className="section-heading"><h2>People you may know</h2><span className="local-label">SAMPLE PROFILES</span></div><div className="connect-list">{previewUsers.map((user) => <UserCard key={user.handle} user={user} />)}</div></section>
}

export function CommunityPage() {
  const [view, setView] = useState('Discover')
  const communities = [
    { name: 'Threads & Traditions', detail: 'Textile craft, family stories, and the skills passed between generations.', members: '24 members', tone: 'maroon' },
    { name: 'Gathering Table', detail: 'Recipes, regional food, and the memories that make a meal.', members: '18 members', tone: 'orange' },
    { name: 'Songs We Carry', detail: 'Music, dance, and songs from across the Banjara community.', members: '31 members', tone: 'cream' },
  ]
  return <section className="page-stack"><PageHeading eyebrow="SHARED INTERESTS, SHARED ROOTS" title="Community" description="Find people gathering around the things they care about." /><PreviewNotice /><Tabs label="Community preview tabs" items={['Discover', 'My Communities', 'Featured']} value={view} onChange={setView} />{view === 'My Communities' ? <EmptyState title="No joined communities" description="Your preview memberships are not saved between visits." /> : <div className="community-preview-grid">{(view === 'Featured' ? communities.slice(0, 2) : communities).map((community) => <CommunityPreviewCard key={community.name} {...community} />)}</div>}<Link to="/community/history" className="community-heritage-link"><span className="community-heritage-link__icon"><BookOpen size={20} /></span><span><strong>Banjara History &amp; Heritage</strong><small>Explore history, language, textile, performance and regional perspectives.</small></span><ChevronRight size={18} /></Link><div className="section-heading"><h2>Upcoming gatherings</h2><span className="local-label">SAMPLE EVENTS</span></div><div className="event-preview"><span className="event-preview__date"><strong>18</strong><small>OCT</small></span><span><strong>Stories from the loom</strong><small>Community circle · Ahmedabad · local preview</small></span><ChevronRight size={17} /></div></section>
}

export function SearchPage() {
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const matches = previewUsers.filter((user) => `${user.name} ${user.handle} ${user.detail}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="page-stack"><PageHeading eyebrow="LOOK A LITTLE CLOSER" title="Search" description="Find people and stories in this local preview." /><SearchBar placeholder="Try a name or place" /><div className="section-heading"><h2>{query ? `Results for “${query}”` : 'Suggested people'}</h2><span className="local-label">PREVIEW CONTENT</span></div>{matches.length ? <div className="connect-list">{matches.map((user) => <UserCard key={user.handle} user={user} />)}</div> : <EmptyState title="No preview matches" description="Try another name or place. Search is limited to local sample profiles." />}</section>
}

export function CreatePostPage() {
  const { notify } = usePreviewToast()
  const [text, setText] = useState('')
  return <section className="page-stack page-stack--narrow"><PageHeading eyebrow="MAKE SOMETHING TOGETHER" title="Create a post" description="Share a thought with your community." /><PreviewNotice>LOCAL DRAFT ONLY · NOTHING IS PUBLISHED</PreviewNotice><div className="create-post-box"><div className="post-card__author"><Avatar name="Asha Rathod" initials="AR" tone="red" /><span><strong>Asha Rathod</strong><span>Sharing with the community</span></span></div><label className="visually-hidden" htmlFor="post-text">Write your post</label><textarea id="post-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="What would you like to share?" maxLength={500} /><div className="create-post-box__footer"><span>{text.length}/500</span><Button onClick={() => notify('This draft is local only. Publishing is not connected.')} disabled={!text.trim()}>Save preview draft <Send size={16} /></Button></div></div></section>
}

export function PostDetailsPage() {
  const { postId = '' } = useParams()
  const { notify } = usePreviewToast()
  const post = previewPosts.find((item) => item.id === postId)
  if (!post) return <section className="page-stack"><PageHeading eyebrow="COMMUNITY POST" title="Post details" /><EmptyState title="This post is not in the preview" description="Try opening a post from the home feed." action={<Button to="/home" variant="outline">Back to feed</Button>} /></section>
  return <section className="page-stack page-stack--narrow"><Button to="/home" variant="quiet"><ArrowLeft size={16} />Back to feed</Button><PageHeading eyebrow="COMMUNITY POST · LOCAL PREVIEW" title="A moment from the circle" /><PostCard post={post} notify={notify} /></section>
}

export function CommentsPage() {
  const { postId = '' } = useParams()
  const post = previewPosts.find((item) => item.id === postId)
  const { notify } = usePreviewToast()
  if (!post) return <section className="page-stack"><PageHeading title="Comments" /><EmptyState title="No preview post found" description="Choose a post from the home feed to see its sample comments." action={<Button to="/home" variant="outline">Back to feed</Button>} /></section>
  const comments = [{ name: 'Lata Rathod', initials: 'LR', tone: 'green', text: 'The detail in this is beautiful. Thank you for sharing this with us.', time: '1h' }, { name: 'Ravi Jadhav', initials: 'RJ', tone: 'blue', text: 'This reminds me of the work my grandmother used to do.', time: '42m' }]
  return <section className="page-stack page-stack--narrow"><Button to={`/posts/${post.id}`} variant="quiet"><ArrowLeft size={16} />Back to post</Button><PageHeading eyebrow="LOCAL PREVIEW COMMENTS" title="The conversation" description={`On ${post.name}'s post`} /><div className="comment-list">{comments.map((comment) => <article className="comment-item" key={comment.name}><Avatar name={comment.name} initials={comment.initials} tone={comment.tone} /><div><div className="comment-item__head"><strong>{comment.name}</strong><span>{comment.time} · preview</span><button type="button" className="icon-button" aria-label="Comment options" onClick={() => notify('Comment options are not connected in this preview.')}><MoreHorizontal size={17} /></button></div><p>{comment.text}</p></div></article>)}</div><form className="comment-compose" onSubmit={(event) => { event.preventDefault(); notify('Comments are not connected in this frontend preview.') }}><Input aria-label="Write a comment" placeholder="Add to the conversation..." /><Button type="submit" iconOnly aria-label="Send preview comment"><Send size={17} /></Button></form><p className="micro-note">Comments shown here are local sample content. New comments are not sent.</p></section>
}

export function ProfilePage() {
  const { handle } = useParams()
  const isOwn = !handle || handle === 'asha-rathod'
  return <section className="page-stack"><div className="profile-cover"><span className="profile-cover__stitch" /><span className="profile-cover__label">COMMUNITY PREVIEW</span></div><div className="profile-summary"><Avatar name={isOwn ? 'Asha Rathod' : 'Meera Pawar'} initials={isOwn ? 'AR' : 'MP'} tone={isOwn ? 'red' : 'orange'} size="large" /><div className="profile-summary__actions">{isOwn ? <Button to="/edit-profile" variant="outline">Edit profile</Button> : <Button variant="outline"><Plus size={16} />Connect</Button>}<Button variant="quiet" iconOnly aria-label="More profile options"><MoreHorizontal size={20} /></Button></div><h1>{isOwn ? 'Asha Rathod' : 'Meera Pawar'}</h1><span className="profile-handle">@{isOwn ? 'asha.rathod' : handle}</span><p>Keeping stories, traditions, and good company close.</p><span className="profile-location"><MapPin size={14} />Ahmedabad, Gujarat · preview profile</span><div className="profile-counts"><span><strong>12</strong> posts</span><span><strong>248</strong> connections</span><span><strong>186</strong> following</span></div></div><div className="section-heading"><h2>Recent posts</h2><span className="local-label">SAMPLE CONTENT</span></div><div className="profile-posts">{previewPosts.slice(0, 2).map((post) => <Link to={`/posts/${post.id}`} key={post.id} className="profile-post-tile">{post.image ? <img src={post.image} alt="" /> : <span className="profile-post-tile__quote">“{post.text.slice(0, 90)}...”</span>}<span><Heart size={15} />{post.likes}</span></Link>)}</div></section>
}

export function EditProfilePage() {
  const { notify } = usePreviewToast()
  return <section className="page-stack page-stack--narrow"><Button to="/profile" variant="quiet"><ArrowLeft size={16} />Profile</Button><PageHeading eyebrow="YOUR INTRODUCTION" title="Edit profile" description="Update the details shown on your preview profile." /><PreviewNotice>PREVIEW ONLY · CHANGES ARE NOT SAVED</PreviewNotice><form className="form-stack" onSubmit={(event) => { event.preventDefault(); notify('Profile changes are preview-only and were not saved.') }}><Input label="Name" defaultValue="Asha Rathod" /><Input label="Username" defaultValue="asha.rathod" /><label className="field"><span className="field__label">About you</span><textarea className="field__control field__textarea" defaultValue="Keeping stories, traditions, and good company close." maxLength={160} /></label><Input label="City" defaultValue="Ahmedabad, Gujarat" /><Button type="submit">Save preview changes <Check size={17} /></Button></form></section>
}

export function StoriesPage() {
  return <section className="page-stack"><PageHeading eyebrow="LITTLE WINDOWS INTO TODAY" title="Stories" description="Short community moments, curated for this frontend preview." /><PreviewNotice /><div className="story-preview-grid">{previewUsers.map((user, index) => <Link to="/home" className={`story-preview story-preview--${user.tone}`} key={user.handle}><div className="story-preview__top"><Avatar name={user.name} initials={user.initials} tone={user.tone} /><span>{user.name}<small>{index + 1}h · sample story</small></span></div><div className="story-preview__center"><span>✳</span><p>{['A stitch, a story, and a slow morning.', 'There is always room for one more at the table.', 'A little color from the weekend gathering.'][index]}</p></div><span className="story-preview__bottom">VIEW SAMPLE STORY <ArrowRight size={14} /></span></Link>)}</div></section>
}

export function ReelsPage() {
  return <section className="page-stack"><PageHeading eyebrow="SHORT COMMUNITY FILMS" title="Reels" description="A small visual preview of stories in motion." /><PreviewNotice /><div className="reel-placeholder"><img src="/loom-preview.svg" alt="Abstract, Banjara-inspired geometric threadwork" /><div className="reel-placeholder__copy"><span className="eyebrow">LOCAL ARTWORK PREVIEW</span><h2>Made by hand,<br />held in memory.</h2><p>Short videos will live here when media is connected.</p><Button to="/about" variant="outline">About the community</Button></div></div></section>
}

export function ChatListPage() {
  return <section className="page-stack"><PageHeading eyebrow="CONVERSATIONS" title="Chat" description="A quiet place for one-to-one conversations." /><PreviewNotice>FRONTEND PREVIEW · MESSAGES ARE NOT CONNECTED</PreviewNotice><div className="chat-list">{previewUsers.map((user, index) => <Link to={`/chat/${user.handle}`} className="chat-row" key={user.handle}><Avatar name={user.name} initials={user.initials} tone={user.tone} /><span className="chat-row__copy"><strong>{user.name}</strong><span>{['Thanks for sharing that story!', 'See you at the gathering this weekend.', 'That song has been in my head all day.'][index]}</span></span><span className="chat-row__time">{index === 0 ? '10:42' : index === 1 ? 'Yesterday' : 'Tue'}</span></Link>)}</div><p className="micro-note">The conversations above are sample UI only. No messages have been sent or received.</p></section>
}

export function ChatConversationPage() {
  const { conversationId = '' } = useParams()
  const { notify } = usePreviewToast()
  const [message, setMessage] = useState('')
  const person = previewUsers.find((user) => user.handle === conversationId)
  if (!person) return <section className="page-stack"><EmptyState title="Conversation not found" description="Choose a sample conversation from your chat list." action={<Button to="/chat" variant="outline">Back to chat</Button>} /></section>
  return <section className="chat-screen"><header className="chat-screen__head"><Button to="/chat" variant="quiet" iconOnly aria-label="Back to chats"><ArrowLeft size={18} /></Button><Avatar name={person.name} initials={person.initials} tone={person.tone} /><span className="chat-screen__identity"><strong>{person.name}</strong><small>Sample conversation · not connected</small></span><Button variant="quiet" iconOnly aria-label="Conversation options" onClick={() => notify('Conversation actions are not connected in this preview.')}><MoreHorizontal size={19} /></Button></header><div className="chat-messages"><p className="chat-date">TODAY · PREVIEW</p><div className="chat-bubble chat-bubble--them">Thanks for sharing that story!<span>10:39</span></div><div className="chat-bubble chat-bubble--you">It means a lot that it resonated.<span>10:42</span></div><div className="chat-system-note"><LockKeyhole size={14} />Sample conversation · messaging is not connected.</div></div><div className="chat-compose-area"><form className="chat-disabled-compose" onSubmit={(event) => { event.preventDefault(); notify('Message not sent. Messaging is not connected.') }}><Input aria-label="Message" placeholder="Write a message (preview only)" value={message} onChange={(event) => setMessage(event.target.value)} /><Button type="submit" disabled={!message.trim()} iconOnly aria-label="Send preview message"><Send size={17} /></Button></form><p className="micro-note">Messages are not sent or saved in this preview.</p></div></section>
}

export function NotificationsPage() {
  const [view, setView] = useState('Activity')
  const notifications = [{ initials: 'MP', tone: 'orange', text: <><strong>Meera Pawar</strong> shared a new story</>, time: '12m', icon: Sparkles }, { initials: 'KR', tone: 'blue', text: <><strong>Kiran Rathod</strong> appreciated your post</>, time: '2h', icon: Heart }, { initials: 'SB', tone: 'red', text: <><strong>Sonal Banjara</strong> invited you to a community gathering</>, time: '1d', icon: Users }]
  return <section className="page-stack"><PageHeading eyebrow="A LITTLE HELLO FROM YOUR CIRCLE" title="Notifications" description="Recent activity in the local preview." /><PreviewNotice /><div className="preview-state"><span>Preview state</span><Tabs label="Notification preview state" items={['Activity', 'Empty']} value={view} onChange={setView} /></div>{view === 'Activity' ? <div className="notification-list">{notifications.map(({ initials, tone, text, time, icon: Icon }) => <article className="notification-row" key={initials}><Avatar name={initials} initials={initials} tone={tone} /><span className="notification-row__icon"><Icon size={15} /></span><p>{text}<small>{time} · sample activity</small></p><ChevronRight size={17} /></article>)}</div> : <EmptyState title="You are all caught up" description="This preview does not receive live notifications." />}</section>
}

export function AssistantPage() {
  const { notify } = usePreviewToast()
  return <section className="assistant-screen" aria-label="Banjara Connect AI preview"><header className="assistant-navbar"><div className="assistant-navbar__inner"><Button to="/home" variant="quiet" iconOnly aria-label="Back to community"><ArrowLeft size={18} /></Button><div className="assistant-brand"><BrandMark size="small" /><span><strong>Ask with AI</strong><small>Banjara Connect AI · preview</small></span></div><Button variant="quiet" iconOnly aria-label="New preview conversation" onClick={() => notify('AI is not connected. No conversation was started.')}><Plus size={17} /></Button></div></header><div className="assistant-shell"><PreviewNotice>AI IS NOT CONNECTED IN THIS PHASE</PreviewNotice><div className="assistant-messages"><div className="assistant-welcome"><BrandMark size="large" /><h1>What can I help you with?</h1><p>This visual preview does not generate answers or send messages to an AI service.</p></div></div><div className="assistant-prompts"><button type="button" onClick={() => notify('Assistant suggestions are placeholders in this preview.')}>Community resources <ArrowRight size={15} /></button><button type="button" onClick={() => notify('Assistant suggestions are placeholders in this preview.')}>Banjara history & culture <ArrowRight size={15} /></button><button type="button" onClick={() => notify('Assistant suggestions are placeholders in this preview.')}>Find a local gathering <ArrowRight size={15} /></button></div><form className="assistant-compose" onSubmit={(event) => { event.preventDefault(); notify('The assistant is not connected. Your message was not sent.') }}><Input aria-label="Ask the assistant" placeholder="Assistant is unavailable in this preview" disabled /><Button type="submit" disabled iconOnly aria-label="Send question"><Send size={18} /></Button></form></div></section>
}

const settingsGroups = [
  { heading: 'Your account', items: [{ to: '/edit-profile', icon: UserRound, title: 'Edit profile', detail: 'Name, username, and introduction' }, { to: '/settings/privacy', icon: ShieldCheck, title: 'Privacy & security', detail: 'Visibility and account safety' }, { to: '/settings/blocked', icon: LockKeyhole, title: 'Blocked users', detail: 'Manage blocked preview profiles' }] },
  { heading: 'More', items: [{ to: '/report', icon: CircleHelp, title: 'Report a concern', detail: 'Tell us what needs attention' }, { to: '/settings/delete-account', icon: UserRound, title: 'Account deletion', detail: 'Preview account options' }, { to: '/about', icon: Compass, title: 'About Banjara Connect', detail: 'The idea behind this community' }] },
]

export function SettingsPage() {
  return <section className="page-stack"><PageHeading eyebrow="MAKE IT YOURS" title="Settings" description="Manage your preferences in the local preview." /><PreviewNotice />{settingsGroups.map((group) => <section className="settings-group" key={group.heading}><h2>{group.heading}</h2>{group.items.map(({ to, icon: Icon, title, detail }) => <Link className="settings-row" to={to} key={to}><span className="settings-row__icon"><Icon size={18} /></span><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={18} /></Link>)}</section>)}</section>
}

export function PrivacyPage() {
  const [privateProfile, setPrivateProfile] = useState(false)
  const [activityStatus, setActivityStatus] = useState(true)
  return <section className="page-stack page-stack--narrow"><Button to="/settings" variant="quiet"><ArrowLeft size={16} />Settings</Button><PageHeading eyebrow="YOUR SPACE, YOUR CHOICE" title="Privacy & security" description="Preference switches are stored only in this page preview." /><PreviewNotice>LOCAL UI STATE · NO ACCOUNT SETTINGS ARE SAVED</PreviewNotice><div className="settings-group"><h2>Profile visibility</h2><div className="preference-row"><span><strong>Private profile</strong><small>Only people you approve can see your posts.</small></span><button type="button" className={`toggle${privateProfile ? ' is-on' : ''}`} role="switch" aria-checked={privateProfile} aria-label="Private profile" onClick={() => setPrivateProfile(!privateProfile)}><span /></button></div><div className="preference-row"><span><strong>Show activity status</strong><small>Let connections know when you are around.</small></span><button type="button" className={`toggle${activityStatus ? ' is-on' : ''}`} role="switch" aria-checked={activityStatus} aria-label="Show activity status" onClick={() => setActivityStatus(!activityStatus)}><span /></button></div></div><div className="settings-group"><h2>Safety</h2><Link className="settings-row" to="/settings/blocked"><span className="settings-row__icon"><LockKeyhole size={18} /></span><span><strong>Blocked users</strong><small>Review sample blocked accounts</small></span><ChevronRight size={18} /></Link><Link className="settings-row" to="/report"><span className="settings-row__icon"><CircleHelp size={18} /></span><span><strong>Report a concern</strong><small>Let the team know what feels wrong</small></span><ChevronRight size={18} /></Link></div></section>
}

export function BlockedUsersPage() {
  const [blocked, setBlocked] = useState(['sample.profile'])
  return <section className="page-stack page-stack--narrow"><Button to="/settings/privacy" variant="quiet"><ArrowLeft size={16} />Privacy & security</Button><PageHeading eyebrow="YOUR SAFETY" title="Blocked users" description="Manage sample profiles in this frontend preview." /><PreviewNotice /><div className="connect-list">{blocked.length ? blocked.map((handle) => <div className="blocked-row" key={handle}><Avatar name={handle} initials="SP" tone="blue" /><span><strong>{handle}</strong><small>Sample blocked profile</small></span><Button variant="outline" onClick={() => setBlocked(blocked.filter((item) => item !== handle))}>Unblock</Button></div>) : <EmptyState title="No blocked profiles" description="There are no sample users in your blocked list." />}</div></section>
}

export function ReportPage() {
  const { notify } = usePreviewToast()
  return <section className="page-stack page-stack--narrow"><PageHeading eyebrow="HELP KEEP THE CIRCLE KIND" title="Report a concern" description="Choose a topic to preview the reporting form." /><PreviewNotice>REPORTING IS NOT CONNECTED · NOTHING WILL BE SENT</PreviewNotice><form className="form-stack" onSubmit={(event) => { event.preventDefault(); notify('Your report was not sent. Reporting is not connected in this preview.') }}><label className="field"><span className="field__label">What is this about?</span><select className="field__control" defaultValue=""><option value="" disabled>Select a reason</option><option>Someone's post</option><option>A profile</option><option>A safety concern</option><option>Something else</option></select></label><label className="field"><span className="field__label">A few details</span><textarea className="field__control field__textarea" placeholder="Add context for the preview form" maxLength={500} /></label><Button type="submit">Preview report form <ArrowRight size={16} /></Button></form></section>
}

export function DeleteAccountPage() {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { notify } = usePreviewToast()
  return <section className="page-stack page-stack--narrow"><Button to="/settings" variant="quiet"><ArrowLeft size={16} />Settings</Button><PageHeading eyebrow="ACCOUNT OPTIONS" title="Account deletion" description="This screen previews the information a future account flow might show." /><PreviewNotice>NO ACCOUNT EXISTS · DELETION IS NOT AVAILABLE</PreviewNotice><div className="warning-panel"><LockKeyhole size={20} /><div><strong>Nothing will be deleted</strong><p>This frontend has no accounts or server connection. The confirmation below is for visual review only.</p></div></div><Button variant="danger" onClick={() => setConfirmOpen(true)}>Preview deletion confirmation</Button><ConfirmationDialog open={confirmOpen} title="Delete preview account?" description="This is only a UI preview. No account or data will be deleted." confirmLabel="Close preview" onClose={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); notify('No account was deleted. This is a frontend preview.') }} /></section>
}

export function AboutPage() {
  const priorities = [
    { title: 'Connection', text: 'Discover community members and shared interests.' },
    { title: 'History & heritage', text: 'Make regional histories and traditions easier to explore.' },
    { title: 'Stories & experience', text: 'Create space for first-person memories and lived knowledge.' },
    { title: 'Knowledge sharing', text: 'Support exchange across generations and regions.' },
    { title: 'Youth participation', text: 'Invite younger community members into discovery and contribution.' },
    { title: 'Community discovery', text: 'Help people find groups, gatherings and cultural resources.' },
    { title: 'Digital networking', text: 'Connect people while respecting local identities and context.' },
    { title: 'Respectful interaction', text: 'Keep safety, consent and inclusion central to community life.' },
  ]
  return <section className="page-stack page-stack--narrow"><PageHeading eyebrow="A COMMUNITY, MADE WITH CARE" title="About Banjara Connect" description="A digital space for community connection, cultural memory and shared knowledge." /><Button to="/about/developer" variant="outline">Meet the developer <ArrowRight size={16} /></Button><div className="about-brand"><BrandMark size="large" /><span>BUILT TO CONNECT. BUILT TO PRESERVE.</span></div><div className="about-copy"><p>Banjara Connect is designed to help people discover one another, share experiences and learn about Banjara history and heritage. It brings community discovery, stories and digital communication together in one place.</p><p>The platform aims to support youth participation and knowledge sharing while encouraging safe, respectful interaction. Cultural knowledge belongs to the people and communities who carry it; this project does not claim to represent every Banjara community.</p></div><div className="about-focus-grid">{priorities.map((item) => <article className="about-focus" key={item.title}><strong>{item.title}</strong><p>{item.text}</p></article>)}</div><div className="about-values"><span><Heart size={17} />Belonging</span><span><Sparkles size={17} />Living culture</span><span><Users size={17} />Community</span></div><Button to="/home" variant="outline">Back to community <ArrowRight size={16} /></Button></section>
}

export function NotFoundPage() {
  return <main className="not-found"><BrandLockup /><span className="not-found__number">404</span><h1>We lost the trail.</h1><p>This page is not part of the preview yet.</p><Button to="/home">Back to home <ArrowRight size={16} /></Button></main>
}
