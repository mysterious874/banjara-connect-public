import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Compass, Heart, LockKeyhole, MapPin, MessageCircle, Plus, Send, ShieldCheck, Sparkles, UserRound, Users, WandSparkles } from 'lucide-react'
import { BrandLockup, BrandMark } from '../components/brand'
import { PostCard, PostComposer } from '../components/feed'
import { SearchBar } from '../components/search'
import { StoriesRail } from '../components/stories'
import { Avatar, Button, ConfirmationDialog, EmptyState, ErrorState, Input, Loading, Tabs } from '../components/ui'
import { UserCard } from '../components/users'
import { useAuth } from '../hooks/AuthProvider'
import { usePreviewToast } from '../hooks/usePreviewToast'
import { previewUsers } from '../utils/previewData'
import { loadBlockState, loadBlockedUserIds, toggleBlock } from '../utils/blockData'
import { loadPost, loadPosts } from '../utils/postData'
import { filterProfiles, loadProfiles } from '../utils/profileData'
import { getOrCreateConversation } from '../utils/chatData'
import { supabase } from '../utils/supabase'
import { loadNotifications, markNotificationRead, type NotificationRecord } from '../utils/notificationData'
import { createReport } from '../utils/reportData'
import type { FeedPost, ProfileRecord } from '../types/app'
import { loadConversationMessages, loadConversationPeer, loadConversations, sendConversationMessage, subscribeToConversation, type ChatMessage } from '../utils/chatData'
import { createComment, loadCommentLikes, loadComments, toggleCommentLike, type CommentRecord } from '../utils/socialData'

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
  const location = useLocation()
  const { session } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/home'

  useEffect(() => {
    if (session) navigate(destination, { replace: true })
  }, [destination, navigate, session])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    const login = identifier.trim()
    const credentials = login.includes('@') ? { email: login, password } : { phone: login, password }
    const { error: authError } = await supabase.auth.signInWithPassword(credentials)
    setIsSubmitting(false)
    if (authError) {
      setError(authError.message)
      return
    }
    navigate(destination, { replace: true })
  }

  return <main className="auth-page"><div className="auth-page__brand"><BrandLockup /></div><div className="auth-card"><span className="eyebrow">WELCOME BACK</span><h1>Come on in.</h1><p className="auth-card__intro">Your people and their stories are right here.</p><form className="form-stack" onSubmit={submit}><Input label="Email or phone" type="text" autoComplete="username" placeholder="you@example.com" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required /><Input label="Password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />{error && <p className="field__error" role="alert">{error}</p>}<Link to="/settings/privacy" className="text-link auth-card__forgot">Need help signing in?</Link><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Continue'} {!isSubmitting && <ArrowRight size={17} />}</Button></form><div className="auth-card__divider"><span>NEW TO THE COMMUNITY?</span></div><Button to="/signup" variant="outline" className="button--full">Create an account</Button></div></main>
}

export function SignupPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (session) navigate('/home', { replace: true })
  }, [navigate, session])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    })
    setIsSubmitting(false)
    if (authError) {
      setError(authError.message)
      return
    }
    if (data.session) {
      navigate('/home', { replace: true })
      return
    }
    setNotice('Check your email to confirm your account before signing in.')
  }

  return <main className="auth-page"><div className="auth-page__brand"><BrandLockup /></div><div className="auth-card"><span className="eyebrow">MAKE YOURSELF AT HOME</span><h1>Join the circle.</h1><p className="auth-card__intro">A place for community, culture, and everyday life.</p><form className="form-stack" onSubmit={submit}><Input label="Your name" autoComplete="name" placeholder="Name you go by" value={name} onChange={(event) => setName(event.target.value)} required /><Input label="Email address" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /><Input label="Create a password" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /><label className="check-row"><input type="checkbox" required /><span>I agree to the community guidelines and privacy notice.</span></label>{error && <p className="field__error" role="alert">{error}</p>}{notice && <p className="micro-note" role="status">{notice}</p>}<Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'} {!isSubmitting && <ArrowRight size={17} />}</Button></form><p className="auth-card__switch">Already part of the circle? <Link to="/login">Sign in</Link></p></div></main>
}

export function HomePage() {
  const { profile, isProfileLoading, profileError, session } = useAuth()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isPostsLoading, setIsPostsLoading] = useState(true)
  const [postsError, setPostsError] = useState('')
  const [people, setPeople] = useState<ProfileRecord[]>([])
  const [isPeopleLoading, setIsPeopleLoading] = useState(true)
  const [peopleError, setPeopleError] = useState('')

  useEffect(() => {
    let active = true
    if (!session?.user) {
      setPeople([])
      setIsPeopleLoading(false)
      return () => { active = false }
    }
    setIsPeopleLoading(true)
    loadProfiles().then((nextPeople) => {
      if (active) setPeople(nextPeople)
    }).catch((error: unknown) => {
      if (active) setPeopleError(error instanceof Error ? error.message : 'Could not load profiles.')
    }).finally(() => {
      if (active) setIsPeopleLoading(false)
    })
    return () => { active = false }
  }, [session?.user.id])

  useEffect(() => {
    let active = true
    if (!session?.user) {
      setPosts([])
      setIsPostsLoading(false)
      return () => { active = false }
    }
    setIsPostsLoading(true)
    setPostsError('')
    void (async () => {
      try {
        const blockedIds = await loadBlockedUserIds()
        const nextPosts = await loadPosts({ excludeUserIds: blockedIds })
        if (active) setPosts(nextPosts)
      } catch (error) {
        if (active) setPostsError(error instanceof Error ? error.message : 'Could not load posts.')
      } finally {
        if (active) setIsPostsLoading(false)
      }
    })()
    return () => { active = false }
  }, [session?.user.id])

  return (
    <div className="home-grid">
      <div className="home-main">
        <div className="home-intro">
          <div>
            <span className="eyebrow">A LITTLE HELLO FROM YOUR CIRCLE</span>
            <h1>{isProfileLoading ? 'Loading your profile…' : `Namaste, ${profile?.display_name || profile?.username || 'there'}`} <span>✦</span></h1>
            <p>There is always room in the circle.</p>
            {profileError && <p className="field__error" role="alert">{profileError}</p>}
          </div>
          <div className="home-intro__tools">
            <Button to="/assistant" variant="outline" iconOnly aria-label="Open Banjara Assistant" title="Open Banjara Assistant"><WandSparkles size={17} /></Button>
          </div>
        </div>
        <SearchBar />
        <StoriesRail />
        <PostComposer name={profile?.display_name || profile?.username || session?.user.email || 'Your profile'} image={profile?.avatar_url} />
        <div className="feed-heading"><div><span className="eyebrow">FROM YOUR COMMUNITY</span><h2>Your feed</h2></div></div>
        {isPostsLoading ? <Loading label="Loading posts" /> : postsError ? <ErrorState title="Could not load posts" description={postsError} /> : posts.length === 0 ? <EmptyState title="No posts yet" description="Posts shared with your community will appear here." action={<Button to="/create" variant="outline">Create a post</Button>} /> : <div className="feed-list">{posts.map((post) => <PostCard key={post.id} post={post} />)}</div>}
      </div>
      <aside className="home-aside">
        <section className="aside-section"><div className="aside-section__heading"><h2>People to know</h2><Link className="text-link" to="/connect">More</Link></div>{isPeopleLoading ? <Loading label="Loading profiles" /> : peopleError ? <p className="field__error" role="alert">{peopleError}</p> : <div className="user-list">{people.slice(0, 2).map((user) => <UserCard key={user.id} user={user} compact />)}</div>}</section>
        <section className="community-note"><span className="community-note__symbol">✳</span><div><span className="eyebrow">A NOTE FOR THE CIRCLE</span><p>Carry your stories with pride. Make space for someone else's, too.</p></div></section>
        <Link to="/about" className="aside-about">About Banjara Connect <ChevronRight size={15} /></Link>
      </aside>
    </div>
  )
}

export function ConnectPage() {
  const { session } = useAuth()
  const [people, setPeople] = useState<ProfileRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!session?.user) return () => { active = false }
    setIsLoading(true)
    loadProfiles().then((nextPeople) => { if (active) setPeople(nextPeople) }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Could not load profiles.') }).finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [session?.user.id])
  return <section className="page-stack"><PageHeading eyebrow="FIND YOUR CIRCLE" title="Connect" description="Meet community members and discover the places, traditions, and ideas they care about." /><div className="connect-feature"><div className="connect-feature__icon"><Users size={23} /></div><div><span className="eyebrow">YOUR COMMUNITY</span><h2>Good things grow together.</h2><p>Discover members and shared interests.</p></div><Compass className="connect-feature__watermark" size={74} /></div><div className="section-heading"><h2>People you may know</h2></div>{isLoading ? <Loading label="Loading profiles" /> : error ? <ErrorState title="Could not load profiles" description={error} /> : people.length ? <div className="connect-list">{people.map((user) => <UserCard key={user.id} user={user} />)}</div> : <EmptyState title="No profiles to show" description="Other community profiles will appear here when available." />}</section>
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
  const { session } = useAuth()
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!session?.user) return () => { active = false }
    setIsLoading(true)
    loadProfiles().then((nextProfiles) => { if (active) setProfiles(nextProfiles) }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Could not search profiles.') }).finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [session?.user.id])
  const matches = filterProfiles(profiles, query)
  return <section className="page-stack"><PageHeading eyebrow="LOOK A LITTLE CLOSER" title="Search" description="Find community profiles." /><SearchBar placeholder="Try a name or place" /><div className="section-heading"><h2>{query ? `Results for “${query}”` : 'Suggested profiles'}</h2></div>{isLoading ? <Loading label="Searching profiles" /> : error ? <ErrorState title="Could not search profiles" description={error} /> : matches.length ? <div className="connect-list">{matches.map((user) => <UserCard key={user.id} user={user} />)}</div> : <EmptyState title="No profiles found" description="Try another name or place." />}</section>
}

export function CreatePostPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const { profile } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session?.user) {
      setError('Sign in before creating a post.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const { data, error: insertError } = await supabase.from('posts').insert({
        user_id: session.user.id,
        content: text.trim(),
      }).select('id').single()
      if (insertError) {
        setError(insertError.message)
        return
      }
      navigate(`/posts/${data.id}`, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create your post.')
    } finally {
      setIsSaving(false)
    }
  }

  return <section className="page-stack page-stack--narrow"><PageHeading eyebrow="MAKE SOMETHING TOGETHER" title="Create a post" description="Share a thought with your community." /><form className="create-post-box" onSubmit={submit}><div className="post-card__author"><Avatar name={profile?.display_name || profile?.username || 'Your profile'} image={profile?.avatar_url ?? undefined} /><span><strong>{profile?.display_name || profile?.username || 'Your profile'}</strong><span>Sharing with the community</span></span></div><label className="visually-hidden" htmlFor="post-text">Write your post</label><textarea id="post-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="What would you like to share?" maxLength={500} required /><div className="create-post-box__footer"><span>{text.length}/500</span><Button type="submit" disabled={!text.trim() || isSaving}>{isSaving ? 'Publishing…' : 'Publish post'} {!isSaving && <Send size={16} />}</Button></div>{error && <p className="field__error" role="alert">{error}</p>}</form></section>
}

export function PostDetailsPage() {
  const { postId = '' } = useParams()
  const [post, setPost] = useState<FeedPost | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError('')
    loadPost(postId).then((nextPost) => {
      if (active) setPost(nextPost)
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Could not load this post.')
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [postId])

  if (isLoading) return <section className="page-stack"><Loading label="Loading post" /></section>
  if (error) return <section className="page-stack"><ErrorState title="Could not load post" description={error} /></section>
  if (!post) return <section className="page-stack"><EmptyState title="Post not found" description="This post may have been removed or is not available to your account." action={<Button to="/home" variant="outline">Back to feed</Button>} /></section>
  return <section className="page-stack page-stack--narrow"><Button to="/home" variant="quiet"><ArrowLeft size={16} />Back to feed</Button><PageHeading eyebrow="COMMUNITY POST" title="Post details" /><PostCard post={post} /></section>
}

export function CommentsPage() {
  const { postId = '' } = useParams()
  const { session } = useAuth()
  const [post, setPost] = useState<FeedPost | null>(null)
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [commentLikes, setCommentLikes] = useState<Record<string, { count: number; liked: boolean }>>({})
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingLikeIds, setPendingLikeIds] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError('')
    Promise.all([loadPost(postId), loadComments(postId)]).then(([nextPost, nextComments]) => {
      if (!active) return
      setPost(nextPost)
      setComments(nextComments)
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Could not load this conversation.')
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [postId])

  useEffect(() => {
    let active = true
    if (!session?.user || comments.length === 0) {
      setCommentLikes({})
      return () => { active = false }
    }
    loadCommentLikes(comments.map((comment) => comment.id)).then((likes) => {
      if (!active) return
      setCommentLikes(Object.fromEntries(likes))
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Could not load comment likes.')
    })
    return () => { active = false }
  }, [comments, session?.user.id])

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!content.trim() || isSubmitting) return
    setIsSubmitting(true)
    setError('')
    try {
      const refreshedComments = await createComment(postId, content)
      setComments(refreshedComments)
      setContent('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send this comment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function toggleLike(comment: CommentRecord) {
    if (!session?.user || pendingLikeIds.includes(comment.id)) return
    const current = commentLikes[comment.id] ?? { count: 0, liked: false }
    setPendingLikeIds((currentIds) => [...currentIds, comment.id])
    setError('')
    try {
      const next = await toggleCommentLike(comment.id, current.liked)
      setCommentLikes((currentLikes) => ({ ...currentLikes, [comment.id]: next }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this comment like.')
    } finally {
      setPendingLikeIds((currentIds) => currentIds.filter((id) => id !== comment.id))
    }
  }

  if (isLoading) return <section className="page-stack"><Loading label="Loading comments" /></section>
  if (error && !post) return <section className="page-stack"><ErrorState title="Could not load comments" description={error} /></section>
  if (!post) return <section className="page-stack"><EmptyState title="Post not found" description="This post is not available." /></section>
  const postAuthor = post.author?.display_name || post.author?.username || 'community post'

  return <section className="page-stack page-stack--narrow"><Button to={`/posts/${post.id}`} variant="quiet"><ArrowLeft size={16} />Back to post</Button><PageHeading eyebrow="COMMUNITY COMMENTS" title="The conversation" description={`On ${postAuthor}'s post`} />{error && <p className="field__error" role="alert">{error}</p>}<div className="comment-list">{comments.length ? comments.map((comment) => { const like = commentLikes[comment.id] ?? { count: 0, liked: false }; const authorName = comment.author?.display_name || comment.author?.username || 'Community member'; return <article className="comment-item" key={comment.id}><Avatar name={authorName} image={comment.author?.avatar_url ?? undefined} /><div><div className="comment-item__head"><strong>{authorName}</strong><span>{new Date(comment.created_at).toLocaleString()}</span><button type="button" className={`post-action${like.liked ? ' is-liked' : ''}`} aria-pressed={like.liked} disabled={pendingLikeIds.includes(comment.id)} onClick={() => toggleLike(comment)}><Heart size={16} fill={like.liked ? 'currentColor' : 'none'} />{like.count}</button></div><p>{comment.content}</p></div></article>}) : <EmptyState title="No comments yet" description="Start the conversation." />}</div><form className="comment-compose" onSubmit={submitComment}><Input aria-label="Write a comment" placeholder="Add to the conversation..." value={content} onChange={(event) => setContent(event.target.value)} /><Button type="submit" iconOnly aria-label="Send comment" disabled={!content.trim() || isSubmitting}>{isSubmitting ? '…' : <Send size={17} />}</Button></form></section>
}

export function ProfilePage() {
  const navigate = useNavigate()
  const { handle } = useParams()
  const { session, profile: ownProfile, isProfileLoading, profileError } = useAuth()
  const [otherProfile, setOtherProfile] = useState<ProfileRecord | null>(null)
  const [isOtherProfileLoading, setIsOtherProfileLoading] = useState(false)
  const [otherProfileError, setOtherProfileError] = useState('')
  const [profilePosts, setProfilePosts] = useState<FeedPost[]>([])
  const [isProfilePostsLoading, setIsProfilePostsLoading] = useState(false)
  const [profilePostsError, setProfilePostsError] = useState('')
  const [isBlocked, setIsBlocked] = useState(false)
  const [isBlockLoading, setIsBlockLoading] = useState(true)
  const [isBlockPending, setIsBlockPending] = useState(false)
  const [blockError, setBlockError] = useState('')
  const [isStartingConversation, setIsStartingConversation] = useState(false)
  const isOwn = !handle || handle === session?.user.id || handle === ownProfile?.username

  useEffect(() => {
    let active = true
    if (isOwn || !handle) {
      setOtherProfile(null)
      setOtherProfileError('')
      setIsOtherProfileLoading(false)
      return () => { active = false }
    }

    setIsOtherProfileLoading(true)
    setOtherProfileError('')
    void (async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('id,username,display_name,avatar_url,bio,location,is_verified').eq('username', handle).maybeSingle()
        if (!active) return
        setOtherProfile(data as ProfileRecord | null)
        setOtherProfileError(error?.message ?? '')
      } catch (error) {
        if (active) setOtherProfileError(error instanceof Error ? error.message : 'Could not load this profile.')
      } finally {
        if (active) setIsOtherProfileLoading(false)
      }
    })()

    return () => { active = false }
  }, [handle, isOwn, session?.user.id])

  const profile = isOwn ? ownProfile : otherProfile
  useEffect(() => {
    let active = true
    if (!profile || isOwn) {
      setIsBlocked(false)
      setIsBlockLoading(false)
      return () => { active = false }
    }
    setIsBlockLoading(true)
    setBlockError('')
    loadBlockState(profile.id).then((state) => {
      if (active) setIsBlocked(state.blocked)
    }).catch((caught: unknown) => {
      if (active) setBlockError(caught instanceof Error ? caught.message : 'Could not load block state.')
    }).finally(() => {
      if (active) setIsBlockLoading(false)
    })
    return () => { active = false }
  }, [isOwn, profile?.id])

  useEffect(() => {
    let active = true
    if (!profile) {
      setProfilePosts([])
      setIsProfilePostsLoading(false)
      return () => { active = false }
    }
    if (!isOwn && isBlockLoading) {
      setIsProfilePostsLoading(true)
      return () => { active = false }
    }
    if (!isOwn && isBlocked) {
      setProfilePosts([])
      setIsProfilePostsLoading(false)
      return () => { active = false }
    }
    setIsProfilePostsLoading(true)
    setProfilePostsError('')
    loadPosts({ userId: profile.id }).then((nextPosts) => {
      if (active) setProfilePosts(nextPosts)
    }).catch((error: unknown) => {
      if (active) setProfilePostsError(error instanceof Error ? error.message : 'Could not load profile posts.')
    }).finally(() => {
      if (active) setIsProfilePostsLoading(false)
    })
    return () => { active = false }
  }, [isBlocked, isBlockLoading, isOwn, profile?.id])

  async function handleBlock() {
    if (!profile || isOwn || isBlockPending) return
    setIsBlockPending(true)
    setBlockError('')
    try {
      setIsBlocked(await toggleBlock(profile.id, isBlocked))
      setProfilePosts([])
    } catch (caught) {
      setBlockError(caught instanceof Error ? caught.message : 'Could not update block state.')
    } finally {
      setIsBlockPending(false)
    }
  }

  async function startConversation() {
    if (!profile || isOwn || isStartingConversation) return
    setIsStartingConversation(true)
    setBlockError('')
    try {
      const conversationId = await getOrCreateConversation(profile.id)
      navigate(`/chat/${conversationId}`)
    } catch (caught) {
      setBlockError(caught instanceof Error ? caught.message : 'Could not start this conversation.')
    } finally {
      setIsStartingConversation(false)
    }
  }

  const loading = isOwn ? isProfileLoading : isOtherProfileLoading
  const error = isOwn ? profileError : otherProfileError
  if (loading) return <section className="page-stack"><Loading label="Loading profile" /></section>
  if (error) return <section className="page-stack"><ErrorState title="Could not load profile" description={error} /></section>
  if (!profile) return <section className="page-stack"><EmptyState title="Profile not found" description="This profile is unavailable." /></section>
  if (!isOwn && isBlockLoading) return <section className="page-stack"><Loading label="Checking profile privacy" /></section>
  if (!isOwn && blockError && !isBlocked) return <section className="page-stack"><ErrorState title="Could not check profile privacy" description={blockError} /></section>

  const name = profile.display_name || profile.username
  if (!isOwn && isBlocked) return <section className="page-stack"><PageHeading title="Profile blocked" /><Button variant="outline" onClick={handleBlock} disabled={isBlockPending}>{isBlockPending ? 'Updating…' : 'Unblock profile'}</Button>{blockError && <p className="field__error" role="alert">{blockError}</p>}<EmptyState title="Profile content hidden" description="Unblock this profile to view its posts and details." /></section>
  return <section className="page-stack"><div className="profile-cover"><span className="profile-cover__stitch" /><span className="profile-cover__label">COMMUNITY PROFILE</span></div><div className="profile-summary"><Avatar name={name} image={profile.avatar_url ?? undefined} size="large" /><div className="profile-summary__actions">{isOwn ? <Button to="/edit-profile" variant="outline">Edit profile</Button> : <><Button variant="outline" onClick={startConversation} disabled={isStartingConversation || isBlockPending}>{isStartingConversation ? 'Opening…' : 'Message'}</Button><Button variant="quiet" onClick={handleBlock} disabled={isBlockPending}>{isBlockPending ? 'Updating…' : 'Block'}</Button></>}</div><h1>{name}</h1><span className="profile-handle">@{profile.username}</span><span className="local-label">{profile.is_verified ? 'Verified' : 'Member'}</span>{profile.bio && <p>{profile.bio}</p>}{profile.location && <span className="profile-location"><MapPin size={14} />{profile.location}</span>}{blockError && <p className="field__error" role="alert">{blockError}</p>}</div><div className="section-heading"><h2>Posts</h2></div>{isProfilePostsLoading ? <Loading label="Loading profile posts" /> : profilePostsError ? <ErrorState title="Could not load profile posts" description={profilePostsError} /> : profilePosts.length === 0 ? <EmptyState title="No posts yet" description="Posts shared by this profile will appear here." /> : <div className="feed-list">{profilePosts.map((post) => <PostCard key={post.id} post={post} />)}</div>}</section>
}

export function EditProfilePage() {
  const { profile, isProfileLoading, profileError, updateProfile } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name ?? '')
    setUsername(profile.username)
    setBio(profile.bio ?? '')
    setLocation(profile.location ?? '')
    setAvatarUrl(profile.avatar_url ?? '')
  }, [profile])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setSuccess(false)
    const result = await updateProfile({
      display_name: displayName.trim() || null,
      username: username.trim(),
      bio: bio.trim() || null,
      location: location.trim() || null,
      avatar_url: avatarUrl.trim() || null,
    })
    setIsSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setSuccess(true)
  }

  if (isProfileLoading && !profile) return <section className="page-stack page-stack--narrow"><Loading label="Loading your profile" /></section>
  if (profileError && !profile) return <section className="page-stack page-stack--narrow"><ErrorState title="Could not load your profile" description={profileError} /></section>
  if (!profile) return <section className="page-stack page-stack--narrow"><EmptyState title="Profile unavailable" description="Sign in again to load your profile." /></section>

  return <section className="page-stack page-stack--narrow"><Button to="/profile" variant="quiet"><ArrowLeft size={16} />Profile</Button><PageHeading eyebrow="YOUR INTRODUCTION" title="Edit profile" description="Changes are saved to your account profile." /><form className="form-stack" onSubmit={submit}><Input label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /><Input label="Username" value={username} onChange={(event) => setUsername(event.target.value)} required /><label className="field"><span className="field__label">About you</span><textarea className="field__control field__textarea" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={160} /></label><Input label="City" value={location} onChange={(event) => setLocation(event.target.value)} /><Input label="Avatar URL" type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} />{error && <p className="field__error" role="alert">{error}</p>}{success && <p className="micro-note" role="status">Profile saved.</p>}<Button type="submit" disabled={isSaving || isProfileLoading}>{isSaving ? 'Saving…' : 'Save profile'} {!isSaving && <Check size={17} />}</Button></form></section>
}

export function StoriesPage() {
  return <section className="page-stack"><PageHeading eyebrow="LITTLE WINDOWS INTO TODAY" title="Stories" description="Short community moments, curated for this frontend preview." /><PreviewNotice /><div className="story-preview-grid">{previewUsers.map((user, index) => <Link to="/home" className={`story-preview story-preview--${user.tone}`} key={user.handle}><div className="story-preview__top"><Avatar name={user.name} initials={user.initials} tone={user.tone} /><span>{user.name}<small>{index + 1}h · sample story</small></span></div><div className="story-preview__center"><span>✳</span><p>{['A stitch, a story, and a slow morning.', 'There is always room for one more at the table.', 'A little color from the weekend gathering.'][index]}</p></div><span className="story-preview__bottom">VIEW SAMPLE STORY <ArrowRight size={14} /></span></Link>)}</div></section>
}

export function ReelsPage() {
  return <section className="page-stack"><PageHeading eyebrow="SHORT COMMUNITY FILMS" title="Reels" description="A small visual preview of stories in motion." /><PreviewNotice /><div className="reel-placeholder"><img src="/loom-preview.svg" alt="Abstract, Banjara-inspired geometric threadwork" /><div className="reel-placeholder__copy"><span className="eyebrow">LOCAL ARTWORK PREVIEW</span><h2>Made by hand,<br />held in memory.</h2><p>Short videos will live here when media is connected.</p><Button to="/about" variant="outline">About the community</Button></div></div></section>
}

export function ChatListPage() {
  const [conversations, setConversations] = useState<Awaited<ReturnType<typeof loadConversations>>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    loadConversations().then((rows) => {
      if (active) setConversations(rows)
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Could not load conversations.')
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [])
  return <section className="page-stack"><PageHeading eyebrow="CONVERSATIONS" title="Chat" description="Your conversations." />{isLoading ? <Loading label="Loading conversations" /> : error ? <ErrorState title="Could not load conversations" description={error} /> : conversations.length ? <div className="chat-list">{conversations.map((conversation) => { const name = conversation.member.display_name || conversation.member.username; return <Link to={`/chat/${conversation.id}`} className="chat-row" key={conversation.id}><Avatar name={name} image={conversation.member.avatar_url ?? undefined} /><span className="chat-row__copy"><strong>{name}</strong><span>{conversation.lastMessage?.content ?? 'No messages yet'}</span></span><span className="chat-row__time">{conversation.unreadCount > 0 ? `${conversation.unreadCount} unread` : conversation.lastMessage ? new Date(conversation.lastMessage.created_at).toLocaleDateString() : ''}</span></Link>})}</div> : <EmptyState title="No conversations yet" description="Start a conversation from a community profile." />}</section>
}

export function ChatConversationPage() {
  const { conversationId = '' } = useParams()
  const { session } = useAuth()
  const [message, setMessage] = useState('')
  const [person, setPerson] = useState<ProfileRecord | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let channel: ReturnType<typeof subscribeToConversation> | null = null
    setIsLoading(true)
    setError('')
    void (async () => {
      try {
        const [peer, history] = await Promise.all([loadConversationPeer(conversationId), loadConversationMessages(conversationId)])
        if (!active) return
        setPerson(peer as ProfileRecord)
        setMessages(history)
        channel = subscribeToConversation(conversationId, () => {
          void loadConversationMessages(conversationId).then((nextMessages) => {
            if (active) setMessages(nextMessages)
          }).catch((caught: unknown) => {
            if (active) setError(caught instanceof Error ? caught.message : 'Could not refresh messages.')
          })
        })
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load this conversation.')
      } finally {
        if (active) setIsLoading(false)
      }
    })()
    return () => {
      active = false
      if (channel) void supabase.removeChannel(channel)
    }
  }, [conversationId])

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!message.trim() || isSending) return
    setIsSending(true)
    setError('')
    try {
      const created = await sendConversationMessage(conversationId, message)
      setMessages((current) => current.some((item) => item.id === created.id) ? current : [...current, created])
      setMessage('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send this message.')
    } finally {
      setIsSending(false)
    }
  }

  if (isLoading) return <section className="chat-screen"><Loading label="Loading conversation" /></section>
  if (error && !person) return <section className="page-stack"><ErrorState title="Could not load conversation" description={error} /></section>
  if (!person) return <section className="page-stack"><EmptyState title="Conversation unavailable" description="This conversation could not be found." action={<Button to="/chat" variant="outline">Back to chats</Button>} /></section>
  const personName = person.display_name || person.username
  return <section className="chat-screen"><header className="chat-screen__head"><Button to="/chat" variant="quiet" iconOnly aria-label="Back to chats"><ArrowLeft size={18} /></Button><Avatar name={personName} image={person.avatar_url ?? undefined} /><span className="chat-screen__identity"><strong>{personName}</strong><small>Conversation</small></span><span /></header><div className="chat-messages">{messages.length ? messages.map((item) => { const mine = item.sender_id === session?.user.id; return <div className={`chat-bubble${mine ? ' chat-bubble--you' : ' chat-bubble--them'}`} key={item.id}>{item.content}<span>{new Date(item.created_at).toLocaleTimeString()}</span></div>}) : <p className="micro-note">No messages yet. Start the conversation.</p>}{error && <p className="field__error" role="alert">{error}</p>}</div><div className="chat-compose-area"><form className="chat-disabled-compose" onSubmit={sendMessage}><Input aria-label="Message" placeholder="Write a message" value={message} onChange={(event) => setMessage(event.target.value)} /><Button type="submit" disabled={!message.trim() || isSending} iconOnly aria-label="Send message">{isSending ? '…' : <Send size={17} />}</Button></form></div></section>
}

export function NotificationsPage() {
  const { session } = useAuth()
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pendingId, setPendingId] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!session?.user) {
      setNotifications([])
      setIsLoading(false)
      return () => { active = false }
    }
    const refresh = async () => {
      try {
        const rows = await loadNotifications()
        if (active) {
          setNotifications(rows)
          setError('')
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load notifications.')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void refresh()
    const channel = supabase.channel(`notifications:${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, () => { void refresh() })
      .subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [session?.user.id])

  async function markRead(notification: NotificationRecord) {
    setPendingId(notification.id)
    setError('')
    try {
      await markNotificationRead(notification.id)
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not mark notification read.')
    } finally {
      setPendingId('')
    }
  }

  const copyForType = (type: string) => {
    if (type === 'like' || type === 'post_like') return 'liked your post'
    if (type === 'comment' || type === 'post_comment') return 'commented on your post'
    if (type === 'follow') return 'started following you'
    if (type === 'message') return 'sent you a message'
    return 'sent you a notification'
  }

  return <section className="page-stack"><PageHeading eyebrow="A LITTLE HELLO FROM YOUR CIRCLE" title="Notifications" description="Recent activity for your account." />{error && <p className="field__error" role="alert">{error}</p>}{isLoading ? <Loading label="Loading notifications" /> : notifications.length ? <div className="notification-list">{notifications.map((notification) => { const actorName = notification.actor?.display_name || notification.actor?.username || 'A community member'; const Icon = notification.type.includes('like') ? Heart : notification.type === 'follow' ? Users : notification.type === 'message' ? MessageCircle : Sparkles; return <article className="notification-row" key={notification.id}><Avatar name={actorName} image={notification.actor?.avatar_url ?? undefined} /><span className="notification-row__icon"><Icon size={15} /></span><p><strong>{actorName}</strong> {copyForType(notification.type)}<small>{new Date(notification.created_at).toLocaleString()} · {notification.is_read ? 'Read' : 'Unread'}</small></p>{!notification.is_read && <button type="button" className="icon-button" aria-label="Mark notification read" disabled={pendingId === notification.id} onClick={() => markRead(notification)}><Check size={17} /></button>}</article>})}</div> : <EmptyState title="You are all caught up" description="Notifications will appear here when available." />}</section>
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
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState('')

  async function handleSignOut() {
    setIsSigningOut(true)
    setError('')
    const { error: signOutError } = await signOut()
    setIsSigningOut(false)
    if (signOutError) {
      setError(signOutError.message)
      return
    }
    navigate('/login', { replace: true })
  }

  return <section className="page-stack"><PageHeading eyebrow="MAKE IT YOURS" title="Settings" description="Manage your account and preferences." />{settingsGroups.map((group) => <section className="settings-group" key={group.heading}><h2>{group.heading}</h2>{group.items.map(({ to, icon: Icon, title, detail }) => <Link className="settings-row" to={to} key={to}><span className="settings-row__icon"><Icon size={18} /></span><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={18} /></Link>)}</section>)}{error && <p className="field__error" role="alert">{error}</p>}<Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>{isSigningOut ? 'Signing out…' : 'Sign out'}</Button></section>
}

export function PrivacyPage() {
  const [privateProfile, setPrivateProfile] = useState(false)
  const [activityStatus, setActivityStatus] = useState(true)
  return <section className="page-stack page-stack--narrow"><Button to="/settings" variant="quiet"><ArrowLeft size={16} />Settings</Button><PageHeading eyebrow="YOUR SPACE, YOUR CHOICE" title="Privacy & security" description="Preference switches are stored only in this page preview." /><PreviewNotice>LOCAL UI STATE · NO ACCOUNT SETTINGS ARE SAVED</PreviewNotice><div className="settings-group"><h2>Profile visibility</h2><div className="preference-row"><span><strong>Private profile</strong><small>Only people you approve can see your posts.</small></span><button type="button" className={`toggle${privateProfile ? ' is-on' : ''}`} role="switch" aria-checked={privateProfile} aria-label="Private profile" onClick={() => setPrivateProfile(!privateProfile)}><span /></button></div><div className="preference-row"><span><strong>Show activity status</strong><small>Let connections know when you are around.</small></span><button type="button" className={`toggle${activityStatus ? ' is-on' : ''}`} role="switch" aria-checked={activityStatus} aria-label="Show activity status" onClick={() => setActivityStatus(!activityStatus)}><span /></button></div></div><div className="settings-group"><h2>Safety</h2><Link className="settings-row" to="/settings/blocked"><span className="settings-row__icon"><LockKeyhole size={18} /></span><span><strong>Blocked users</strong><small>Review sample blocked accounts</small></span><ChevronRight size={18} /></Link><Link className="settings-row" to="/report"><span className="settings-row__icon"><CircleHelp size={18} /></span><span><strong>Report a concern</strong><small>Let the team know what feels wrong</small></span><ChevronRight size={18} /></Link></div></section>
}

export function BlockedUsersPage() {
  const { session } = useAuth()
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pendingId, setPendingId] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!session?.user) return () => { active = false }
    setIsLoading(true)
    void (async () => {
      try {
        const blockedIds = await loadBlockedUserIds()
        if (!blockedIds.length) {
          if (active) setProfiles([])
          return
        }
        const { data, error: profileError } = await supabase.from('profiles')
          .select('id,username,display_name,avatar_url,bio,location,is_verified')
          .in('id', blockedIds)
        if (profileError) throw profileError
        if (active) setProfiles((data ?? []) as ProfileRecord[])
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load blocked profiles.')
      } finally {
        if (active) setIsLoading(false)
      }
    })()
    return () => { active = false }
  }, [session?.user.id])

  async function unblock(profileId: string) {
    setPendingId(profileId)
    setError('')
    try {
      await toggleBlock(profileId, true)
      setProfiles((current) => current.filter((profile) => profile.id !== profileId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not unblock this profile.')
    } finally {
      setPendingId('')
    }
  }

  return <section className="page-stack page-stack--narrow"><Button to="/settings/privacy" variant="quiet"><ArrowLeft size={16} />Privacy & security</Button><PageHeading eyebrow="YOUR SAFETY" title="Blocked users" description="Manage profiles you have blocked." />{error && <p className="field__error" role="alert">{error}</p>}{isLoading ? <Loading label="Loading blocked profiles" /> : <div className="connect-list">{profiles.length ? profiles.map((profile) => { const name = profile.display_name || profile.username; return <div className="blocked-row" key={profile.id}><Avatar name={name} image={profile.avatar_url ?? undefined} /><span><strong>{name}</strong><small>@{profile.username}</small></span><Button variant="outline" disabled={pendingId === profile.id} onClick={() => unblock(profile.id)}>{pendingId === profile.id ? 'Updating…' : 'Unblock'}</Button></div>}) : <EmptyState title="No blocked profiles" description="Profiles you block will appear here." />}</div>}</section>
}

export function ReportPage() {
  const [targetType, setTargetType] = useState('')
  const [targetId, setTargetId] = useState('')
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    setSubmitted(false)
    try {
      await createReport({ postId: targetType === 'post' ? targetId : undefined, commentId: targetType === 'comment' ? targetId : undefined }, reason, details)
      setSubmitted(true)
      setTargetId('')
      setDetails('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not submit this report.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <section className="page-stack page-stack--narrow"><PageHeading eyebrow="HELP KEEP THE CIRCLE KIND" title="Report a concern" description="Send a report about a post or comment." /><form className="form-stack" onSubmit={submit}><label className="field"><span className="field__label">Report target</span><select className="field__control" value={targetType} onChange={(event) => setTargetType(event.target.value)} required><option value="" disabled>Select post or comment</option><option value="post">Post</option><option value="comment">Comment</option></select></label><Input label="Target ID" value={targetId} onChange={(event) => setTargetId(event.target.value)} required /><label className="field"><span className="field__label">Reason</span><select className="field__control" value={reason} onChange={(event) => setReason(event.target.value)} required><option value="" disabled>Select a reason</option><option value="harassment">Harassment</option><option value="spam">Spam</option><option value="safety">Safety concern</option><option value="other">Other</option></select></label><label className="field"><span className="field__label">A few details</span><textarea className="field__control field__textarea" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Add context" maxLength={500} /></label>{error && <p className="field__error" role="alert">{error}</p>}{submitted && <p className="micro-note" role="status">Report submitted.</p>}<Button type="submit" disabled={isSubmitting || !targetId.trim()}>{isSubmitting ? 'Submitting…' : 'Submit report'} <ArrowRight size={16} /></Button><p className="micro-note">User reports are unavailable because the current reports schema has no user-target column.</p></form></section>
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
