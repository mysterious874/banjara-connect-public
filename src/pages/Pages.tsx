import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Compass, Heart, KeyRound, LockKeyhole, MapPin, MessageCircle, Paperclip, Pencil, Phone, Camera, Plus, Eye, Search, Send, ShieldCheck, Sparkles, Trash2, UserRound, Users, Video, X, Flag, MoreVertical, Palette, VolumeX, Ban, LogOut, Download, Maximize2, Minimize2, Forward } from 'lucide-react'
import { PostCard, PostComposer } from '../components/feed'
import { BrandLockup, BrandMark } from '../components/brand'
import { SearchBar } from '../components/search'
import { PwaInstallControl } from '../components/PwaInstall'
import { StoriesRail, markStoryViewed } from '../components/stories'
import { Avatar, Button, ConfirmationDialog, EmptyState, ErrorState, Input, Loading, Modal } from '../components/ui'
import { UserCard } from '../components/users'
import { useAuth } from '../hooks/AuthProvider'
import { usePreviewToast } from '../hooks/usePreviewToast'
import { loadBlockState, loadBlockedUserIds, toggleBlock } from '../utils/blockData'
import { loadPost, loadPostsPage } from '../utils/postData'
import { filterProfiles, loadProfiles, loadProfilesPage, searchProfilesByUsername } from '../utils/profileData'
import { getOrCreateConversation } from '../utils/chatData'
import { supabase } from '../utils/supabase'
import { deletePostMedia, uploadPostMedia, validatePostMedia } from '../utils/mediaData'
import { deleteProfileAvatar, profileAvatarPathFromUrl, uploadProfileAvatar, validateProfileAvatar } from '../utils/profileMediaData'
import { fetchCurrentLocation, searchLocationSuggestions, type LocationSuggestion } from '../utils/locationData'
import { validateChatMedia } from '../utils/chatMediaData'
import { createGroupMediaUrl, deleteGroupMedia, uploadGroupMedia, validateGroupMedia } from '../utils/groupMediaData'
import { createStory, deleteStory, loadActiveStories, loadStoryViewers, recordStoryView, validateStoryMedia, type StoryRecord, type StoryViewer } from '../utils/storyData'
import { userFacingError } from '../utils/userFacingError'
import { subscribeToPostgresChanges } from '../utils/realtimeData'
import { loadNotifications, markNotificationRead, markAllNotificationsRead, type NotificationRecord } from '../utils/notificationData'
import { createReport } from '../utils/reportData'
import type { FeedPost, ProfileRecord } from '../types/app'
import { deleteMessageForEveryone, deleteMessageForMe, hydrateConversationMediaUrls, invalidateConversationListCache, loadConversationMessages, loadConversationPeer, loadConversations, sendConversationMessage, subscribeToConversation, type ChatMessage } from '../utils/chatData'
import { createComment, deleteComment, loadCommentLikes, loadComments, loadPostLikesBatch, toggleCommentLike, updateComment, type CommentRecord } from '../utils/socialData'
import { getCached, invalidateCache, setCached } from '../utils/performanceCache'

function renderChatMessageContent(content: string) {
  return content.split('\n').map((line, index, lines) => {
    const postMatch = line.trim().match(/^\/posts\/([0-9a-f-]+)$/i)
    const storyMatch = line.trim().match(/^\/stories(?:\?story=([0-9a-f-]+))?$/i)
    const contentNode = postMatch
      ? <Link className="chat-shared-link" to={`/posts/${postMatch[1]}`}>Open shared post</Link>
      : storyMatch
        ? <Link className="chat-shared-link" to={storyMatch[1] ? `/stories?story=${storyMatch[1]}` : '/stories'}>Open shared story</Link>
        : line
    return <span key={`chat-line-${index}`}>{contentNode}{index < lines.length - 1 && <br />}</span>
  })
}

function useChatKeyboardViewportLock() {
  useEffect(() => {
    if (window.innerWidth > 799) return
    const root = document.documentElement
    const body = document.body
    const viewport = window.visualViewport
    let keyboardWasOpen = false

    const getKeyboardInset = () => {
      if (!viewport) return 0
      return Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    }

    const isKeyboardOpen = () => {
      const active = document.activeElement
      const editing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      return Boolean(viewport && (getKeyboardInset() > 80 || (editing && viewport.height < window.innerHeight - 80)))
    }

    const scrollMessagesToBottom = () => {
      const messages = document.querySelector('.chat-messages') as HTMLElement | null
      if (!messages) return
      messages.scrollTop = Math.max(0, messages.scrollHeight - messages.clientHeight)
    }

    const apply = () => {
      const chat = document.querySelector('.chat-screen') as HTMLElement | null
      const composer = document.querySelector('.chat-compose-area') as HTMLElement | null
      if (!chat) return

      const activeElement = document.activeElement
      const composerElement = document.querySelector('.chat-compose-area') as HTMLElement | null
      const activeIsChatComposer = Boolean(composerElement && activeElement instanceof HTMLElement && composerElement.contains(activeElement))
      const activeIsGroupMemberSearch = Boolean(activeElement instanceof HTMLElement && activeElement.closest('.community-group-members-panel'))
      const keyboardOpen = isKeyboardOpen()

      // The chat composer must only react to the chat message input. Group-member
      // search is a separate modal input and must never pull the composer above
      // its keyboard or move the chat viewport.
      if (keyboardOpen && activeIsGroupMemberSearch && viewport) {
        const keyboardInset = Math.min(
          Math.max(0, getKeyboardInset()),
          Math.max(0, window.innerHeight - 250),
        )
        const visibleHeight = Math.max(250, viewport.height)
        document.querySelectorAll('.modal-backdrop:has(.community-group-members-panel)').forEach((element) => {
          const backdrop = element as HTMLElement
          backdrop.style.setProperty('height', String(visibleHeight) + 'px', 'important')
          backdrop.style.setProperty('bottom', String(keyboardInset) + 'px', 'important')
          backdrop.style.setProperty('top', '0px', 'important')
          backdrop.style.setProperty('padding', '10px 12px', 'important')
          backdrop.style.setProperty('align-items', 'flex-end', 'important')
        })
        chat.style.removeProperty('position')
        chat.style.removeProperty('top')
        chat.style.removeProperty('right')
        chat.style.removeProperty('bottom')
        chat.style.removeProperty('left')
        chat.style.removeProperty('width')
        chat.style.removeProperty('--chat-viewport-offset')
        chat.style.removeProperty('transform')
        chat.style.removeProperty('height')
        chat.style.removeProperty('max-height')
        if (composer) {
          composer.style.removeProperty('bottom')
          composer.style.removeProperty('position')
          composer.style.removeProperty('z-index')
        }
        keyboardWasOpen = false
        root.style.setProperty('overflow', 'hidden')
        body.style.setProperty('overflow', 'hidden')
        return
      }

      document.querySelectorAll('.modal-backdrop:has(.community-group-members-panel)').forEach((element) => {
        const backdrop = element as HTMLElement
        backdrop.style.removeProperty('height')
        backdrop.style.removeProperty('bottom')
        backdrop.style.removeProperty('top')
        backdrop.style.removeProperty('padding')
        backdrop.style.removeProperty('align-items')
      })

      if (keyboardOpen && activeIsChatComposer && viewport) {
        const rawKeyboardInset = getKeyboardInset()
        // Ignore transient visualViewport values during keyboard animation.
        if (viewport.height < 250) return
        const keyboardInset = Math.min(
          Math.max(0, rawKeyboardInset),
          Math.max(0, window.innerHeight - 250),
        )
        const visibleHeight = Math.max(250, viewport.height)

        // Keep the whole chat viewport locked to the visual viewport while
        // Android resizes/pans the page for the keyboard. This prevents the
        // header and message bubbles from being dragged upward when the composer
        // receives focus.
        chat.style.setProperty('position', 'fixed', 'important')
        chat.style.setProperty('top', `${Math.max(0, viewport.offsetTop)}px`, 'important')
        chat.style.setProperty('right', '0px', 'important')
        chat.style.setProperty('bottom', 'auto', 'important')
        chat.style.setProperty('left', '0px', 'important')
        chat.style.setProperty('width', '100%', 'important')
        chat.style.setProperty('--chat-viewport-offset', '0px')
        chat.style.setProperty('transform', 'none', 'important')
        chat.style.setProperty('height', `${visibleHeight}px`, 'important')
        chat.style.setProperty('max-height', `${visibleHeight}px`, 'important')

        if (composer) {
          composer.style.setProperty('bottom', `${keyboardInset}px`, 'important')
          composer.style.setProperty('position', 'fixed', 'important')
          composer.style.setProperty('z-index', '99999', 'important')
        }

        root.style.setProperty('overflow', 'hidden')
        body.style.setProperty('overflow', 'hidden')

        const justOpened = !keyboardWasOpen
        keyboardWasOpen = true
        window.requestAnimationFrame(() => {
          window.scrollTo(0, 0)
          if (justOpened) {
            scrollMessagesToBottom()
            window.requestAnimationFrame(scrollMessagesToBottom)
          }
        })
      } else {
        keyboardWasOpen = false
        chat.style.removeProperty('position')
        chat.style.removeProperty('top')
        chat.style.removeProperty('right')
        chat.style.removeProperty('bottom')
        chat.style.removeProperty('left')
        chat.style.removeProperty('width')
        chat.style.removeProperty('--chat-viewport-offset')
        chat.style.removeProperty('transform')
        chat.style.removeProperty('height')
        chat.style.removeProperty('max-height')

        if (composer) {
          composer.style.removeProperty('bottom')
          composer.style.removeProperty('position')
          composer.style.removeProperty('z-index')
        }

        root.style.removeProperty('overflow')
        body.style.removeProperty('overflow')
      }
    }

    const onFocus = () => {
      window.setTimeout(apply, 0)
      window.setTimeout(apply, 80)
      window.setTimeout(apply, 220)
      window.setTimeout(apply, 450)
      window.setTimeout(settleLatestMessage, 500)
    }
    const onBlur = () => window.setTimeout(apply, 120)

    const settleLatestMessage = () => {
      if (!isKeyboardOpen()) return
      window.requestAnimationFrame(() => {
        scrollMessagesToBottom()
        window.setTimeout(scrollMessagesToBottom, 60)
        window.setTimeout(scrollMessagesToBottom, 180)
        window.setTimeout(scrollMessagesToBottom, 350)
      })
    }

    viewport?.addEventListener('resize', apply)
    viewport?.addEventListener('scroll', apply)
    document.addEventListener('input', settleLatestMessage)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    apply()

    return () => {
      viewport?.removeEventListener('resize', apply)
      viewport?.removeEventListener('scroll', apply)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
      document.removeEventListener('input', settleLatestMessage)
      root.style.removeProperty('overflow')
      body.style.removeProperty('overflow')
      const chat = document.querySelector('.chat-screen') as HTMLElement | null
      const composer = document.querySelector('.chat-compose-area') as HTMLElement | null
      chat?.style.removeProperty('top')
      chat?.style.removeProperty('left')
      chat?.style.removeProperty('--chat-viewport-offset')
      chat?.style.removeProperty('transform')
      chat?.style.removeProperty('height')
      chat?.style.removeProperty('max-height')
      composer?.style.removeProperty('bottom')
      composer?.style.removeProperty('position')
      composer?.style.removeProperty('z-index')
    }
  }, [])
}
function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}

function PreviewNotice({ children = 'FRONTEND PREVIEW · LOCAL SAMPLE CONTENT' }: { children?: ReactNode }) {
  return <div className="preview-notice"><span className="preview-notice__dot" />{children}</div>
}

export function HomePage() {
  const { profile, isProfileLoading, profileError, session } = useAuth()
  const userId = session?.user.id ?? ''
  const cachedPosts = userId ? getCached<{ posts: FeedPost[]; hasMore: boolean; nextOffset: number }>(`home-posts:${userId}`) : null
  const cachedPeople = userId ? getCached<ProfileRecord[]>(`home-people:${userId}`) : null
  const [posts, setPosts] = useState<FeedPost[]>(cachedPosts?.posts ?? [])
  const [isPostsLoading, setIsPostsLoading] = useState(!cachedPosts)
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false)
  const [postsHasMore, setPostsHasMore] = useState(cachedPosts?.hasMore ?? false)
  const [postsOffset, setPostsOffset] = useState(cachedPosts?.nextOffset ?? 0)
  const [postsError, setPostsError] = useState('')
  const [postLikeStates, setPostLikeStates] = useState<Map<string, { count: number; liked: boolean }>>(new Map())
  const [people, setPeople] = useState<ProfileRecord[]>(cachedPeople ?? [])
  const [isPeopleLoading, setIsPeopleLoading] = useState(!cachedPeople)
  const [peopleError, setPeopleError] = useState('')

  useEffect(() => {
    let active = true
    if (!session?.user) {
      setPeople([])
      setPeopleError('')
      setIsPeopleLoading(false)
      return () => { active = false }
    }
    // Keep cached content visible; refresh it silently in the background.
    setPeopleError('')
    void loadProfiles().then((nextPeople) => {
      if (!active) return
      setPeople(nextPeople)
      setCached(`home-people:${session.user.id}`, nextPeople, 60_000)
    }).catch((error: unknown) => {
      if (active && !people.length) setPeopleError(userFacingError(error, 'Could not load profiles.'))
    }).finally(() => {
      if (active) setIsPeopleLoading(false)
    })
    return () => { active = false }
  }, [session?.user.id])

  useEffect(() => {
    let active = true
    if (!session?.user) {
      setPosts([])
      setPostsError('')
      setPostsHasMore(false)
      setIsPostsLoading(false)
      return () => { active = false }
    }
    setPostsError('')
    void (async () => {
      try {
        const blockedPromise = loadBlockedUserIds()
        const pagePromise = blockedPromise.then((blockedIds) => loadPostsPage({ excludeUserIds: blockedIds, limit: 20 }))
        const page = await pagePromise
        if (!active) return
        // Render feed immediately; likes are intentionally non-blocking.
        setPosts(page.posts)
        setPostsHasMore(page.hasMore)
        setPostsOffset(page.nextOffset)
        setIsPostsLoading(false)
        setCached(`home-posts:${session.user.id}`, page, 30_000)
        void loadPostLikesBatch(page.posts.map((post) => post.id)).then((likeStates) => {
          if (active) setPostLikeStates(likeStates)
        }).catch(() => {})
      } catch (error) {
        if (active) {
          if (!posts.length) setPostsError(userFacingError(error, 'Could not load posts.'))
          setIsPostsLoading(false)
        }
      }
    })()
    return () => { active = false }
  }, [session?.user.id])

  async function loadMorePosts() {
    if (isLoadingMorePosts || !postsHasMore) return
    setIsLoadingMorePosts(true)
    setPostsError('')
    try {
      const blockedIds = await loadBlockedUserIds()
      const page = await loadPostsPage({ excludeUserIds: blockedIds, offset: postsOffset, limit: 20 })
      setPosts((current) => {
        const seen = new Set(current.map((post) => post.id))
        return [...current, ...page.posts.filter((post) => !seen.has(post.id))]
      })
      setPostsHasMore(page.hasMore)
      setPostsOffset(page.nextOffset)
    } catch (error) {
      setPostsError(userFacingError(error, 'Could not load more posts.'))
    } finally {
      setIsLoadingMorePosts(false)
    }
  }

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
        </div>
        <StoriesRail />
        <PostComposer name={profile?.display_name || profile?.username || 'Your profile'} image={profile?.avatar_url} />
        <div className="feed-heading"><div><span className="eyebrow">FROM YOUR COMMUNITY</span><h2>Your feed</h2></div></div>
        {isPostsLoading ? <Loading label="Loading posts" /> : postsError && !posts.length ? <ErrorState title="Could not load posts" description={postsError} /> : posts.length === 0 ? <EmptyState title="No posts yet" description="Posts shared with your community will appear here." action={<Button to="/create" variant="outline">Create a post</Button>} /> : <><div className="feed-list">{posts.map((post) => <PostCard key={post.id} post={post} initialLikeState={postLikeStates.get(post.id)} onDeleted={() => setPosts((current) => current.filter((item) => item.id !== post.id))} />)}</div>{postsError && <p className="field__error" role="alert">{postsError}</p>}{postsHasMore && <Button variant="outline" onClick={() => void loadMorePosts()} disabled={isLoadingMorePosts}>{isLoadingMorePosts ? 'Loading posts…' : 'Load more posts'}</Button>}</>}
      </div>
      <aside className="home-aside">
        <section className="aside-section"><div className="aside-section__heading"><h2>People to know</h2><Link className="text-link" to="/connect">More</Link></div>{isPeopleLoading && !people.length ? <Loading label="Loading profiles" /> : peopleError ? <p className="field__error" role="alert">{peopleError}</p> : <div className="user-list">{people.slice(0, 2).map((user) => <UserCard key={user.id} user={user} compact />)}</div>}</section>
        <section className="community-note"><span className="community-note__symbol">✳</span><div><span className="eyebrow">A NOTE FOR THE CIRCLE</span><p>Carry your stories with pride. Make space for someone else's, too.</p></div></section>
        <Link to="/about" className="aside-about">About Banjara Connect <ChevronRight size={15} /></Link>
      </aside>
    </div>
  )
}

export function CommunityPage() {
  const { profile, session } = useAuth()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState('')
  const [groups, setGroups] = useState<Array<{ id: string; name: string; description: string; member_count: number; unread_count: number }>>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [discoverGroups, setDiscoverGroups] = useState<Array<{ id: string; name: string; description: string; member_count: number }>>([])
  const [groupSearch, setGroupSearch] = useState('')
  const [groupSearchLoading, setGroupSearchLoading] = useState(false)
  const [groupRequesting, setGroupRequesting] = useState('')
  const [groupRequestIds, setGroupRequestIds] = useState<Set<string>>(new Set())
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [groupSaving, setGroupSaving] = useState(false)
  const [groupError, setGroupError] = useState('')

  async function loadGroups() {
    if (!session?.user) return
    setGroupsLoading(true)
    try {
      const { data: memberships, error: membershipError } = await supabase.from('community_group_members').select('group_id').eq('user_id', session.user.id)
      if (membershipError) throw membershipError
      const ids = (memberships ?? []).map((row) => row.group_id)
      if (!ids.length) {
        setGroups([])
        return
      }
      const { data, error: groupsError } = await supabase.from('community_groups').select('id,name,description').in('id', ids).order('created_at', { ascending: false })
      if (groupsError) throw groupsError
      const [{ data: members, error: membersError }, { data: reads, error: readsError }] = await Promise.all([
        supabase.from('community_group_members').select('group_id').in('group_id', ids),
        supabase.from('community_group_message_reads').select('group_id,last_read_message_id').eq('user_id', session.user.id).in('group_id', ids),
      ])
      if (membersError) throw membersError
      if (readsError) throw readsError
      const counts = new Map<string, number>()
      for (const member of members ?? []) counts.set(member.group_id, (counts.get(member.group_id) ?? 0) + 1)
      const readMap = new Map((reads ?? []).map((row) => [row.group_id, row.last_read_message_id]))
      const unreadPairs = await Promise.all(ids.map(async (id) => {
        const lastReadId = readMap.get(id)
        let query = supabase.from('community_group_messages').select('id', { count: 'exact', head: true }).eq('group_id', id)
        if (lastReadId) {
          const { data: readMessage } = await supabase.from('community_group_messages').select('created_at').eq('id', lastReadId).maybeSingle()
          if (readMessage?.created_at) query = query.gt('created_at', readMessage.created_at)
        }
        const { count } = await query
        return [id, count ?? 0] as const
      }))
      const unreadCounts = new Map(unreadPairs)
      setGroups((data ?? []).map((group) => ({ ...group, member_count: counts.get(group.id) ?? 0, unread_count: unreadCounts.get(group.id) ?? 0 })))
    } catch (caught) {
      setGroupError(userFacingError(caught, 'Could not load your communities.'))
    } finally {
      setGroupsLoading(false)
    }
  }

  async function loadGroupSearch(value: string) {
    setGroupSearch(value)
    const queryText = value.trim()
    if (queryText.length < 2) {
      setDiscoverGroups([])
      setGroupSearchLoading(false)
      return
    }
    setGroupSearchLoading(true)
    try {
      const { data, error: searchError } = await supabase
        .from('community_groups')
        .select('id,name,description')
        .or(`name.ilike.%${queryText}%,description.ilike.%${queryText}%`)
        .order('created_at', { ascending: false })
        .limit(20)
      if (searchError) throw searchError
      const foundGroups = (data ?? []) as Array<{ id: string; name: string; description: string }>
      if (!foundGroups.length) {
        setDiscoverGroups([])
        return
      }
      const groupIds = foundGroups.map((group) => group.id)
      const { data: members, error: membersError } = await supabase
        .from('community_group_members')
        .select('group_id')
        .in('group_id', groupIds)
      if (membersError) throw membersError
      const counts = new Map<string, number>()
      for (const member of members ?? []) counts.set(member.group_id, (counts.get(member.group_id) ?? 0) + 1)
      setDiscoverGroups(foundGroups.map((group) => ({ ...group, member_count: counts.get(group.id) ?? 0 })))
    } catch (caught) {
      setGroupError(userFacingError(caught, 'Could not search communities.'))
      setDiscoverGroups([])
    } finally {
      setGroupSearchLoading(false)
    }
  }

  async function loadGroupRequestState() {
    if (!session?.user) return
    const { data, error: requestError } = await supabase
      .from('community_group_join_requests')
      .select('group_id')
      .eq('requester_id', session.user.id)
      .eq('status', 'pending')
    if (requestError) return
    setGroupRequestIds(new Set((data ?? []).map((row) => row.group_id)))
  }

  async function requestGroupJoin(groupId: string) {
    if (!session?.user || groupRequesting) return
    if (groups.some((group) => group.id === groupId) || groupRequestIds.has(groupId)) return
    setGroupRequesting(groupId)
    setGroupError('')
    try {
      const { error: requestError } = await supabase.rpc('request_community_group_join', { p_group_id: groupId })
      if (requestError) throw requestError
      setGroupRequestIds((current) => new Set(current).add(groupId))
    } catch (caught) {
      setGroupError(userFacingError(caught, 'Could not send the join request.'))
    } finally {
      setGroupRequesting('')
    }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session?.user) return
    if (groupName.trim().length < 2) { setGroupError('Community name must be at least 2 characters.'); return }
    setGroupSaving(true)
    setGroupError('')
    try {
      const { data, error: createError } = await supabase.rpc('create_community_group', { p_name: groupName.trim(), p_description: groupDescription.trim() })
      if (createError) throw createError
      setGroupName('')
      setGroupDescription('')
      setGroupModalOpen(false)
      await loadGroups()
      if (!data) throw new Error('Community was created but no ID was returned.')
    } catch (caught) {
      setGroupError(userFacingError(caught, 'Could not create this community.'))
    } finally {
      setGroupSaving(false)
    }
  }

  async function loadCommunityPosts(nextOffset = 0, append = false) {
    if (!session?.user) return
    if (groups.length === 0) {
      setPosts([])
      setHasMore(false)
      setOffset(0)
      setIsLoading(false)
      return
    }
    if (append) setIsLoadingMore(true); else setIsLoading(true)
    setError('')
    try {
      const blockedIds = await loadBlockedUserIds()
      const page = await loadPostsPage({ excludeUserIds: blockedIds, groupIds: groups.map((group) => group.id), offset: nextOffset })
      setPosts((current) => append ? [...current, ...page.posts.filter((post) => !current.some((item) => item.id === post.id))] : page.posts)
      setHasMore(page.hasMore)
      setOffset(page.nextOffset)
    } catch (caught) {
      setError(userFacingError(caught, 'Could not load community posts.'))
    } finally {
      if (append) setIsLoadingMore(false); else setIsLoading(false)
    }
  }

  useEffect(() => {
    setPosts([])
    setOffset(0)
    setHasMore(false)
    void loadGroups()
    void loadGroupRequestState()
  }, [session?.user.id])

  useEffect(() => {
    void loadCommunityPosts()
  }, [session?.user.id, groups.map((group) => group.id).join(',')])

  return <section className="page-stack page-stack--narrow">
    <PageHeading eyebrow="SHARED STORIES, SHARED ROOTS" title="Community" description="Your community feed only shows posts from groups you have joined." />

    <div className="community-groups-head">
      <div><span className="eyebrow">YOUR COMMUNITIES</span><h2>Groups</h2></div>
      <Button onClick={() => { setGroupError(''); setGroupModalOpen(true) }}><Plus size={16} />Create community</Button>
    </div>

    {groupsLoading ? <Loading label="Loading your groups" /> : groups.length ? <div className="community-groups-list">{groups.map((group) => <Link to={`/community/groups/${group.id}`} className="community-group-card" key={group.id}><span className="community-group-card__icon"><Users size={20} /></span><div><strong>{group.name}</strong><p>{group.description || 'A Banjara Connect community group.'}</p><small>{group.member_count} {group.member_count === 1 ? 'member' : 'members'}{group.unread_count > 0 ? ` • ${group.unread_count} new` : ''}</small></div><ChevronRight size={18} /></Link>)}</div> : <div className="community-groups-empty"><Users size={22} /><div><strong>No communities joined</strong><p>Join a community below to start seeing its posts.</p></div></div>}

    <div className="community-discover">
      <div className="section-heading"><div><span className="eyebrow">FIND A COMMUNITY</span><h2>Search groups</h2></div></div>
      <form className="search-bar" role="search" onSubmit={(event) => event.preventDefault()}>
        <Search size={18} aria-hidden="true" />
        <input type="search" value={groupSearch} onChange={(event) => void loadGroupSearch(event.target.value)} aria-label="Search groups" placeholder="Search for a group" />
      </form>
      {groupSearchLoading && <Loading label="Searching groups" />}
      {!groupSearchLoading && groupSearch.trim().length >= 2 && <div className="community-discover-list" aria-label="Community search suggestions">{discoverGroups.length ? discoverGroups.map((group) => {
        const isMember = groups.some((item) => item.id === group.id)
        const isPending = groupRequestIds.has(group.id)
        return <article className="community-discover-card" key={group.id}>
          <span className="community-discover-card__avatar"><Users size={24} /></span>
          <div className="community-discover-card__copy">
            <strong>{group.name}</strong>
            <small>{group.description || 'Banjara Connect community'}</small>
            <span>{group.member_count} {group.member_count === 1 ? 'member' : 'members'}</span>
          </div>
          <Button type="button" variant={isMember || isPending ? 'quiet' : 'outline'} disabled={isMember || isPending || groupRequesting === group.id} onClick={() => void requestGroupJoin(group.id)}>
            {isMember ? 'Joined' : isPending ? 'Request sent' : groupRequesting === group.id ? 'Sending…' : 'Join'}
          </Button>
        </article>
      }) : <EmptyState title="No groups found" description="Try another group name." />}</div>}
    </div>

    <div className="community-action-card"><div className="post-card__author"><Avatar name={profile?.display_name || profile?.username || 'Your profile'} image={profile?.avatar_url ?? undefined} /><span><strong>{profile?.display_name || profile?.username || 'Your profile'}</strong><small>{groups.length ? 'Share with one of your joined groups' : 'Join a group to see community posts'}</small></span></div><Button to="/create">Create a post <Send size={15} /></Button></div>

    <div className="section-heading"><div><span className="eyebrow">COMMUNITY FEED</span><h2>Posts from your groups</h2></div><button type="button" className="button button--quiet" onClick={() => void loadCommunityPosts()} disabled={isLoading || !groups.length}>Refresh</button></div>
    {!groups.length ? <EmptyState title="No group posts to show" description="Join a community to see posts from its members. You can still create a post anytime." action={<Button to="/create">Create a post</Button>} /> : isLoading ? <Loading label="Loading community posts" /> : error && !posts.length ? <ErrorState title="Could not load community" description={error} /> : posts.length ? <div className="feed-list">{posts.map((post) => <PostCard key={post.id} post={post} onDeleted={() => setPosts((current) => current.filter((item) => item.id !== post.id))} />)}</div> : <EmptyState title="No group posts yet" description="Posts shared by members of your joined groups will appear here." action={<Button to="/create">Create a post</Button>} />}
    {error && posts.length > 0 && <p className="field__error" role="alert">{error}</p>}
    {hasMore && <Button variant="outline" onClick={() => void loadCommunityPosts(offset, true)} disabled={isLoadingMore}>{isLoadingMore ? 'Loading more posts…' : 'Load more posts'}</Button>}

    <Modal open={groupModalOpen} title="Create a community" onClose={() => !groupSaving && setGroupModalOpen(false)}>
      <form className="dialog-copy" onSubmit={createGroup}>
        <Input label="Community name" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="e.g. Mumbai Banjara Friends" maxLength={80} autoFocus required />
        <label className="field"><span className="field__label">Description</span><textarea className="field__control" value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder="What is this group about?" maxLength={500} rows={4} /></label>
        {groupError && <p className="field__error" role="alert">{groupError}</p>}
        <div className="dialog-copy__actions"><Button type="button" variant="quiet" onClick={() => setGroupModalOpen(false)} disabled={groupSaving}>Cancel</Button><Button type="submit" disabled={groupSaving}>{groupSaving ? 'Creating…' : 'Create community'} <Plus size={16} /></Button></div>
      </form>
    </Modal>
  </section>
}

export function ConnectPage() {
  const { session } = useAuth()
  const [query, setQuery] = useState('')
  const cacheKey = session?.user?.id ? `connect-people:${session.user.id}` : ''
  const cachedProfiles = cacheKey ? getCached<ProfileRecord[]>(cacheKey) : null
  const [profiles, setProfiles] = useState<ProfileRecord[]>(cachedProfiles ?? [])
  const [isLoading, setIsLoading] = useState(!cachedProfiles)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!session?.user) {
      setProfiles([])
      setIsLoading(false)
      return () => { active = false }
    }
    const key = `connect-people:${session.user.id}`
    const cached = getCached<ProfileRecord[]>(key)
    if (cached) {
      setProfiles(cached)
      setIsLoading(false)
    } else {
      setIsLoading(true)
    }
    setError('')
    void loadProfilesPage().then(({ profiles: nextProfiles }) => {
      if (!active) return
      setProfiles(nextProfiles)
      setCached(key, nextProfiles, 60_000)
    }).catch((caught: unknown) => {
      if (active) setError(userFacingError(caught, 'Could not load people.'))
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [session?.user.id])

  useEffect(() => {
    const value = query.trim()
    if (!value) {
      setIsSearching(false)
      setError('')
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      setIsSearching(true)
      setError('')
      void searchProfilesByUsername(value).then((results) => {
        if (active) setProfiles(results)
      }).catch((caught: unknown) => {
        if (active) setError(userFacingError(caught, 'Could not search people.'))
      }).finally(() => {
        if (active) setIsSearching(false)
      })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query])

  return <section className="page-stack connect-page">
    <PageHeading eyebrow="FIND YOUR CIRCLE" title="Connect" description="Discover people from the Banjara Connect community and connect with them." />
    <label className="connect-search" aria-label="Search username">
      <Search size={18} aria-hidden="true" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by username" autoComplete="off" />
      {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={17} /></button>}
    </label>
    {error && <p className="field__error" role="alert">{error}</p>}
    {(isLoading || isSearching) && !profiles.length ? <Loading label={isSearching ? 'Searching people' : 'Loading people'} /> : profiles.length ? <><div className="connect-people-carousel" aria-label="People to connect">{profiles.map((user) => <UserCard key={user.id} user={user} suggestion />)}</div>{isSearching && <p className="connect-search-status" role="status">Searching people…</p>}</> : <EmptyState title={query ? 'No people found' : 'No people to show'} description={query ? 'Try another username.' : 'New community members will appear here.'} />}
  </section>
}

export function SearchPage() {
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const { session } = useAuth()
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!session?.user) {
      setProfiles([])
      setHasMore(false)
      setError('')
      setIsLoading(false)
      return () => { active = false }
    }
    setProfiles([])
    setHasMore(false)
    setIsLoading(true)
    setError('')
    setNextOffset(0)
    loadProfilesPage().then(({ profiles: nextProfiles, hasMore: more, nextOffset: offset }) => {
      if (!active) return
      setProfiles(nextProfiles)
      setHasMore(more)
      setNextOffset(offset)
    }).catch((caught: unknown) => {
      if (active) setError(userFacingError(caught, 'Could not search profiles.'))
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [session?.user.id])

  async function loadMoreProfiles() {
    if (isLoadingMore || !hasMore) return
    setIsLoadingMore(true)
    setError('')
    try {
      const page = await loadProfilesPage(nextOffset)
      setProfiles((current) => {
        const seen = new Set(current.map((profile) => profile.id))
        return [...current, ...page.profiles.filter((profile) => !seen.has(profile.id))]
      })
      setHasMore(page.hasMore)
      setNextOffset(page.nextOffset)
    } catch (caught) {
      setError(userFacingError(caught, 'Could not load more profiles.'))
    } finally {
      setIsLoadingMore(false)
    }
  }

  const matches = filterProfiles(profiles, query)
  return <section className="page-stack"><PageHeading eyebrow="LOOK A LITTLE CLOSER" title="Search" description="Find community profiles." /><SearchBar placeholder="Try a name or place" /><div className="section-heading"><h2>{query ? `Results for “${query}”` : 'Suggested profiles'}</h2></div>{isLoading ? <Loading label="Searching profiles" /> : error && !profiles.length ? <ErrorState title="Could not search profiles" description={error} /> : <>{error && <p className="field__error" role="alert">{error}</p>}{matches.length ? <div className="connect-people-carousel" aria-label="People to connect">{matches.map((user) => <UserCard key={user.id} user={user} suggestion />)}</div> : <EmptyState title="No profiles found" description={hasMore ? 'Load more profiles to continue searching.' : 'Try another name or place.'} />}{hasMore && <Button variant="outline" onClick={() => void loadMoreProfiles()} disabled={isLoadingMore}>{isLoadingMore ? 'Loading profiles…' : 'Load more profiles'}</Button>}</>}</section>
}

export function CreatePostPage() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!session?.user) {
      setGroups([])
      setGroupsLoading(false)
      return () => { active = false }
    }
    void (async () => {
      try {
        const { data: memberships, error: membershipError } = await supabase
          .from('community_group_members')
          .select('group_id')
          .eq('user_id', session.user.id)
        if (membershipError) throw membershipError
        const ids = (memberships ?? []).map((row) => row.group_id)
        if (!ids.length) {
          if (active) setGroups([])
          return
        }
        const { data, error: groupError } = await supabase
          .from('community_groups')
          .select('id,name')
          .in('id', ids)
          .order('name')
        if (groupError) throw groupError
        if (active) setGroups((data ?? []) as Array<{ id: string; name: string }>)
      } catch (caught) {
        if (active) setError(userFacingError(caught, 'Could not load your communities.'))
      } finally {
        if (active) setGroupsLoading(false)
      }
    })()
    return () => { active = false }
  }, [session?.user.id])

  function handleMediaChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setError('')
    if (!file) {
      setMediaFile(null)
      return
    }
    try {
      validatePostMedia(file)
      setMediaFile(file)
    } catch (caught) {
      event.target.value = ''
      setMediaFile(null)
      setError(userFacingError(caught, 'This media file could not be selected.'))
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session?.user) {
      setError('Sign in before creating a post.')
      return
    }
    if (groups.length > 0 && !selectedGroupId) {
      setError('Choose which joined community should receive this post.')
      return
    }
    if (!text.trim() && !mediaFile) {
      setError('Add some text or choose a photo/video.')
      return
    }
    setIsSaving(true)
    setError('')
    let uploadedPath = ''
    try {
      const { data, error: insertError } = await supabase.from('posts').insert({
        user_id: session.user.id,
        group_id: selectedGroupId || null,
        content: text.trim(),
        media_urls: [],
        media_type: mediaFile?.type.startsWith('video/') ? 'video' : mediaFile ? 'image' : null,
      }).select('id').single()
      if (insertError) throw insertError

      if (mediaFile) {
        const uploaded = await uploadPostMedia(mediaFile, session.user.id, data.id)
        uploadedPath = uploaded.path
        const { error: updateError } = await supabase.from('posts')
          .update({ media_urls: [uploaded.path], media_type: uploaded.type })
          .eq('id', data.id)
          .eq('user_id', session.user.id)
        if (updateError) {
          await deletePostMedia([uploaded.path]).catch(() => undefined)
          await supabase.from('posts').delete().eq('id', data.id).eq('user_id', session.user.id)
          throw updateError
        }
      }

      navigate(`/posts/${data.id}`, { replace: true })
    } catch (caught) {
      if (uploadedPath) await deletePostMedia([uploadedPath]).catch(() => undefined)
      setError(userFacingError(caught, 'Could not create your post.'))
    } finally {
      setIsSaving(false)
    }
  }

  return <section className="page-stack page-stack--narrow">
    <PageHeading eyebrow="MAKE SOMETHING TOGETHER" title="Create a post" description={groups.length ? 'Choose one of your joined communities for this post.' : 'You can create a post anytime. Join a community when you want your posts to appear in its feed.'} />
    <form className="create-post-box" onSubmit={submit}>
      <div className="post-card__author"><Avatar name={profile?.display_name || profile?.username || 'Your profile'} image={profile?.avatar_url ?? undefined} /><span><strong>{profile?.display_name || profile?.username || 'Your profile'}</strong><span>{groups.length ? 'Posting to a joined community' : 'No community joined yet'}</span></span></div>
      {groupsLoading ? <Loading label="Loading your communities" /> : groups.length > 0 ? <label className="field"><select className="field__control" aria-label="Post to community" value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} required><option value="">Choose a community</option>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label> : <p className="micro-note">No group joined. This post will not appear in the Community group feed until you join a group.</p>}
      <label className="visually-hidden" htmlFor="post-text">Write your post</label>
      <textarea id="post-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="What would you like to share?" maxLength={500} />
      <div className="create-post-media-picker">
        <label className="button button--outline" htmlFor="post-media">Add photo or video</label>
        <input id="post-media" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={handleMediaChange} />
        {mediaFile && <span className="micro-note">{mediaFile.name} · {(mediaFile.size / (1024 * 1024)).toFixed(1)} MB</span>}
        <span className="micro-note">JPG, PNG, WEBP, GIF, MP4, WebM or MOV · max 50 MB</span>
      </div>
      <div className="create-post-box__footer"><span>{text.length}/500</span><Button type="submit" disabled={(!text.trim() && !mediaFile) || isSaving}>{isSaving ? 'Publishing…' : 'Publish post'} {!isSaving && <Send size={16} />}</Button></div>
      {error && <p className="field__error" role="alert">{error}</p>}
    </form>
  </section>
}

export function PostDetailsPage() {
  const navigate = useNavigate()
  const { postId = '' } = useParams()
  const { session } = useAuth()
  const [post, setPost] = useState<FeedPost | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError('')
    setPost(null)
    Promise.all([loadPost(postId), loadBlockedUserIds()]).then(([nextPost, blockedIds]) => {
      if (active) setPost(nextPost && !blockedIds.includes(nextPost.user_id) ? nextPost : null)
    }).catch((caught: unknown) => {
      if (active) setError(userFacingError(caught, 'Could not load this post.'))
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [postId, session?.user.id])

  if (isLoading) return <section className="page-stack"><Loading label="Loading post" /></section>
  if (error) return <section className="page-stack"><ErrorState title="Could not load post" description={error} /></section>
  if (!post) return <section className="page-stack"><EmptyState title="Post not found" description="This post may have been removed or is not available to your account." action={<Button to="/home" variant="outline">Back to feed</Button>} /></section>
  return <section className="page-stack page-stack--narrow"><Button to="/home" variant="quiet"><ArrowLeft size={16} />Back to feed</Button><PageHeading eyebrow="COMMUNITY POST" title="Post details" /><PostCard post={post} onDeleted={() => navigate('/home', { replace: true })} /></section>
}

function CommentItemCard({ comment, like, isLikePending, onToggleLike, onUpdated, onDeleted }: {
  comment: CommentRecord
  like: { count: number; liked: boolean }
  isLikePending: boolean
  onToggleLike: (comment: CommentRecord) => void
  onUpdated: (commentId: string, content: string) => void
  onDeleted: (commentId: string) => void
}) {
  const { session } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const isOwner = session?.user.id === comment.user_id
  const authorName = comment.author?.display_name || comment.author?.username || 'Community member'

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isOwner || isSaving || !editContent.trim()) return
    setIsSaving(true)
    setError('')
    try {
      await updateComment(comment.id, editContent)
      onUpdated(comment.id, editContent.trim())
      setIsEditing(false)
    } catch (caught) {
      setError(userFacingError(caught, 'Could not update this comment.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function remove() {
    if (!isOwner || isDeleting) return
    setIsDeleting(true)
    setError('')
    try {
      await deleteComment(comment.id)
      onDeleted(comment.id)
      setConfirmDelete(false)
    } catch (caught) {
      setError(userFacingError(caught, 'Could not delete this comment.'))
    } finally {
      setIsDeleting(false)
    }
  }

  return <article className="comment-item"><Avatar name={authorName} image={comment.author?.avatar_url ?? undefined} /><div className="comment-item__content"><div className="comment-item__head"><strong>{authorName}</strong><span>{new Date(comment.created_at).toLocaleString()}</span><button type="button" className={`post-action${like.liked ? ' is-liked' : ''}`} aria-pressed={like.liked} disabled={isLikePending} onClick={() => onToggleLike(comment)}><Heart size={16} fill={like.liked ? 'currentColor' : 'none'} />{like.count}</button></div>{isEditing ? <form className="comment-edit-form" onSubmit={save}><label className="visually-hidden" htmlFor={`comment-edit-${comment.id}`}>Edit your comment</label><textarea id={`comment-edit-${comment.id}`} value={editContent} onChange={(event) => setEditContent(event.target.value)} maxLength={1000} required /><div><Button type="button" variant="quiet" onClick={() => { setIsEditing(false); setEditContent(comment.content) }} disabled={isSaving}><X size={14} />Cancel</Button><Button type="submit" disabled={isSaving || !editContent.trim()}><Check size={14} />{isSaving ? 'Saving…' : 'Save'}</Button></div></form> : <p>{comment.content}</p>}{isOwner && <div className="comment-item__actions"><Button variant="quiet" onClick={() => { setEditContent(comment.content); setIsEditing(true) }} disabled={isSaving || isDeleting}><Pencil size={14} />Edit</Button><Button variant="quiet" onClick={() => setConfirmDelete(true)} disabled={isSaving || isDeleting}><Trash2 size={14} />Delete</Button></div>}{error && <p className="field__error" role="alert">{error}</p>}</div><ConfirmationDialog open={confirmDelete} title="Delete this comment?" description="This removes your comment from the post. This action cannot be undone." confirmLabel={isDeleting ? 'Deleting…' : 'Delete comment'} onClose={() => { if (!isDeleting) setConfirmDelete(false) }} onConfirm={() => void remove()} /></article>
}

export function CommentsPage() {
  const { postId = '' } = useParams()
  const { session } = useAuth()
  const [post, setPost] = useState<FeedPost | null>(null)
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [commentsHasMore, setCommentsHasMore] = useState(false)
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false)
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
    setPost(null)
    setComments([])
    setCommentsHasMore(false)
    Promise.all([loadPost(postId), loadComments(postId), loadBlockedUserIds()]).then(([nextPost, commentPage, blockedIds]) => {
      if (!active) return
      if (nextPost && blockedIds.includes(nextPost.user_id)) {
        setPost(null)
        setComments([])
        return
      }
      setPost(nextPost)
      setComments(commentPage.comments.filter((comment) => !blockedIds.includes(comment.user_id)))
      setCommentsHasMore(commentPage.hasMore)
    }).catch((caught: unknown) => {
      if (active) setError(userFacingError(caught, 'Could not load this conversation.'))
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [postId, session?.user.id])

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
      if (active) setError(userFacingError(caught, 'Could not load comment likes.'))
    })
    return () => { active = false }
  }, [comments, session?.user.id])

  async function loadMoreComments() {
    if (isLoadingMoreComments || !commentsHasMore) return
    setIsLoadingMoreComments(true)
    try {
      const blockedIds = await loadBlockedUserIds()
      const page = await loadComments(postId, comments.length)
      const visible = page.comments.filter((comment) => !blockedIds.includes(comment.user_id))
      setComments((current) => [...current, ...visible.filter((item) => !current.some((existing) => existing.id === item.id))])
      setCommentsHasMore(page.hasMore)
    } catch (caught) {
      setError(userFacingError(caught, 'Could not load more comments.'))
    } finally {
      setIsLoadingMoreComments(false)
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!content.trim() || isSubmitting) return
    setIsSubmitting(true)
    setError('')
    try {
      const refreshedComments = await createComment(postId, content)
      const blockedIds = await loadBlockedUserIds()
      const visible = refreshedComments.comments.filter((comment) => !blockedIds.includes(comment.user_id))
      setComments(visible)
      setCommentsHasMore(refreshedComments.hasMore)
      setContent('')
    } catch (caught) {
      setError(userFacingError(caught, 'Could not send this comment.'))
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
      setError(userFacingError(caught, 'Could not update this comment like.'))
    } finally {
      setPendingLikeIds((currentIds) => currentIds.filter((id) => id !== comment.id))
    }
  }

  if (isLoading) return <section className="page-stack"><Loading label="Loading comments" /></section>
  if (error && !post) return <section className="page-stack"><ErrorState title="Could not load comments" description={error} /></section>
  if (!post) return <section className="page-stack"><EmptyState title="Post not found" description="This post is not available." /></section>
  const postAuthor = post.author?.display_name || post.author?.username || 'community post'

  return <section className="page-stack page-stack--narrow"><Button to={`/posts/${post.id}`} variant="quiet"><ArrowLeft size={16} />Back to post</Button><PageHeading eyebrow="COMMUNITY COMMENTS" title="The conversation" description={`On ${postAuthor}'s post`} />{error && <p className="field__error" role="alert">{error}</p>}<div className="comment-list">{comments.length ? comments.map((comment) => <CommentItemCard key={comment.id} comment={comment} like={commentLikes[comment.id] ?? { count: 0, liked: false }} isLikePending={pendingLikeIds.includes(comment.id)} onToggleLike={toggleLike} onUpdated={(commentId, updatedContent) => setComments((current) => current.map((item) => item.id === commentId ? { ...item, content: updatedContent } : item))} onDeleted={(commentId) => { setComments((current) => current.filter((item) => item.id !== commentId)); setCommentLikes((current) => { const next = { ...current }; delete next[commentId]; return next }) }} />) : <EmptyState title="No comments yet" description="Start the conversation." />}</div>{commentsHasMore && <Button variant="outline" onClick={() => void loadMoreComments()} disabled={isLoadingMoreComments}>{isLoadingMoreComments ? 'Loading more comments…' : 'Load more comments'}</Button>}<form className="comment-compose" onSubmit={submitComment}><Input aria-label="Write a comment" placeholder="Add to the conversation..." value={content} onChange={(event) => setContent(event.target.value)} /><Button type="submit" iconOnly aria-label="Send comment" disabled={!content.trim() || isSubmitting}>{isSubmitting ? '…' : <Send size={17} />}</Button></form></section>
}

export function ProfilePage() {
  const [profileAvatarPreview, setProfileAvatarPreview] = useState<string | null>(null)
  const profileAvatarHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (profileAvatarHoldTimer.current) clearTimeout(profileAvatarHoldTimer.current) }, [])
  const navigate = useNavigate()
  const { handle } = useParams()
  const { session, profile: ownProfile, isProfileLoading, profileError } = useAuth()
  const [otherProfile, setOtherProfile] = useState<ProfileRecord | null>(null)
  const [isOtherProfileLoading, setIsOtherProfileLoading] = useState(false)
  const [otherProfileError, setOtherProfileError] = useState('')
  const [profilePosts, setProfilePosts] = useState<FeedPost[]>([])
  const [isProfilePostsLoading, setIsProfilePostsLoading] = useState(false)
  const [isLoadingMoreProfilePosts, setIsLoadingMoreProfilePosts] = useState(false)
  const [profilePostsHasMore, setProfilePostsHasMore] = useState(false)
  const [profilePostsOffset, setProfilePostsOffset] = useState(0)
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
        const profileLookup = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(handle)
          ? supabase.from('profiles').select('id,username,display_name,avatar_url,bio,location,is_verified').eq('id', handle)
          : supabase.from('profiles').select('id,username,display_name,avatar_url,bio,location,is_verified').eq('username', handle)
        const { data, error } = await profileLookup.maybeSingle()
        if (!active) return
        setOtherProfile(data as ProfileRecord | null)
        setOtherProfileError(error ? userFacingError(error, 'Could not load this profile.') : '')
      } catch (error) {
        if (active) setOtherProfileError(userFacingError(error, 'Could not load this profile.'))
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
      if (active) setBlockError(userFacingError(caught, 'Could not load block state.'))
    }).finally(() => {
      if (active) setIsBlockLoading(false)
    })
    return () => { active = false }
  }, [isOwn, profile?.id])

  useEffect(() => {
    let active = true
    setProfilePosts([])
    setProfilePostsHasMore(false)
    setProfilePostsError('')
    if (!profile) {
      setIsProfilePostsLoading(false)
      return () => { active = false }
    }
    if (!isOwn && isBlockLoading) {
      setIsProfilePostsLoading(true)
      return () => { active = false }
    }
    if (!isOwn && isBlocked) {
      setIsProfilePostsLoading(false)
      return () => { active = false }
    }
    setIsProfilePostsLoading(true)
    loadPostsPage({ userId: profile.id }).then((page) => {
      if (active) {
        setProfilePosts(page.posts)
        setProfilePostsHasMore(page.hasMore)
        setProfilePostsOffset(page.nextOffset)
      }
    }).catch((error: unknown) => {
      if (active) setProfilePostsError(userFacingError(error, 'Could not load profile posts.'))
    }).finally(() => {
      if (active) setIsProfilePostsLoading(false)
    })
    return () => { active = false }
  }, [isBlocked, isBlockLoading, isOwn, profile?.id])

  async function loadMoreProfilePosts() {
    if (!profile || isLoadingMoreProfilePosts || !profilePostsHasMore) return
    setIsLoadingMoreProfilePosts(true)
    setProfilePostsError('')
    try {
      const page = await loadPostsPage({ userId: profile.id, offset: profilePostsOffset })
      setProfilePosts((current) => {
        const seen = new Set(current.map((post) => post.id))
        return [...current, ...page.posts.filter((post) => !seen.has(post.id))]
      })
      setProfilePostsHasMore(page.hasMore)
      setProfilePostsOffset(page.nextOffset)
    } catch (caught) {
      setProfilePostsError(userFacingError(caught, 'Could not load more profile posts.'))
    } finally {
      setIsLoadingMoreProfilePosts(false)
    }
  }

  async function handleBlock() {
    if (!profile || isOwn || isBlockPending) return
    setIsBlockPending(true)
    setBlockError('')
    try {
      setIsBlocked(await toggleBlock(profile.id, isBlocked))
      setProfilePosts([])
    } catch (caught) {
      setBlockError(userFacingError(caught, 'Could not update block state.'))
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
      setBlockError(userFacingError(caught, 'Could not start this conversation.'))
    } finally {
      setIsStartingConversation(false)
    }
  }

  const loading = isOwn ? isProfileLoading : isOtherProfileLoading
  const error = isOwn ? profileError : otherProfileError
  if (loading || (isOwn && !ownProfile && !profileError)) return <section className="page-stack"><Loading label="Loading profile" /></section>
  if (error) return <section className="page-stack"><ErrorState title="Could not load profile" description={error} /></section>
  if (!profile) return <section className="page-stack"><EmptyState title="Profile not found" description="This profile is unavailable." /></section>
  if (!isOwn && isBlockLoading) return <section className="page-stack"><Loading label="Checking profile privacy" /></section>
  if (!isOwn && blockError && !isBlocked) return <section className="page-stack"><ErrorState title="Could not check profile privacy" description={blockError} /></section>

  const name = profile.display_name || profile.username || 'Your profile'
  const profileUsername = profile.username || `member-${profile.id.slice(0, 8)}`
  if (!isOwn && isBlocked) return <section className="page-stack"><PageHeading title="Profile blocked" /><Button variant="outline" onClick={handleBlock} disabled={isBlockPending}>{isBlockPending ? 'Updating…' : 'Unblock profile'}</Button>{blockError && <p className="field__error" role="alert">{blockError}</p>}<EmptyState title="Profile content hidden" description="Unblock this profile to view its posts and details." /></section>
  return <section className="page-stack"><div className="profile-cover"><span className="profile-cover__stitch" /><span className="profile-cover__label">COMMUNITY PROFILE</span></div><div className="profile-summary"><div className="profile-avatar-hold"><button type="button" className="profile-avatar-preview-trigger" aria-label="Open profile photo" disabled={!profile.avatar_url} onClick={() => setProfileAvatarPreview(profile.avatar_url ?? null)}><Avatar name={name} image={profile.avatar_url ?? undefined} size="large" /></button></div><div className="profile-summary__actions">{isOwn ? <Button to="/edit-profile" variant="outline">Edit profile</Button> : <><Button variant="outline" onClick={startConversation} disabled={isStartingConversation || isBlockPending}>{isStartingConversation ? 'Opening…' : 'Message'}</Button><Button variant="quiet" onClick={handleBlock} disabled={isBlockPending}>{isBlockPending ? 'Updating…' : 'Block'}</Button></>}</div><h1>{name}</h1><span className="profile-handle">@{profileUsername}</span><span className="local-label">{profile.is_verified ? 'Verified' : 'Member'}</span>{profile.bio && <p>{profile.bio}</p>}{profile.location && <span className="profile-location"><MapPin size={14} />{profile.location}</span>}{blockError && <p className="field__error" role="alert">{blockError}</p>}</div><>{profileAvatarPreview && <div className="media-preview-backdrop" role="presentation" onClick={() => setProfileAvatarPreview(null)}><div className="media-preview-dialog" role="dialog" aria-modal="true" aria-label="Profile photo preview" onClick={(event) => event.stopPropagation()}><button type="button" className="media-preview-close" aria-label="Close profile photo" onClick={() => setProfileAvatarPreview(null)}><X size={22} /></button><img className="media-preview-content" src={profileAvatarPreview} alt={name + " profile photo"} /></div></div>}</><div className="section-heading"><h2>Posts</h2></div>{isProfilePostsLoading ? <Loading label="Loading profile posts" /> : profilePostsError && !profilePosts.length ? <ErrorState title="Could not load profile posts" description={profilePostsError} /> : profilePosts.length === 0 ? <EmptyState title="No posts yet" description="Posts shared by this profile will appear here." /> : <><div className="feed-list">{profilePosts.map((post) => <PostCard key={post.id} post={post} onDeleted={() => setProfilePosts((current) => current.filter((item) => item.id !== post.id))} />)}</div>{profilePostsError && <p className="field__error" role="alert">{profilePostsError}</p>}{profilePostsHasMore && <Button variant="outline" onClick={() => void loadMoreProfilePosts()} disabled={isLoadingMoreProfilePosts}>{isLoadingMoreProfilePosts ? 'Loading posts…' : 'Load more posts'}</Button>}</>}</section>
}

export function EditProfilePage() {
  const { profile, isProfileLoading, profileError, updateProfile } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [isFetchingLocation, setIsFetchingLocation] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name ?? '')
    setUsername(profile.username ?? '')
    setBio(profile.bio ?? '')
    setLocation(profile.location ?? '')
    setAvatarUrl(profile.avatar_url ?? '')
    setAvatarFile(null)
  }, [profile])

  useEffect(() => {
    const controller = new AbortController()
    if (location.trim().length < 2) {
      setLocationSuggestions([])
      setIsLoadingSuggestions(false)
      return () => controller.abort()
    }
    const timer = window.setTimeout(() => {
      setIsLoadingSuggestions(true)
      void searchLocationSuggestions(location, controller.signal)
        .then((suggestions) => setLocationSuggestions(suggestions))
        .catch((caught: unknown) => {
          if ((caught as Error)?.name !== 'AbortError') setLocationSuggestions([])
        })
        .finally(() => setIsLoadingSuggestions(false))
    }, 350)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [location])

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setError('')
    setSuccess(false)
    if (!file) return
    try {
      validateProfileAvatar(file)
      setAvatarFile(file)
      setAvatarUrl(URL.createObjectURL(file))
    } catch (caught) {
      event.target.value = ''
      setAvatarFile(null)
      setError(userFacingError(caught, 'Could not select this profile photo.'))
    }
  }

  function selectLocation(suggestion: LocationSuggestion) {
    setLocation(suggestion.displayName)
    setLocationSuggestions([])
  }

  async function useCurrentLocation() {
    setIsFetchingLocation(true)
    setError('')
    setSuccess(false)
    try {
      const current = await fetchCurrentLocation()
      setLocation(current.displayName)
      setLocationSuggestions([])
    } catch (caught) {
      const locationCode = caught && typeof caught === 'object' && 'code' in caught && typeof caught.code === 'number' ? caught.code : null
      const message = locationCode === 1
        ? 'Location permission was denied. Allow location access in your browser and try again.'
        : locationCode === 3
          ? 'Location took too long to fetch. Try again.'
          : userFacingError(caught, 'Could not fetch your current location.')
      setError(message)
    } finally {
      setIsFetchingLocation(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setSuccess(false)
    let uploadedAvatarPath = ''
    try {
      let nextAvatarUrl = avatarUrl.trim() || null
      if (avatarFile && profile) {
        const uploaded = await uploadProfileAvatar(avatarFile, profile.id)
        uploadedAvatarPath = uploaded.path
        nextAvatarUrl = uploaded.publicUrl
      }
      const result = await updateProfile({
        display_name: displayName.trim() || null,
        username: username.trim(),
        bio: bio.trim() || null,
        location: location.trim() || null,
        avatar_url: nextAvatarUrl,
      })
      if (result.error) {
        if (uploadedAvatarPath) await deleteProfileAvatar(uploadedAvatarPath).catch(() => undefined)
        setError(result.error)
        return
      }
      if (uploadedAvatarPath) {
        const oldPath = profileAvatarPathFromUrl(profile?.avatar_url)
        if (oldPath && oldPath !== uploadedAvatarPath) await deleteProfileAvatar(oldPath).catch(() => undefined)
      }
      setAvatarFile(null)
      setSuccess(true)
    } catch (caught) {
      if (uploadedAvatarPath) await deleteProfileAvatar(uploadedAvatarPath).catch(() => undefined)
      setError(userFacingError(caught, 'Could not save your profile.'))
    } finally {
      setIsSaving(false)
    }
  }

  if ((isProfileLoading || !profile) && !profileError) return <section className="page-stack page-stack--narrow"><Loading label="Loading your profile" /></section>
  if (profileError && !profile) return <section className="page-stack page-stack--narrow"><ErrorState title="Could not load your profile" description={profileError} /></section>
  if (!profile) return <section className="page-stack page-stack--narrow"><EmptyState title="Profile unavailable" description="Sign in again to load your profile." /></section>

  return <section className="page-stack page-stack--narrow"><Button to="/profile" variant="quiet"><ArrowLeft size={16} />Profile</Button><PageHeading eyebrow="YOUR INTRODUCTION" title="Edit profile" description="Update your photo, introduction, and location." /><form className="form-stack" onSubmit={submit}>
    <div className="edit-profile-avatar">
      <Avatar name={displayName || username || 'Your profile'} image={avatarUrl || undefined} size="large" />
      <div>
        <span className="field__label">Profile photo</span>
        <label className="button button--outline edit-profile-avatar__button" htmlFor="profile-avatar">Choose photo</label>
        <input id="profile-avatar" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatarChange} />
        <span className="micro-note">JPG, PNG, WEBP or GIF · max 5 MB</span>
      </div>
    </div>
    <Input label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
    <Input label="Username" value={username} onChange={(event) => setUsername(event.target.value)} required />
    <label className="field"><span className="field__label">About you</span><textarea className="field__control field__textarea" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={160} /></label>
    <div className="field location-picker">
      <span className="field__label">Location</span>
      {(isLoadingSuggestions || locationSuggestions.length > 0) && <div className="location-suggestions location-suggestions--above" role="listbox" aria-label="Location suggestions">
        {isLoadingSuggestions && <span className="location-suggestions__status">Searching locations…</span>}
        {locationSuggestions.map((suggestion, index) => <button type="button" className="location-suggestion" key={suggestion.displayName + index} onClick={() => selectLocation(suggestion)}><MapPin size={15} /><span>{suggestion.displayName}</span></button>)}
      </div>}
      <div className="location-picker__input">
        <Input aria-label="Location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Search city or place" autoComplete="off" />
        <Button type="button" variant="quiet" onClick={() => void useCurrentLocation()} disabled={isFetchingLocation} title="Use my current location">{isFetchingLocation ? 'Finding…' : <><MapPin size={16} />Use current</>}</Button>
      </div>
      <span className="micro-note">Type a place for suggestions, or use your current browser location.</span>
    </div>
    {error && <p className="field__error" role="alert">{error}</p>}
    {success && <p className="micro-note" role="status">Profile saved.</p>}
    <Button type="submit" disabled={isSaving || isProfileLoading}>{isSaving ? 'Saving…' : 'Save profile'} {!isSaving && <Check size={17} />}</Button>
  </form></section>
}
function storyPublishError(error: unknown): string {
  const raw = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message.trim()
    : error instanceof Error ? error.message.trim() : ''
  const message = raw.slice(0, 220)
  if (/row.level security|permission denied|not authorized|403/i.test(message)) {
    return 'Story upload permission was blocked. Please try again; if it repeats, share this message with the app admin.'
  }
  if (/bucket.*not found|no such bucket/i.test(message)) {
    return 'Story media storage is not configured yet. Please contact the app admin.'
  }
  if (/mime|content.type|file type/i.test(message)) {
    return 'This photo or video format is not supported. Try JPG, PNG, WEBP, GIF, MP4, WebM, or MOV.'
  }
  if (/payload too large|file size|too large/i.test(message)) {
    return 'This file is too large. Story media must be 50 MB or smaller.'
  }
  if (/network|fetch failed|failed to fetch|timeout/i.test(message)) {
    return 'Network issue while uploading. Check your internet connection and try again.'
  }
  return message ? `Could not publish story: ${message}` : 'Could not publish story. Please try again.'
}

export function StoriesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [storyParams] = useSearchParams()
  const { session, profile } = useAuth()
  const initialStory = (location.state as { story?: StoryRecord } | null)?.story ?? null
  const [stories, setStories] = useState<StoryRecord[]>([])
  const [selectedStory, setSelectedStory] = useState<StoryRecord | null>(initialStory)
  const [storyText, setStoryText] = useState('')
  const [storyFile, setStoryFile] = useState<File | null>(null)
  const [storyPreviewUrl, setStoryPreviewUrl] = useState('')
  const storyCameraInputRef = useRef<HTMLInputElement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isReplying, setIsReplying] = useState(false)
  const [error, setError] = useState('')
  const [replyMessage, setReplyMessage] = useState('')
  const [success, setSuccess] = useState('')
  const [showCreateStory, setShowCreateStory] = useState(storyParams.get('create') === '1')
  const isManagingOwnStories = storyParams.get('manage') === '1'
  const isDirectCreate = storyParams.get('create') === '1'
  const [storyShareOpen, setStoryShareOpen] = useState(false)
  const [storyShareQuery, setStoryShareQuery] = useState('')
  const [storyShareResults, setStoryShareResults] = useState<ProfileRecord[]>([])
  const [storyShareLoading, setStoryShareLoading] = useState(false)
  const [storyShareSending, setStoryShareSending] = useState(false)
  const [storyShareError, setStoryShareError] = useState('')
  const [storyViewersOpen, setStoryViewersOpen] = useState(false)
  const [storyViewers, setStoryViewers] = useState<StoryViewer[]>([])
  const [storyViewersLoading, setStoryViewersLoading] = useState(false)
  const [storyMenuOpen, setStoryMenuOpen] = useState(false)
  const [storyLikedIds, setStoryLikedIds] = useState<string[]>([])
  const [storyActionBusy, setStoryActionBusy] = useState(false)
  const storyTimer = useRef<number | null>(null)
  const storySwipeStart = useRef<{ x: number; y: number } | null>(null)
  const storySwipeMoved = useRef(false)

  useEffect(() => {
    if (!storyFile) {
      setStoryPreviewUrl('')
      return
    }
    const url = URL.createObjectURL(storyFile)
    setStoryPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [storyFile])

  const grouped = Array.from(stories.reduce((map, story) => {
    if (!map.has(story.user_id)) map.set(story.user_id, story)
    return map
  }, new Map<string, StoryRecord>()).values())
  const storySequence = grouped.flatMap((latest) => stories
    .filter((story) => story.user_id === latest.user_id)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)))
  const activeIndex = selectedStory ? storySequence.findIndex((story) => story.id === selectedStory.id) : -1
  const ownStories = stories.filter((story) => story.user_id === session?.user.id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))

  async function refreshStories() {
    setIsLoading(true)
    setError('')
    try {
      const next = await loadActiveStories()
      setStories(next)
      const requestedStoryId = storyParams.get('story')
      setSelectedStory((current) => {
        if (isManagingOwnStories || isDirectCreate) return null
        if (requestedStoryId) return next.find((item) => item.id === requestedStoryId) ?? current ?? next[0] ?? null
        if (current) return next.find((item) => item.id === current.id) ?? next.find((item) => item.user_id === current.user_id) ?? next[0] ?? null
        return next[0] ?? null
      })
    } catch (caught) {
      setError(userFacingError(caught, 'Could not load stories.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refreshStories()
    return () => {
      if (storyTimer.current) window.clearTimeout(storyTimer.current)
    }
  }, [session?.user.id])

  useEffect(() => {
    if (!selectedStory || isLoading || activeIndex < 0 || activeIndex >= storySequence.length - 1) return
    if (storyTimer.current) window.clearTimeout(storyTimer.current)
    storyTimer.current = window.setTimeout(() => {
      setSelectedStory(storySequence[activeIndex + 1])
    }, selectedStory.media_type === 'video' ? 8000 : 5000)
    return () => {
      if (storyTimer.current) window.clearTimeout(storyTimer.current)
    }
  }, [selectedStory?.id, activeIndex, storySequence.length, isLoading, navigate])

  useEffect(() => {
    if (!selectedStory || !session?.user.id || selectedStory.user_id === session.user.id) return
    void recordStoryView(selectedStory.id, session.user.id).catch(() => undefined)
  }, [selectedStory?.id, selectedStory?.user_id, session?.user.id])

  function closeStoryViewer() {
    if (storyTimer.current) window.clearTimeout(storyTimer.current)
    if (isManagingOwnStories) {
      setSelectedStory(null)
      return
    }
    navigate('/home')
  }

  function handleStoryPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return
    storySwipeStart.current = { x: event.clientX, y: event.clientY }
    storySwipeMoved.current = false
  }

  function handleStoryPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = storySwipeStart.current
    if (!start || event.pointerType === 'mouse') return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) storySwipeMoved.current = true
  }

  function handleStoryPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = storySwipeStart.current
    storySwipeStart.current = null
    if (!start || event.pointerType === 'mouse') return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (dy > 80 && Math.abs(dy) > Math.abs(dx) * 1.15) {
      closeStoryViewer()
    }
  }

  async function likeSelectedStory() {
    if (!selectedStory || !session?.user.id || selectedStory.user_id === session.user.id || storyLikedIds.includes(selectedStory.id)) return
    setStoryActionBusy(true)
    setError('')
    try {
      const { error: notificationError } = await supabase.from('notifications').insert({
        user_id: selectedStory.user_id,
        actor_id: session.user.id,
        type: 'story_like',
        is_read: false,
      })
      if (notificationError) throw notificationError
      setStoryLikedIds((current) => [...current, selectedStory.id])
      setSuccess('Story liked')
    } catch (caught) {
      setError(userFacingError(caught, 'Could not like this story.'))
    } finally {
      setStoryActionBusy(false)
    }
  }

  function muteSelectedStory() {
    if (!selectedStory || !session?.user.id || selectedStory.user_id === session.user.id) return
    try {
      const key = 'banjara_connect_muted_stories_v1'
      const muted = JSON.parse(localStorage.getItem(key) || '[]') as string[]
      if (!muted.includes(selectedStory.user_id)) localStorage.setItem(key, JSON.stringify([...muted, selectedStory.user_id]))
      setStoryMenuOpen(false)
      closeStoryViewer()
      setSuccess('Story muted')
      window.dispatchEvent(new CustomEvent('banjara:muted-stories-changed'))
    } catch {
      setError('Could not mute this story on this device.')
    }
  }

  async function downloadSelectedStory() {
    if (!selectedStory?.media_url) {
      setError('This story has no downloadable photo or video.')
      return
    }
    try {
      const response = await fetch(selectedStory.media_url)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `banjara-story-${selectedStory.id}.${selectedStory.media_type === 'video' ? 'mp4' : 'jpg'}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setStoryMenuOpen(false)
    } catch (caught) {
      setError(userFacingError(caught, 'Could not download this story.'))
    }
  }

  async function openStoryViewers() {
    if (!selectedStory || selectedStory.user_id !== session?.user.id) return
    setStoryViewersOpen(true)
    setStoryViewersLoading(true)
    try {
      setStoryViewers(await loadStoryViewers(selectedStory.id, session.user.id))
    } catch (caught) {
      setError(userFacingError(caught, 'Could not load story viewers.'))
    } finally {
      setStoryViewersLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedStory) return
    const candidates = [
      activeIndex > 0 ? storySequence[activeIndex - 1] : null,
      selectedStory,
      activeIndex < storySequence.length - 1 ? storySequence[activeIndex + 1] : null,
    ].filter((story): story is StoryRecord => Boolean(story))
    const preloaded: Array<HTMLImageElement | HTMLVideoElement> = []
    for (const story of candidates) {
      if (!story.media_url) continue
      if (story.media_type === 'video') {
        const video = document.createElement('video')
        video.preload = 'auto'
        video.src = story.media_url
        preloaded.push(video)
      } else {
        const image = new Image()
        image.src = story.media_url
        preloaded.push(image)
      }
    }
    return () => {
      for (const media of preloaded) {
        if (media instanceof HTMLVideoElement) {
          media.pause()
          media.removeAttribute('src')
          media.load()
        }
      }
    }
  }, [selectedStory?.id, activeIndex, storySequence.length])

  useEffect(() => {
    if (!selectedStory) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeStoryViewer()
      if (event.key === 'ArrowRight' && activeIndex < storySequence.length - 1) setSelectedStory(storySequence[activeIndex + 1])
      if (event.key === 'ArrowLeft' && activeIndex > 0) setSelectedStory(storySequence[activeIndex - 1])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedStory?.id, activeIndex, storySequence.length, navigate])

  function handleStoryFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      validateStoryMedia(file)
      setStoryFile(file)
      setError('')
    } catch (caught) {
      setStoryFile(null)
      setError(userFacingError(caught, 'Could not select this story media.'))
      event.target.value = ''
    }
  }

  async function publishStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session?.user.id || (!storyText.trim() && !storyFile) || isPublishing) return
    setIsPublishing(true)
    setError('')
    try {
      await createStory(session.user.id, storyText, storyFile)
      setStoryText('')
      setStoryFile(null)
      const input = document.getElementById('story-media') as HTMLInputElement | null
      if (input) input.value = ''
      await refreshStories()
      if (isManagingOwnStories) setShowCreateStory(false)
      setSuccess('Your story is live for 24 hours.')
    } catch (caught) {
      setError(storyPublishError(caught))
    } finally {
      setIsPublishing(false)
    }
  }

  async function removeStory(story: StoryRecord) {
    if (!session?.user.id || story.user_id !== session.user.id) return
    try {
      await deleteStory(story)
      const remaining = stories.filter((item) => item.id !== story.id)
      setStories(remaining)
      if (isManagingOwnStories) {
        setSelectedStory(null)
        return
      }
      const nextGrouped = Array.from(remaining.reduce((map, item) => {
        if (!map.has(item.user_id)) map.set(item.user_id, item)
        return map
      }, new Map<string, StoryRecord>()).values())
      const nextSequence = nextGrouped.flatMap((latest) => remaining
        .filter((item) => item.user_id === latest.user_id)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)))
      const nextIndex = Math.min(activeIndex, nextSequence.length - 1)
      setSelectedStory(nextSequence[nextIndex] ?? null)
    } catch (caught) {
      setError(userFacingError(caught, 'Could not delete this story.'))
    }
  }

  async function replyToStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedStory || !replyMessage.trim() || !session?.user.id || selectedStory.user_id === session.user.id || isReplying) return
    setIsReplying(true)
    setError('')
    try {
      const conversation = await getOrCreateConversation(selectedStory.user_id)
      await sendConversationMessage(conversation, `↩️ Replied to ${selectedStory.author?.display_name || selectedStory.author?.username || 'your'} story:\n\n${replyMessage.trim()}\n\nStory: /stories?story=${selectedStory.id}`)
      setReplyMessage('')
      setSuccess('Message sent')
    } catch (caught) {
      setError(userFacingError(caught, 'Could not send your story reply.'))
    } finally {
      setIsReplying(false)
    }
  }

  const openViewer = (story: StoryRecord) => {
    markStoryViewed(story)
    setSelectedStory(story)
    setReplyMessage('')
    setSuccess('')
  }

  useEffect(() => {
    let active = true
    const value = storyShareQuery.trim()
    setStoryShareError('')
    if (value.length < 2 || !storyShareOpen) {
      setStoryShareResults([])
      setStoryShareLoading(false)
      return () => { active = false }
    }
    setStoryShareLoading(true)
    const timer = window.setTimeout(() => {
      void searchProfilesByUsername(value).then((results) => {
        if (active) setStoryShareResults(results.slice(0, 8))
      }).catch((caught) => {
        if (active) setStoryShareError(userFacingError(caught, 'Could not search usernames.'))
      }).finally(() => {
        if (active) setStoryShareLoading(false)
      })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [storyShareQuery, storyShareOpen])

  async function sendStoryToUser(user: ProfileRecord) {
    if (!selectedStory || storyShareSending) return
    setStoryShareSending(true)
    setStoryShareError('')
    try {
      const conversation = await getOrCreateConversation(user.id)
      await sendConversationMessage(conversation, `Story: /stories?story=${selectedStory.id}`)
      setStoryShareOpen(false)
      setStoryShareQuery('')
      setStoryShareResults([])
      setSuccess(`Story sent to @${user.username}`)
    } catch (caught) {
      setStoryShareError(userFacingError(caught, 'Could not send this story.'))
    } finally {
      setStoryShareSending(false)
    }
  }

  return <section className="page-stack">
    {!isLoading && !selectedStory && <>
          <PageHeading
            eyebrow={isManagingOwnStories ? 'YOUR MOMENTS' : isDirectCreate ? 'CREATE A STORY' : 'LITTLE WINDOWS INTO TODAY'}
            title={isManagingOwnStories ? 'Stories' : isDirectCreate ? 'Create story' : 'Stories'}
            description={isManagingOwnStories ? 'View the stories you have shared and add another whenever you like.' : 'Share a photo, video, or message. Stories disappear after 24 hours.'}
          />
          {(!isManagingOwnStories || showCreateStory) && <form className="story-create-box" onSubmit={publishStory}>
            <div className="post-card__author"><Avatar name={profile?.display_name || profile?.username || 'Your profile'} image={profile?.avatar_url ?? undefined} /><span><strong>Your story</strong><span>Visible for 24 hours</span></span></div>
            <textarea aria-label="Story message" value={storyText} onChange={(event) => setStoryText(event.target.value)} placeholder="Add a message to your story (optional)" maxLength={500} />
            {storyFile && storyPreviewUrl && <div className="story-create-preview">
              {storyFile.type.startsWith('video/') ? <video src={storyPreviewUrl} controls playsInline className="story-create-preview__asset" /> : <img src={storyPreviewUrl} alt="Story preview" className="story-create-preview__asset" />}
              <div className="story-create-preview__details"><span><strong>Ready to share</strong><small>{storyFile.name} · {(storyFile.size / (1024 * 1024)).toFixed(1)} MB</small></span><button type="button" className="story-create-preview__remove" onClick={() => { setStoryFile(null); const input = document.getElementById('story-media') as HTMLInputElement | null; if (input) input.value = ''; if (storyCameraInputRef.current) storyCameraInputRef.current.value = '' }} aria-label="Remove selected story media"><X size={18} /></button></div>
            </div>}
            <div className="story-create-box__media"><label className="button button--outline" htmlFor="story-media">Add photo or video</label><button type="button" className="button button--outline" onClick={() => storyCameraInputRef.current?.click()}><Camera size={15} /> Camera</button><input id="story-media" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={handleStoryFile} /><input ref={storyCameraInputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={handleStoryFile} />{storyFile && <span className="micro-note">{storyFile.name} · {(storyFile.size / (1024 * 1024)).toFixed(1)} MB</span>}<span className="micro-note">JPG, PNG, WEBP, GIF, MP4, WebM or MOV · max 50 MB</span></div>
            <Button type="submit" disabled={isPublishing || (!storyText.trim() && !storyFile)}>{isPublishing ? 'Publishing…' : 'Post story'} <Send size={15} /></Button>
          </form>}
          {error && <p className="field__error" role="alert">{error}</p>}
          {success && <p className="micro-note" role="status">{success}</p>}
          {isLoading ? <Loading label="Loading stories" /> : isManagingOwnStories ? (
            <div className="story-page-thumbs story-page-thumbs--manage">
              <div className="section-heading"><h2>Active stories</h2><span className="local-label">{ownStories.length} {ownStories.length === 1 ? 'story' : 'stories'}</span></div>
              {ownStories.length ? <div className="story-manage-list">{ownStories.map((story) => {
                const storyName = story.content.trim() || (story.media_type === 'video' ? 'Video story' : story.media_type === 'image' ? 'Photo story' : 'Text story')
                return <div className="story-manage-row" key={story.id}>
                  <button type="button" className="story-manage-row__open" onClick={() => openViewer(story)}>
                    <span className="story-manage-row__thumb">
                      {story.media_url && story.media_type === 'video' ? <video src={story.media_url} muted playsInline /> : story.media_url ? <img src={story.media_url} alt="" /> : <span>✦</span>}
                    </span>
                    <span className="story-manage-row__details"><strong>{storyName}</strong><small>{new Date(story.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small><small>Tap to view story</small></span>
                    <ChevronRight size={18} />
                  </button>
                  <button type="button" className="story-manage-row__delete" onClick={() => void removeStory(story)} aria-label="Delete story"><Trash2 size={17} /></button>
                </div>
              })}</div> : <EmptyState title="No active stories" description="Add a photo, video, or message to share your first story." />}
              {!showCreateStory && <Button block onClick={() => setShowCreateStory(true)}><Plus size={17} /> Add Story</Button>}
              {showCreateStory && <Button variant="quiet" onClick={() => { setShowCreateStory(false); setError(''); setSuccess('') }}>Cancel adding story</Button>}
            </div>
          ) : isDirectCreate ? null : grouped.length === 0 ? <EmptyState title="No active stories" description="Be the first to share something with the community." /> : <div className="story-page-thumbs"><div className="section-heading"><h2>Today's stories</h2><span className="local-label">{grouped.length} people</span></div><div className="stories-rail__items">{grouped.map((story) => {
            const name = story.author?.display_name || story.author?.username || 'Community member'
            return <button type="button" key={story.user_id} className="story-card story-card--button" onClick={() => openViewer(story)}><span className="story-card__ring"><Avatar name={name} image={story.author?.avatar_url ?? undefined} size="large" /></span><span className="story-card__name">{name}</span></button>
          })}</div></div>}
    </>}
      {storyViewersOpen && selectedStory?.user_id === session?.user.id && <div className="story-viewers-modal-backdrop" onClick={() => setStoryViewersOpen(false)}><div className="story-viewers-modal" role="dialog" aria-modal="true" aria-label="Story viewers" onClick={(event) => event.stopPropagation()}><div className="story-viewers-modal__head"><div><strong>Story viewers</strong><span>{storyViewers.length} {storyViewers.length === 1 ? 'view' : 'views'}</span></div><button type="button" onClick={() => setStoryViewersOpen(false)} aria-label="Close"><X size={19} /></button></div><div className="story-viewers-modal__list">{storyViewersLoading ? <Loading label="Loading viewers" /> : storyViewers.length === 0 ? <EmptyState title="No views yet" description="People who view your story will appear here." /> : storyViewers.map((viewer) => { const name = viewer.display_name || viewer.username || 'Community member'; return <div className="story-viewer-row" key={viewer.id}><Avatar name={name} image={viewer.avatar_url ?? undefined} /><div><strong>{name}</strong>{viewer.username && <span>@{viewer.username}</span>}</div></div> })}</div></div></div>}
    {selectedStory && (grouped.length > 0 || Boolean(initialStory)) && <div className="story-fullscreen" role="dialog" aria-modal="true" aria-label="Story viewer">
      <div className="story-fullscreen__backdrop" onClick={closeStoryViewer} />
      <div className="story-fullscreen__card" onPointerDown={handleStoryPointerDown} onPointerMove={handleStoryPointerMove} onPointerUp={handleStoryPointerUp} onPointerCancel={() => { storySwipeStart.current = null }}>
        <div className="story-fullscreen__progress">{storySequence.map((story, index) => <span key={story.id} style={index === activeIndex ? ({ '--story-duration': selectedStory.media_type === 'video' ? '8s' : '5s' } as React.CSSProperties) : undefined} className={`story-fullscreen__progress-segment${index < activeIndex ? ' is-complete' : index === activeIndex ? ' is-active' : ''}`} />)}</div>
        {selectedStory.user_id === session?.user.id ? <button type="button" className="story-fullscreen__view-button" onClick={(event) => { event.stopPropagation(); void openStoryViewers() }} aria-label="View story viewers"><Eye size={16} /> <span>View</span></button> : null}
        <div className="story-fullscreen__head">
          <div className="post-card__author"><Avatar name={selectedStory.author?.display_name || selectedStory.author?.username || 'Community member'} image={selectedStory.author?.avatar_url ?? undefined} /><span><strong>{selectedStory.author?.display_name || selectedStory.author?.username || 'Community member'}</strong><span>{new Date(selectedStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span></div>
          <div className="story-fullscreen__head-actions">
            {selectedStory.user_id !== session?.user.id && <div className="story-fullscreen__menu-wrap">
              <button type="button" className="story-fullscreen__close" aria-label="Story options" onClick={() => setStoryMenuOpen((open) => !open)}><MoreVertical size={22} /></button>
              {storyMenuOpen && <div className="story-fullscreen__menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setStoryMenuOpen(false); setStoryShareOpen(true); setStoryShareError('') }}><Forward size={16} /> Share story</button>
                <button type="button" role="menuitem" onClick={muteSelectedStory}><VolumeX size={16} /> Mute story</button>
                <button type="button" role="menuitem" onClick={() => void downloadSelectedStory()}><Download size={16} /> Download</button>
              </div>}
            </div>}
            <button type="button" className="story-fullscreen__close" onClick={closeStoryViewer} aria-label="Close story"><X size={22} /></button>
          </div>
        </div>
        <button type="button" className="story-fullscreen__prev" onClick={() => activeIndex > 0 && setSelectedStory(storySequence[activeIndex - 1])} disabled={activeIndex <= 0} aria-label="Previous story"><ArrowLeft size={25} /></button>
        <div className="story-fullscreen__touch-left" role="button" tabIndex={0} aria-label="Previous story" onClick={() => activeIndex > 0 && setSelectedStory(storySequence[activeIndex - 1])} />
        <div className="story-fullscreen__touch-right" role="button" tabIndex={0} aria-label="Next story" onClick={() => activeIndex < storySequence.length - 1 && setSelectedStory(storySequence[activeIndex + 1])} />
        <div className="story-fullscreen__content">
          {selectedStory.media_url && selectedStory.media_type === 'video' && <video src={selectedStory.media_url} controls autoPlay playsInline className="story-fullscreen__asset" />}
          {selectedStory.media_url && selectedStory.media_type === 'image' && <img src={selectedStory.media_url} alt="Story" className="story-fullscreen__asset" />}
          {!selectedStory.media_url && <div className="story-fullscreen__text">{selectedStory.content}</div>}
          {selectedStory.media_url && selectedStory.content && <div className="story-fullscreen__caption">{selectedStory.content}</div>}
        </div>
        <button type="button" className="story-fullscreen__next" onClick={() => activeIndex < storySequence.length - 1 && setSelectedStory(storySequence[activeIndex + 1])} aria-label="Next story"><ArrowRight size={25} /></button>
        {selectedStory.user_id !== session?.user.id && (
          <div className="story-fullscreen__reply">
            <form onSubmit={replyToStory}>
              <Input aria-label="Reply to story" placeholder="Send message…" value={replyMessage} onChange={(event) => setReplyMessage(event.target.value)} />
              <Button type="submit" iconOnly aria-label="Send message" disabled={!replyMessage.trim() || isReplying}>{isReplying ? '…' : <Send size={17} />}</Button>
            </form>
            <Button type="button" variant="quiet" iconOnly aria-label={storyLikedIds.includes(selectedStory.id) ? 'Story liked' : 'Like story'} title={storyLikedIds.includes(selectedStory.id) ? 'Liked' : 'Like story'} disabled={storyLikedIds.includes(selectedStory.id) || storyActionBusy} onClick={() => void likeSelectedStory()} className={storyLikedIds.includes(selectedStory.id) ? 'story-like-button is-liked' : 'story-like-button'}>
              <Heart size={20} fill={storyLikedIds.includes(selectedStory.id) ? 'currentColor' : 'none'} />
            </Button>
          </div>
        )}
        {storyShareOpen && (
          <Modal open={storyShareOpen} title="Send story" onClose={() => !storyShareSending && setStoryShareOpen(false)}>
            <div className="story-share-panel">
              <Input aria-label="Search username" placeholder="Search username" value={storyShareQuery} onChange={(event) => setStoryShareQuery(event.target.value)} autoComplete="off" autoFocus />
              {storyShareError && <p className="field__error" role="alert">{storyShareError}</p>}
              {storyShareLoading && <Loading label="Searching usernames" />}
              {!storyShareLoading && storyShareResults.map((user) => (
                <button type="button" className="story-share-user" key={user.id} onClick={() => void sendStoryToUser(user)} disabled={storyShareSending}>
                  <Avatar name={user.display_name || user.username} image={user.avatar_url ?? undefined} />
                  <span><strong>{user.display_name || user.username}</strong><small>@{user.username}</small></span>
                  <Send size={16} />
                </button>
              ))}
              {!storyShareLoading && storyShareQuery.trim().length >= 2 && !storyShareResults.length && !storyShareError && <p className="micro-note">No username found.</p>}
            </div>
          </Modal>
        )}
        {selectedStory.user_id === session?.user.id && (
          <button type="button" className="story-fullscreen__delete" onClick={() => void removeStory(selectedStory)}>
            <Trash2 size={16} /> Delete story
          </button>
        )}
      </div>
    </div>}
  </section>
}

export function ReelsPage() {
  return <section className="page-stack"><PageHeading eyebrow="SHORT COMMUNITY FILMS" title="Reels" description="A small visual preview of stories in motion." /><PreviewNotice /><div className="reel-placeholder"><img src="/loom-preview.svg" alt="Abstract, Banjara-inspired geometric threadwork" /><div className="reel-placeholder__copy"><span className="eyebrow">LOCAL ARTWORK PREVIEW</span><h2>Made by hand,<br />held in memory.</h2><p>Short videos will live here when media is connected.</p><Button to="/about" variant="outline">About the community</Button></div></div></section>
}

export function ChatListPage() {
  const { session, onlineUserIds, activeUserIds } = useAuth()
  const chatListCacheKey = session?.user.id ? `chat-list:${session.user.id}` : ''
  const cachedConversations = chatListCacheKey ? getCached<Awaited<ReturnType<typeof loadConversations>>>(chatListCacheKey) : null
  const [conversations, setConversations] = useState<Awaited<ReturnType<typeof loadConversations>>>(cachedConversations ?? [])
  const [isLoading, setIsLoading] = useState(cachedConversations === null)
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [mutedIds, setMutedIds] = useState<string[]>([])
  const holdTimer = useRef<number | null>(null)
  const holdPointerId = useRef<number | null>(null)
  const holdStartPoint = useRef<{ x: number; y: number } | null>(null)
  const suppressNextChatClick = useRef(false)


  useEffect(() => {
    let active = true
    let requestPending = false
    let refreshQueued = false
    setError('')
    const cached = session?.user.id ? getCached<Awaited<ReturnType<typeof loadConversations>>>(`chat-list:${session.user.id}`) : null
    if (cached !== null) {
      setConversations(cached)
      setIsLoading(false)
    } else {
      setIsLoading(true)
    }
    const refresh = async () => {
      if (requestPending) { refreshQueued = true; return }
      requestPending = true
      do {
        refreshQueued = false
        try {
          const rows = await loadConversations()
          if (active) {
            setConversations(rows)
            if (session?.user.id) setCached(`chat-list:${session.user.id}`, rows, 60_000)
            setError('')
          }
        } catch (caught) {
          if (active) setError(userFacingError(caught, 'Could not load conversations.'))
        } finally {
          if (active) setIsLoading(false)
        }
      } while (active && refreshQueued)
      requestPending = false
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    void refresh()
    const unsubscribeMessages = subscribeToPostgresChanges({
      topic: `chat-list:${session?.user.id}`,
      event: '*',
      table: 'messages',
    }, () => {
      invalidateConversationListCache()
      if (session?.user.id) invalidateCache(`chat-list:${session.user.id}`)
      void refresh()
    })
    const unsubscribeReads = subscribeToPostgresChanges({
      topic: `chat-list-reads:${session?.user.id}`,
      event: '*',
      table: 'message_reads',
      filter: `user_id=eq.${session?.user.id}`,
    }, () => {
      invalidateConversationListCache()
      if (session?.user.id) invalidateCache(`chat-list:${session.user.id}`)
      void refresh()
    })
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      active = false
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      unsubscribeMessages()
      unsubscribeReads()
    }
  }, [session?.user.id])

  function clearHold() {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    holdPointerId.current = null
    holdStartPoint.current = null
  }
  function startHold(id: string, event: React.PointerEvent<HTMLAnchorElement>) {
    clearHold()
    holdPointerId.current = event.pointerId
    holdStartPoint.current = { x: event.clientX, y: event.clientY }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* ignore */ }
    holdTimer.current = window.setTimeout(() => {
      setSelectedIds([id])
      suppressNextChatClick.current = true
      holdTimer.current = null
    }, 550)
  }
  function handleHoldMove(event: React.PointerEvent<HTMLAnchorElement>) {
    if (holdPointerId.current !== event.pointerId || !holdStartPoint.current) return
    const dx = event.clientX - holdStartPoint.current.x
    const dy = event.clientY - holdStartPoint.current.y
    if (Math.hypot(dx, dy) > 10) clearHold()
  }
  function selectChat(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }
  function persistList(key: string, ids: string[]) {
    try { window.localStorage.setItem(key, JSON.stringify(ids)) } catch { /* ignore */ }
  }
  function deleteSelected() {
    setConversations((current) => current.filter((conversation) => !selectedIds.includes(conversation.id)))
    setSelectedIds([])
  }
  function toggleMuteSelected() {
    const allMuted = selectedIds.every((id) => mutedIds.includes(id))
    const next = allMuted ? mutedIds.filter((id) => !selectedIds.includes(id)) : [...new Set([...mutedIds, ...selectedIds])]
    setMutedIds(next); persistList('banjara-chat-muted', next)
  }
  async function blockSelected() {
    const rows = conversations.filter((item) => selectedIds.includes(item.id))
    try {
      for (const row of rows) await toggleBlock(row.member.id, false)
      setSelectedIds([])
    } catch (caught) {
      setError(userFacingError(caught, 'Could not block the selected users.'))
    }
  }
  const visibleConversations = conversations

  return <section className="page-stack">
    <PageHeading eyebrow="CONVERSATIONS" title="Chat" description="Your conversations." />
    {selectedIds.length > 0 && <div className="chat-list-selection" role="toolbar" aria-label="Selected chats">
      <button type="button" onClick={() => setSelectedIds([])} aria-label="Close selection">×</button>
      <strong>{selectedIds.length} selected</strong>
      <button type="button" onClick={deleteSelected}>Delete</button>
      <button type="button" onClick={toggleMuteSelected}>{selectedIds.every((id) => mutedIds.includes(id)) ? 'Unmute' : 'Mute'}</button>
      <button type="button" onClick={() => void blockSelected()}><Ban size={14} /> Block</button>
    </div>}
    {isLoading ? <Loading label="Loading conversations" /> : error && !conversations.length ? <ErrorState title="Could not load conversations" description={error} /> : visibleConversations.length ? <div className="chat-list">
      {visibleConversations.map((conversation) => {
        const name = conversation.member.display_name || conversation.member.username
        const selected = selectedIds.includes(conversation.id)
        const online = onlineUserIds.has(conversation.member.id)
        const inApp = activeUserIds.has(conversation.member.id)
        return <Link
          to={selectedIds.length ? '#' : `/chat/${conversation.id}`}
          className={`chat-row${selected ? ' chat-row--selected' : ''}`}
          key={conversation.id}
          onPointerDown={(event) => startHold(conversation.id, event)}
          onPointerMove={handleHoldMove}
          onPointerUp={clearHold}
          onPointerCancel={clearHold}
          onPointerLeave={clearHold}
          onContextMenu={(event) => { event.preventDefault(); clearHold(); setSelectedIds([conversation.id]); suppressNextChatClick.current = true }}
          onClick={(event) => {
            if (suppressNextChatClick.current) { event.preventDefault(); suppressNextChatClick.current = false; return }
            if (selectedIds.length > 0) { event.preventDefault(); selectChat(conversation.id) }
          }}
        >
          <Avatar name={name} image={conversation.member.avatar_url ?? undefined} />
          <span className="chat-row__copy"><strong>{name}</strong><span>{conversation.lastMessage?.content || (conversation.lastMessage?.media_type === 'image' ? '📷 Photo' : conversation.lastMessage?.media_type === 'video' ? '🎥 Video' : conversation.lastMessage?.media_type === 'document' ? '📎 Document' : 'No messages yet')}</span></span>
          <span className="chat-row__time"><small className={online ? 'chat-online-dot' : 'chat-offline-dot'}>{online ? (inApp ? 'online' : 'online · not in app') : 'offline'}</small>{mutedIds.includes(conversation.id) && <VolumeX size={13} />}{conversation.unreadCount > 0 ? `${conversation.unreadCount} unread` : conversation.lastMessage ? new Date(conversation.lastMessage.created_at).toLocaleDateString() : ''}</span>
        </Link>
      })}
    </div> : <EmptyState title="No conversations yet" description="Start a conversation from a community profile." />}
    {error && conversations.length > 0 && <p className="field__error" role="alert">{error}</p>}
  </section>
}

// Chat conversation state declarations verified for Vercel build
export function ChatConversationPage() {
  useChatKeyboardViewportLock()
  const { conversationId = '' } = useParams()
  const { session, onlineUserIds, activeUserIds } = useAuth()
  const chatHistoryCacheKey = session?.user.id && conversationId ? `chat-history:${session.user.id}:${conversationId}` : ''
  const cachedChatHistory = chatHistoryCacheKey ? getCached<{ person: ProfileRecord; messages: ChatMessage[]; hasOlderMessages: boolean }>(chatHistoryCacheKey) : null
  const [message, setMessage] = useState('')
  const [person, setPerson] = useState<ProfileRecord | null>(cachedChatHistory?.person ?? null)
  const [messages, setMessages] = useState<ChatMessage[]>(cachedChatHistory?.messages ?? [])
  const [isLoading, setIsLoading] = useState(cachedChatHistory === null)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(cachedChatHistory?.hasOlderMessages ?? false)
  const [error, setError] = useState('')
  const [realtimeError, setRealtimeError] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState('')
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([])
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null)
  const [isSendingMedia, setIsSendingMedia] = useState(false)
  const [mediaViewer, setMediaViewer] = useState<ChatMessage | null>(null)
  const [mediaViewerSize, setMediaViewerSize] = useState('Checking size…')
  const [mediaViewerFullscreen, setMediaViewerFullscreen] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  const [forwardQuery, setForwardQuery] = useState('')
  const [forwardConversations, setForwardConversations] = useState<Awaited<ReturnType<typeof loadConversations>>>([])
  const [forwardProfiles, setForwardProfiles] = useState<ProfileRecord[]>([])
  const [forwardSearchLoading, setForwardSearchLoading] = useState(false)
  const [forwardLoading, setForwardLoading] = useState(false)
  const [forwardingTo, setForwardingTo] = useState('')
  const [forwardError, setForwardError] = useState('')
  const [selectedForwardIds, setSelectedForwardIds] = useState<string[]>([])
  const stickToLatest = useRef(true)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const suppressNextMessageClick = useRef(false)
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const [chatThemeOpen, setChatThemeOpen] = useState(false)
  const [chatTheme, setChatTheme] = useState('classic')
  const peerOnline = Boolean(person?.id && onlineUserIds.has(person.id))
  const peerInApp = Boolean(person?.id && activeUserIds.has(person.id))
  const initialBottomScrollDone = useRef(false)

  useEffect(() => {
    initialBottomScrollDone.current = false
  }, [conversationId])

  useEffect(() => {
    const query = forwardQuery.trim()
    if (!forwardOpen || query.length < 2) { setForwardProfiles([]); setForwardSearchLoading(false); return }
    let active = true
    const timer = window.setTimeout(() => {
      setForwardSearchLoading(true)
      void searchProfilesByUsername(query).then((rows) => {
        if (active) setForwardProfiles(rows.filter((row) => row.id !== session?.user.id))
      }).catch((caught) => {
        if (active) setForwardError(userFacingError(caught, 'Could not search contacts.'))
      }).finally(() => { if (active) setForwardSearchLoading(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [forwardOpen, forwardQuery, session?.user.id])

  useEffect(() => {
    if (!mediaViewer?.media_signed_url || !mediaViewer.media_type) { setMediaViewerSize('Size unavailable'); return }
    let active = true
    setMediaViewerSize('Checking size…')
    void fetch(mediaViewer.media_signed_url, { method: 'HEAD' }).then((response) => {
      const raw = response.headers.get('content-length')
      if (!active) return
      if (response.ok && raw && Number.isFinite(Number(raw))) {
        const bytes = Number(raw)
        setMediaViewerSize(bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`)
      } else setMediaViewerSize('Size unavailable')
    }).catch(() => { if (active) setMediaViewerSize('Size unavailable') })
    return () => { active = false }
  }, [mediaViewer?.id, mediaViewer?.media_signed_url])

  useEffect(() => {
    if (isLoading || !messages.length || initialBottomScrollDone.current) return
    initialBottomScrollDone.current = true
    const scrollToLatest = () => {
      const pane = document.querySelector('.chat-screen .chat-messages') as HTMLElement | null
      if (!pane) return
      pane.scrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight)
    }
    const frame = window.requestAnimationFrame(() => {
      scrollToLatest()
      window.requestAnimationFrame(scrollToLatest)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [conversationId, isLoading, messages.length])

  useEffect(() => {
    if (isLoading || !initialBottomScrollDone.current || !stickToLatest.current) return
    const pane = document.querySelector('.chat-screen .chat-messages') as HTMLElement | null
    if (!pane) return
    const frame = window.requestAnimationFrame(() => { pane.scrollTop = pane.scrollHeight })
    return () => window.cancelAnimationFrame(frame)
  }, [isLoading, messages.length])

  const chatThemes = [
    { id: 'forest', label: 'Gor Forest', preview: '#2D6652' },
    { id: 'classic', label: 'Rathod Heritage', preview: '#7A263A' },
    { id: 'sand', label: 'Pawar Desert', preview: '#A56A3A' },
    { id: 'rose', label: 'Chauhan Rose', preview: '#A44B68' },
    { id: 'midnight', label: 'Night Camp', preview: '#182235' },
  ]

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | null = null
    let unsubscribeReads: (() => void) | null = null
    let messageRefreshPending = false
    let messageRefreshQueued = false
    const cached = session?.user.id ? getCached<{ person: ProfileRecord; messages: ChatMessage[]; hasOlderMessages: boolean }>(`chat-history:${session.user.id}:${conversationId}`) : null
    setIsLoading(cached === null)
    setError('')
    setRealtimeError('')
    setPerson(cached?.person ?? null)
    setMessages(cached?.messages ?? [])
    setHasOlderMessages(cached?.hasOlderMessages ?? false)
    setSelectedMedia(null)
    setChatMenuOpen(false)
    setChatThemeOpen(false)
    try {
      setChatTheme(window.localStorage.getItem(`banjara-chat-theme-${conversationId}`) || 'classic')
    } catch {
      setChatTheme('classic')
    }
    if (mediaInputRef.current) mediaInputRef.current.value = ''
    void (async () => {
      try {
        const [peer, history] = await Promise.all([loadConversationPeer(conversationId), loadConversationMessages(conversationId)])
        if (!active) return
        setPerson(peer as ProfileRecord)
        setMessages(history.messages)
        setHasOlderMessages(history.hasMore)
        if (session?.user.id) setCached(`chat-history:${session.user.id}:${conversationId}`, { person: peer as ProfileRecord, messages: history.messages, hasOlderMessages: history.hasMore }, 60_000)
        void hydrateConversationMediaUrls(history.messages).then((ready) => {
          if (!active) return
          setMessages((current) => current.map((item) => {
            const media = ready.find((candidate) => candidate.id === item.id)
            return media ? { ...item, media_signed_url: media.media_signed_url } : item
          }))
        })
        const refreshLatestMessages = async () => {
          if (messageRefreshPending) {
            messageRefreshQueued = true
            return
          }
          messageRefreshPending = true
          do {
            messageRefreshQueued = false
            try {
              const latest = await loadConversationMessages(conversationId)
              if (!active) return
              setMessages((current) => {
                const byId = new Map(current.map((item) => [item.id, item]))
                for (const item of latest.messages) byId.set(item.id, item)
                const merged = [...byId.values()].sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
                if (session?.user.id) setCached(`chat-history:${session.user.id}:${conversationId}`, { person: peer as ProfileRecord, messages: merged, hasOlderMessages: history.hasMore }, 60_000)
                return merged
              })
              void hydrateConversationMediaUrls(latest.messages).then((ready) => {
                if (!active) return
                setMessages((current) => {
                  const byId = new Map(current.map((item) => [item.id, item]))
                  for (const item of ready) {
                    const existing = byId.get(item.id) ?? item
                    byId.set(item.id, { ...existing, media_signed_url: item.media_signed_url })
                  }
                  const merged = [...byId.values()].sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
                  if (session?.user.id) setCached(`chat-history:${session.user.id}:${conversationId}`, { person: peer as ProfileRecord, messages: merged, hasOlderMessages: history.hasMore }, 60_000)
                  return merged
                })
              })
            } catch (caught) {
              if (active) setError(userFacingError(caught, 'Could not refresh messages.'))
            }
          } while (active && messageRefreshQueued)
          messageRefreshPending = false
        }
        unsubscribe = subscribeToConversation(conversationId, () => {
          void refreshLatestMessages()
        }, (status) => {
          if (!active) return
          setRealtimeError(status === 'SUBSCRIBED' ? '' : `Live message updates are unavailable (${status.toLowerCase().replace('_', ' ')}).`)
        })
        if (peer?.id) {
          unsubscribeReads = subscribeToPostgresChanges(
            { topic: `chat-reads:${conversationId}`, event: '*', table: 'message_reads', filter: `user_id=eq.${peer.id}` },
            () => { void refreshLatestMessages() },
          )
        }
      } catch (caught) {
        if (active) setError(userFacingError(caught, 'Could not load this conversation.'))
      } finally {
        if (active) setIsLoading(false)
      }
    })()
    return () => {
      active = false
      unsubscribe?.()
      unsubscribeReads?.()
    }
  }, [conversationId, session?.user.id])

  async function loadOlderMessages() {
    const oldest = messages[0]
    if (!oldest || isLoadingOlder || !hasOlderMessages) return
    stickToLatest.current = false
    setIsLoadingOlder(true)
    setError('')
    try {
      const page = await loadConversationMessages(conversationId, { created_at: oldest.created_at, id: oldest.id })
      setMessages((current) => {
        const byId = new Map(page.messages.map((item) => [item.id, item]))
        for (const item of current) byId.set(item.id, item)
        return [...byId.values()].sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
      })
      setHasOlderMessages(page.hasMore)
    } catch (caught) {
      setError(userFacingError(caught, 'Could not load earlier messages.'))
    } finally {
      setIsLoadingOlder(false)
    }
  }

  function clearLongPressTimer() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function toggleMessageSelection(messageId: string) {
    setSelectedMessageIds((current) => current.includes(messageId)
      ? current.filter((id) => id !== messageId)
      : [...current, messageId])
  }

  function startMessageLongPress(messageId: string) {
    clearLongPressTimer()
    longPressTimer.current = window.setTimeout(() => {
      setSelectedMessageIds((current) => current.includes(messageId) ? current : [...current, messageId])
      suppressNextMessageClick.current = true
      longPressTimer.current = null
    }, 550)
  }

  function handleMessageContextMenu(event: MouseEvent, messageId: string) {
    event.preventDefault()
    clearLongPressTimer()
    suppressNextMessageClick.current = true
    setSelectedMessageIds((current) => current.includes(messageId) ? current : [...current, messageId])
  }

  function cancelMessageSelection() {
    clearLongPressTimer()
    setSelectedMessageIds([])
  }

  async function openForwardPicker() {
    setForwardOpen(true)
    setSelectedForwardIds([])
    setForwardError('')
    setForwardLoading(true)
    try { setForwardConversations(await loadConversations()) }
    catch (caught) { setForwardError(userFacingError(caught, 'Could not load your conversations.')) }
    finally { setForwardLoading(false) }
  }

  async function forwardSelectedMessagesToUser(userId: string) {
    try {
      const existing = forwardConversations.find((row) => row.member.id === userId)
      const destinationId = existing?.id ?? await getOrCreateConversation(userId)
      await forwardSelectedMessagesTo(destinationId)
    } catch (caught) {
      setForwardError(userFacingError(caught, 'Could not open this contact for forwarding.'))
    }
  }

  async function sendForwardedToSelectedContacts() {
    if (!selectedForwardIds.length || forwardingTo) return
    setForwardError(''); setForwardingTo('multiple')
    try {
      const destinations = selectedForwardIds.map((id) => ({ id, conversationId: forwardConversations.find((row) => row.id === id)?.id, userId: forwardProfiles.find((profile) => profile.id === id)?.id }))
      const selected = messages.filter((item) => selectedMessageIds.includes(item.id) && !item.is_deleted_for_everyone)
      for (const destination of destinations) {
        const target = destination.conversationId ?? (destination.userId ? await getOrCreateConversation(destination.userId) : null)
        if (!target) continue
        for (const item of selected) {
          let file: File | undefined
          if (item.media_type && !item.media_signed_url) throw new Error('This media is still loading. Try forwarding again in a moment.')
          if (item.media_type && item.media_signed_url) {
            const response = await fetch(item.media_signed_url)
            if (!response.ok) throw new Error('Could not download a selected media item to forward.')
            const blob = await response.blob()
            const extension = item.media_type === 'image' ? 'jpg' : item.media_type === 'video' ? 'mp4' : 'bin'
            file = new File([blob], `forwarded-${item.media_type}-${Date.now()}.${extension}`, { type: blob.type || (item.media_type === 'image' ? 'image/jpeg' : item.media_type === 'video' ? 'video/mp4' : 'application/octet-stream') })
          }
          if (item.content.trim() || file) await sendConversationMessage(target, item.content, file)
        }
      }
      setForwardOpen(false); setForwardQuery(''); setSelectedForwardIds([]); setSelectedMessageIds([])
    } catch (caught) { setForwardError(userFacingError(caught, 'Could not forward to all selected contacts.')) }
    finally { setForwardingTo('') }
  }

  async function forwardSelectedMessagesTo(destinationId: string) {
    if (!selectedMessageIds.length || forwardingTo) return
    setForwardingTo(destinationId)
    setForwardError('')
    try {
      const selected = messages.filter((item) => selectedMessageIds.includes(item.id) && !item.is_deleted_for_everyone)
      for (const item of selected) {
        let file: File | undefined
        if (item.media_type && !item.media_signed_url) throw new Error('This media is still loading. Try forwarding again in a moment.')
        if (item.media_type && item.media_signed_url) {
          const response = await fetch(item.media_signed_url)
          if (!response.ok) throw new Error('Could not download a selected media item to forward.')
          const blob = await response.blob()
          const extension = item.media_type === 'image' ? 'jpg' : item.media_type === 'video' ? 'mp4' : 'bin'
          file = new File([blob], `forwarded-${item.media_type}-${Date.now()}.${extension}`, { type: blob.type || (item.media_type === 'image' ? 'image/jpeg' : item.media_type === 'video' ? 'video/mp4' : 'application/octet-stream') })
        }
        if (item.content.trim() || file) await sendConversationMessage(destinationId, item.content, file)
      }
      setForwardOpen(false)
      setForwardQuery('')
      setSelectedMessageIds([])
    } catch (caught) {
      setForwardError(userFacingError(caught, 'Could not forward the selected messages.'))
    } finally { setForwardingTo('') }
  }

  async function deleteSelectedMessages(mode: 'me' | 'everyone') {
    if (!selectedMessageIds.length || pendingDeleteId) return
    const selected = messages.filter((item) => selectedMessageIds.includes(item.id))
    setPendingDeleteId('bulk')
    setError('')
    try {
      if (mode === 'everyone') {
        const ownSelected = selected.filter((item) => item.sender_id === session?.user.id && !item.is_deleted_for_everyone)
        for (const item of ownSelected) await deleteMessageForEveryone(item.id)
        setMessages((current) => current.map((item) => ownSelected.some((selectedItem) => selectedItem.id === item.id)
          ? { ...item, content: '', media_url: null, media_type: null, is_deleted_for_everyone: true }
          : item))
      } else {
        for (const item of selected) {
          if (!item.is_deleted_for_everyone) await deleteMessageForMe(item.id)
        }
        setMessages((current) => current.filter((item) => !selectedMessageIds.includes(item.id)))
      }
      setSelectedMessageIds([])
    } catch (caught) {
      setError(userFacingError(caught, mode === 'everyone' ? 'Could not delete the selected messages for everyone.' : 'Could not delete the selected messages for you.'))
    } finally {
      setPendingDeleteId('')
    }
  }

  async function copySelectedMessages() {
    const selected = messages
      .filter((item) => selectedMessageIds.includes(item.id) && !item.is_deleted_for_everyone && item.content)
      .map((item) => item.content)
    if (!selected.length) return
    try {
      await navigator.clipboard.writeText(selected.join('\n'))
      setSelectedMessageIds([])
    } catch {
      setError('Could not copy the selected messages.')
    }
  }

  function handleMediaChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      validateChatMedia(file)
      setSelectedMedia(file)
      setError('')
    } catch (caught) {
      setSelectedMedia(null)
      setError(userFacingError(caught, 'Could not select this file.'))
      event.target.value = ''
    }
  }

  function clearSelectedMedia() {
    setSelectedMedia(null)
    if (mediaInputRef.current) mediaInputRef.current.value = ''
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const textToSend = message.trim()
    const mediaToSend = selectedMedia
    if (!textToSend && !mediaToSend) return
    setError('')

    if (mediaToSend) {
      setIsSendingMedia(true)
      clearSelectedMedia()
      try {
        const created = await sendConversationMessage(conversationId, textToSend, mediaToSend)
        setMessages((current) => current.some((item) => item.id === created.id) ? current : [...current, created])
        window.requestAnimationFrame(() => { const pane = document.querySelector('.chat-screen .chat-messages') as HTMLElement | null; if (pane) pane.scrollTop = pane.scrollHeight })
        if (textToSend === message.trim()) setMessage('')
      } catch (caught) {
        setError(userFacingError(caught, 'Could not send the photo or video.'))
      } finally {
        setIsSendingMedia(false)
      }
      return
    }

    stickToLatest.current = true
    try {
      const created = await sendConversationMessage(conversationId, textToSend)
      setMessages((current) => current.some((item) => item.id === created.id) ? current : [...current, created])
      window.requestAnimationFrame(() => { const pane = document.querySelector('.chat-screen .chat-messages') as HTMLElement | null; if (pane) pane.scrollTop = pane.scrollHeight })
      setMessage('')
    } catch (caught) {
      setError(userFacingError(caught, 'Could not send this message.'))
    }
  }

  if (isLoading) return <section className="chat-screen"><Loading label="Loading conversation" /></section>
  if (error && !person) return <section className="page-stack"><ErrorState title="Could not load conversation" description={error} /></section>
  if (!person) return <section className="page-stack"><EmptyState title="Conversation unavailable" description="This conversation could not be found." action={<Button to="/chat" variant="outline">Back to chats</Button>} /></section>
  const personName = person.display_name || person.username
  function selectChatTheme(themeId: string) {
    setChatTheme(themeId)
    setChatThemeOpen(false)
    setChatMenuOpen(false)
    try { window.localStorage.setItem(`banjara-chat-theme-${conversationId}`, themeId) } catch { /* local storage may be unavailable */ }
  }
  return <section className={`chat-screen chat-screen--theme-${chatTheme}`}><header className="chat-screen__head"><Button to="/chat" variant="quiet" iconOnly aria-label="Back to chats"><ArrowLeft size={18} /></Button><Link to={`/profile/${encodeURIComponent(person.username)}`} className="chat-screen__profile"><Avatar name={personName} image={person.avatar_url ?? undefined} /><span className="chat-screen__identity"><strong>{personName}</strong><small>{peerOnline ? (peerInApp ? "online" : "online · not in app") : "offline"}</small></span></Link><div className="chat-screen__actions"><button type="button" className="chat-screen__action" aria-label="Voice call" title="Voice call"><Phone size={18} /></button><button type="button" className="chat-screen__action" aria-label="Video call" title="Video call"><Video size={19} /></button><button type="button" className="chat-screen__action" aria-label="Chat options" title="Chat options" aria-expanded={chatMenuOpen} onClick={() => { setChatMenuOpen((current) => !current); setChatThemeOpen(false) }}><MoreVertical size={20} /></button>{chatMenuOpen && <div className="chat-options-menu"><button type="button" className="chat-options-menu__item" onClick={() => { setChatThemeOpen(true); setChatMenuOpen(false) }}><Palette size={17} /><span>Chat Background</span><ChevronRight size={15} /></button></div>}</div></header>{chatThemeOpen && <Modal open={chatThemeOpen} title="Chat background" onClose={() => setChatThemeOpen(false)}><div className="chat-theme-picker">{chatThemes.map((theme) => <button type="button" key={theme.id} className={`chat-theme-option${chatTheme === theme.id ? ' chat-theme-option--active' : ''}`} onClick={() => selectChatTheme(theme.id)}><span className="chat-theme-option__swatch" style={{ background: theme.preview }} /><span><strong>{theme.label}</strong><small>{theme.id === 'classic' ? 'Banjara Connect default' : 'Apply only to this chat'}</small></span>{chatTheme === theme.id && <Check size={17} />}</button>)}</div></Modal>}
    <div className="chat-messages" onScroll={(event) => { const pane = event.currentTarget; stickToLatest.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 120 }}>{hasOlderMessages && <Button variant="quiet" onClick={() => void loadOlderMessages()} disabled={isLoadingOlder}>{isLoadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}</Button>}{selectedMessageIds.length > 0 && <div className="chat-selection-toolbar"><button type="button" className="chat-selection-toolbar__close" onClick={cancelMessageSelection} aria-label="Close message selection">×</button><strong>{selectedMessageIds.length} selected</strong><button type="button" onClick={() => void copySelectedMessages()}>Copy</button><button type="button" onClick={() => void openForwardPicker()}><Forward size={14} /> Forward</button><button type="button" disabled={pendingDeleteId === 'bulk'} onClick={() => void deleteSelectedMessages('me')}>Delete for me</button>{messages.some((item) => selectedMessageIds.includes(item.id) && item.sender_id === session?.user.id && !item.is_deleted_for_everyone && (item.media_type === 'image' || item.media_type === 'video' || item.content)) && <button type="button" disabled={pendingDeleteId === 'bulk'} onClick={() => void deleteSelectedMessages('everyone')}>Delete for everyone</button>}</div>}{isSendingMedia && <div className="chat-media-sending chat-media-sending--inline" role="status" aria-live="polite"><span className="chat-media-sending__icon"><Paperclip size={14} /></span><span className="chat-media-sending__info"><strong>Sending media…</strong><small>Uploading into this conversation</small><span className="chat-media-sending__track"><span /></span></span></div>}{messages.length ? messages.map((item, index) => { const mine = item.sender_id === session?.user.id; const selected = selectedMessageIds.includes(item.id); const mediaUrl = item.media_signed_url; return <div className={`chat-message-row${mine ? ' chat-message-row--you' : ' chat-message-row--them'}${selected ? ' chat-message-row--selected' : ''}${index === 0 ? ' chat-message-row--first' : ''}`} key={item.id}><div className={`chat-bubble${mine ? ' chat-bubble--you' : ' chat-bubble--them'}${selected ? ' chat-bubble--selected' : ''}`} onPointerDown={() => startMessageLongPress(item.id)} onPointerUp={clearLongPressTimer} onPointerCancel={clearLongPressTimer} onPointerLeave={clearLongPressTimer} onContextMenu={(event) => handleMessageContextMenu(event, item.id)} onClick={() => {
  if (suppressNextMessageClick.current) {
    suppressNextMessageClick.current = false
    return
  }
  if (selectedMessageIds.length > 0) toggleMessageSelection(item.id)
}}>{item.is_deleted_for_everyone ? <em>Message deleted</em> : <>{mediaUrl && item.media_type === 'image' && <img className="chat-message-media" src={mediaUrl} alt="Shared photo" loading="lazy" onClick={(event) => { event.stopPropagation(); setMediaViewer(item); setMediaViewerFullscreen(false) }} />}{mediaUrl && item.media_type === 'video' && <video className="chat-message-media chat-message-media--video" src={mediaUrl} controls playsInline preload="metadata" onClick={(event) => { event.stopPropagation(); setMediaViewer(item); setMediaViewerFullscreen(false) }} />}{mediaUrl && item.media_type === 'document' && <button type="button" className="chat-document" onClick={(event) => { event.stopPropagation(); setMediaViewer(item); setMediaViewerFullscreen(false) }}><Paperclip size={17} /><span>Open document</span></button>}{item.content && <p className="chat-message-text">{renderChatMessageContent(item.content)}</p>}</>}<span className="chat-bubble__meta"><time>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>{mine && !item.is_deleted_for_everyone && <span className={`chat-read-ticks${peerInApp ? ' chat-read-ticks--glow' : peerOnline ? ' chat-read-ticks--delivered' : ''}`} aria-label={peerInApp ? 'Chat open' : peerOnline ? 'Delivered' : 'Sent'}>{peerOnline ? '✓✓' : '✓'}</span>}</span></div></div>}) : <p className="micro-note">No messages yet. Start the conversation.</p>}{realtimeError && <p className="field__error" role="status">{realtimeError}</p>}{error && <p className="field__error" role="alert">{error}</p>}</div><div className="chat-compose-area">{selectedMedia && !isSendingMedia && <div className="chat-attachment-preview"><span><Paperclip size={14} />{selectedMedia.name}</span><button type="button" onClick={clearSelectedMedia} aria-label="Remove selected media">×</button></div>}<form className="chat-disabled-compose" onSubmit={sendMessage}><input ref={mediaInputRef} className="chat-media-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={handleMediaChange} /><input ref={cameraInputRef} className="chat-media-input" type="file" accept="image/*" capture="environment" onChange={handleMediaChange} /><Input aria-label="Message" placeholder={selectedMedia ? 'Add a caption (optional)' : 'Write a message'} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} /><Button type="button" variant="quiet" iconOnly aria-label="Attach photo, video, or document" onClick={() => mediaInputRef.current?.click()} disabled={isSendingMedia}><Paperclip size={18} /></Button><Button type="button" variant="quiet" iconOnly aria-label="Take a photo" onClick={() => cameraInputRef.current?.click()} disabled={isSendingMedia}><Camera size={18} /></Button><Button type="submit" disabled={!message.trim() && !selectedMedia} iconOnly aria-label="Send message">{isSendingMedia ? '…' : <Send size={17} />}</Button></form></div>
    {mediaViewer?.media_signed_url && <div className={`chat-media-viewer-backdrop${mediaViewerFullscreen ? ' chat-media-viewer-backdrop--fullscreen' : ''}`} role="dialog" aria-modal="true" aria-label="Shared media" onClick={() => { setMediaViewer(null); setMediaViewerFullscreen(false) }}><div className="chat-media-viewer" onClick={(event) => event.stopPropagation()}><div className="chat-media-viewer__head"><span><strong>{mediaViewer.media_type === 'video' ? 'Video' : mediaViewer.media_type === 'image' ? 'Photo' : 'File'}</strong><small>{mediaViewerSize}</small></span><div><a href={mediaViewer.media_signed_url} download target="_blank" rel="noreferrer" aria-label="Download media" title="Download media"><Download size={18} /></a><button type="button" onClick={() => setMediaViewerFullscreen((value) => !value)} aria-label={mediaViewerFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{mediaViewerFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button><button type="button" onClick={() => { setMediaViewer(null); setMediaViewerFullscreen(false) }} aria-label="Close media"><X size={20} /></button></div></div><div className="chat-media-viewer__content">{mediaViewer.media_type === 'video' ? <video src={mediaViewer.media_signed_url} controls autoPlay playsInline /> : mediaViewer.media_type === 'image' ? <img src={mediaViewer.media_signed_url} alt="Shared media full view" /> : <a href={mediaViewer.media_signed_url} download target="_blank" rel="noreferrer"><Download size={24} /> Download file</a>}</div></div></div>}
    {forwardOpen && <div className="chat-forward-backdrop" role="dialog" aria-modal="true" aria-label="Forward messages" onClick={() => !forwardingTo && setForwardOpen(false)}><div className="chat-forward-modal" onClick={(event) => event.stopPropagation()}><div className="chat-forward-modal__head"><strong>Forward to</strong><button type="button" onClick={() => !forwardingTo && setForwardOpen(false)} aria-label="Close forward picker"><X size={19} /></button></div><Input aria-label="Search conversations" placeholder="Search people or username" value={forwardQuery} onChange={(event) => setForwardQuery(event.target.value)} /><div className="chat-forward-modal__list">{forwardLoading ? <Loading label="Loading conversations" /> : forwardConversations.filter((row) => row.id !== conversationId && `${row.member.display_name || ''} ${row.member.username || ''}`.toLowerCase().includes(forwardQuery.trim().toLowerCase())).map((row) => <button type="button" className="chat-forward-contact" key={row.id} onClick={() => setSelectedForwardIds((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} disabled={Boolean(forwardingTo)}><Avatar name={row.member.display_name || row.member.username} image={row.member.avatar_url ?? undefined} /><span><strong>{row.member.display_name || row.member.username}</strong><small>@{row.member.username}</small></span><span className={`chat-forward-check${selectedForwardIds.includes(row.id) ? ' is-selected' : ''}`}>{selectedForwardIds.includes(row.id) && <Check size={14} />}</span></button>)}{forwardQuery.trim().length >= 2 && forwardProfiles.filter((profile) => !forwardConversations.some((row) => row.member.id === profile.id)).map((profile) => <button type="button" className="chat-forward-contact" key={profile.id} onClick={() => setSelectedForwardIds((current) => current.includes(profile.id) ? current.filter((id) => id !== profile.id) : [...current, profile.id])} disabled={Boolean(forwardingTo)}><Avatar name={profile.display_name || profile.username} image={profile.avatar_url ?? undefined} /><span><strong>{profile.display_name || profile.username}</strong><small>@{profile.username} · New chat</small></span><span className={`chat-forward-check${selectedForwardIds.includes(profile.id) ? ' is-selected' : ''}`}>{selectedForwardIds.includes(profile.id) && <Check size={14} />}</span></button>)}{forwardSearchLoading && <Loading label="Searching contacts" />}{!forwardLoading && !forwardSearchLoading && !forwardConversations.some((row) => row.id !== conversationId && `${row.member.display_name || ''} ${row.member.username || ''}`.toLowerCase().includes(forwardQuery.trim().toLowerCase())) && !forwardProfiles.some((profile) => !forwardConversations.some((row) => row.member.id === profile.id)) && <p className="micro-note">{forwardQuery.trim().length < 2 ? 'Search by username to find other contacts.' : 'No matching contacts found.'}</p>}</div>{forwardError && <p className="field__error" role="alert">{forwardError}</p>}<div className="chat-forward-modal__footer"><span>{selectedForwardIds.length} selected</span><button type="button" disabled={!selectedForwardIds.length || Boolean(forwardingTo)} onClick={() => void sendForwardedToSelectedContacts()}>{forwardingTo ? <Loading label="Sending" /> : <><Forward size={16} /> Send</>}</button></div></div></div>}
</section>
}


type CommunityGroupMessage = {
  id: string
  group_id: string
  sender_id: string
  content: string
  media_url: string | null
  media_type: 'image' | 'video' | null
  media_signed_url?: string | null
  is_deleted_for_everyone: boolean
  created_at: string
}

export function CommunityGroupPage() {
  useChatKeyboardViewportLock()
  const { groupId = '' } = useParams()
  const { session } = useAuth()
  const groupChatCacheKey = session?.user.id && groupId ? `group-chat:${session.user.id}:${groupId}` : ''
  const cachedGroupChat = groupChatCacheKey ? getCached<{ group: { id: string; name: string; description: string; created_by: string }; messages: CommunityGroupMessage[]; profiles: Record<string, ProfileRecord>; members: Array<{ user_id: string; role: string; username: string; display_name: string | null; avatar_url: string | null }>; hasOlderGroupMessages: boolean }>(groupChatCacheKey) : null
  const [group, setGroup] = useState<{ id: string; name: string; description: string; created_by: string } | null>(cachedGroupChat?.group ?? null)
  const [messages, setMessages] = useState<CommunityGroupMessage[]>(cachedGroupChat?.messages ?? [])
  const [profiles, setProfiles] = useState<Record<string, ProfileRecord>>(cachedGroupChat?.profiles ?? {})
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(cachedGroupChat === null)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const [realtimeError, setRealtimeError] = useState('')
  const [members, setMembers] = useState<Array<{ user_id: string; role: string; username: string; display_name: string | null; avatar_url: string | null }>>(cachedGroupChat?.members ?? [])
  const [membersOpen, setMembersOpen] = useState(false)
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')
  const [memberResults, setMemberResults] = useState<ProfileRecord[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberAction, setMemberAction] = useState('')
  const [memberError, setMemberError] = useState('')
  const [groupEditOpen, setGroupEditOpen] = useState(false)
  const [groupDeleteOpen, setGroupDeleteOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [groupSaving, setGroupSaving] = useState(false)
  const [selectedGroupMedia, setSelectedGroupMedia] = useState<File | null>(null)
  const [selectedGroupMessageIds, setSelectedGroupMessageIds] = useState<string[]>([])
  const [pendingGroupDelete, setPendingGroupDelete] = useState('')
  const groupLongPressTimer = useRef<number | null>(null)
  const suppressNextGroupMessageClick = useRef(false)
  const [isSendingGroupMedia, setIsSendingGroupMedia] = useState(false)
  const groupMediaInputRef = useRef<HTMLInputElement | null>(null)
  const groupCameraInputRef = useRef<HTMLInputElement | null>(null)
  const [hasOlderGroupMessages, setHasOlderGroupMessages] = useState(cachedGroupChat?.hasOlderGroupMessages ?? false)
  const [isLoadingOlderGroupMessages, setIsLoadingOlderGroupMessages] = useState(false)
  const isGroupCreator = Boolean(session?.user && group && group.created_by === session.user.id)
  const isGroupAdmin = Boolean(session?.user && group && (isGroupCreator || members.some((member) => member.user_id === session.user.id && member.role === 'admin')))
  const [reportsOpen, setReportsOpen] = useState(false)
  const [memberRequestsOpen, setMemberRequestsOpen] = useState(false)
  const [memberRequests, setMemberRequests] = useState<Array<{ id: string; requester_id: string; created_at: string; requester_name: string; requester_username: string; requester_avatar: string | null }>>([])
  const [memberRequestsLoading, setMemberRequestsLoading] = useState(false)
  const [memberRequestAction, setMemberRequestAction] = useState('')
  const [reports, setReports] = useState<Array<{ id: string; reporter_id: string; reported_user_id: string | null; group_message_id: string | null; reason: string; details: string | null; status: string; created_at: string; resolved_at: string | null }>>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportAction, setReportAction] = useState('')
  const [reportTarget, setReportTarget] = useState<{ messageId?: string; userId: string; label: string } | null>(null)
  const [reportReason, setReportReason] = useState('Spam or unwanted content')
  const [reportDetails, setReportDetails] = useState('')
  const [reportSaving, setReportSaving] = useState(false)
  const [reportError, setReportError] = useState('')
  const initialGroupBottomScrollDone = useRef(false)

  useEffect(() => {
    initialGroupBottomScrollDone.current = false
  }, [groupId])

  useEffect(() => {
    if (isLoading || !messages.length || initialGroupBottomScrollDone.current) return
    initialGroupBottomScrollDone.current = true
    const scrollToLatest = () => {
      const pane = document.querySelector('.community-group-screen .chat-messages') as HTMLElement | null
      if (!pane) return
      pane.scrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight)
    }
    const frame = window.requestAnimationFrame(() => {
      scrollToLatest()
      window.requestAnimationFrame(scrollToLatest)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [groupId, isLoading, messages.length])

  useEffect(() => {
    if (!groupMenuOpen) return
    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && !target.closest('.chat-screen__actions')) setGroupMenuOpen(false)
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setGroupMenuOpen(false)
    }
    function handleBack() {
      setGroupMenuOpen(false)
    }
    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('popstate', handleBack)
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('popstate', handleBack)
    }
  }, [groupMenuOpen])

  function handleGroupMediaFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) return
    try { validateGroupMedia(file); setError(''); setSelectedGroupMedia(file) } catch (caught) { event.target.value = ''; setSelectedGroupMedia(null); setError(userFacingError(caught, 'This media file could not be selected.')) }
  }

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | null = null
    const cached = session?.user.id ? getCached<{ group: { id: string; name: string; description: string; created_by: string }; messages: CommunityGroupMessage[]; profiles: Record<string, ProfileRecord>; members: Array<{ user_id: string; role: string; username: string; display_name: string | null; avatar_url: string | null }>; hasOlderGroupMessages: boolean }>(`group-chat:${session.user.id}:${groupId}`) : null
    setIsLoading(cached === null)
    setError('')
    setRealtimeError('')
    if (cached) { setGroup(cached.group); setMessages(cached.messages); setProfiles(cached.profiles); setMembers(cached.members); setHasOlderGroupMessages(cached.hasOlderGroupMessages) }
    else { setGroup(null); setMessages([]); setProfiles({}); setMembers([]); setHasOlderGroupMessages(false) }
    let groupMessageRefreshPending = false
    let groupMessageRefreshQueued = false
    let groupMemberRefreshPending = false
    let groupMemberRefreshQueued = false

    const refreshGroupMessages = async () => {
      if (groupMessageRefreshPending) {
        groupMessageRefreshQueued = true
        return
      }
      groupMessageRefreshPending = true
      do {
        groupMessageRefreshQueued = false
        try {
          const { data: latest, error: latestError } = await supabase
            .from('community_group_messages')
            .select('id,group_id,sender_id,content,media_url,media_type,is_deleted_for_everyone,created_at')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
            .limit(100)
          if (latestError) throw latestError
          if (!active) break
          const latestIds = (latest ?? []).map((row) => row.id)
          const { data: hiddenRows, error: hiddenError } = latestIds.length ? await supabase.from('community_group_message_deletions').select('message_id').eq('user_id', session?.user.id ?? '').in('message_id', latestIds) : { data: [], error: null }
          if (hiddenError) throw hiddenError
          const hiddenIds = new Set((hiddenRows ?? []).map((row) => row.message_id as string))
          const incoming = ((latest ?? []) as CommunityGroupMessage[]).filter((row) => !hiddenIds.has(row.id)).reverse()
          setMessages((current) => {
            const byId = new Map(current.map((item) => [item.id, item]))
            for (const item of incoming) byId.set(item.id, { ...byId.get(item.id), ...item })
            const merged = [...byId.values()].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            if (session?.user.id && group) setCached(`group-chat:${session.user.id}:${groupId}`, { group, messages: merged, profiles, members, hasOlderGroupMessages }, 60_000)
            return merged
          })
          const ids = [...new Set(incoming.map((row) => row.sender_id))]
          const profilePromise = ids.length
            ? supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', ids)
            : Promise.resolve({ data: [], error: null })
          void Promise.all(incoming.filter((item) => item.media_url).map(async (item) => {
            try { item.media_signed_url = await createGroupMediaUrl(item.media_url!) } catch { item.media_signed_url = null }
          })).then(() => {
            if (!active) return
            setMessages((current) => {
              const byId = new Map(current.map((item) => [item.id, item]))
              for (const item of incoming) byId.set(item.id, { ...byId.get(item.id), ...item })
              const merged = [...byId.values()].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              if (session?.user.id && group) setCached(`group-chat:${session.user.id}:${groupId}`, { group, messages: merged, profiles, members, hasOlderGroupMessages }, 60_000)
              return merged
            })
          })
          const { data: latestProfiles, error: profileError } = await profilePromise
          if (profileError) throw profileError
          if (active && latestProfiles?.length) {
            setProfiles((current) => {
              const merged = { ...current, ...Object.fromEntries(latestProfiles.map((profile) => [profile.id, profile as ProfileRecord])) }
              if (session?.user.id && group) setCached(`group-chat:${session.user.id}:${groupId}`, { group, messages, profiles: merged, members, hasOlderGroupMessages }, 60_000)
              return merged
            })
          }
        } catch (caught) {
          if (active) setRealtimeError(userFacingError(caught, 'Live group messages could not be refreshed.'))
        }
      } while (active && groupMessageRefreshQueued)
      groupMessageRefreshPending = false
    }

    const refreshGroupMembers = async () => {
      if (groupMemberRefreshPending) {
        groupMemberRefreshQueued = true
        return
      }
      groupMemberRefreshPending = true
      do {
        groupMemberRefreshQueued = false
        try {
          if (!session?.user || !active) break
          const { data: membership, error: membershipError } = await supabase.from('community_group_members').select('role').eq('group_id', groupId).eq('user_id', session.user.id).maybeSingle()
          if (membershipError) throw membershipError
          if (!membership) {
            if (active) {
              setError('You are no longer a member of this community.')
              setGroup(null)
            }
            break
          }
          await loadGroupMembers()
        } catch (caught) {
          if (active) setRealtimeError(userFacingError(caught, 'Live group members could not be refreshed.'))
        }
      } while (active && groupMemberRefreshQueued)
      groupMemberRefreshPending = false
    }

    void (async () => {
      try {
        if (!session?.user || !groupId) throw new Error('Community group could not be found.')
        const { data: membership, error: membershipError } = await supabase
          .from('community_group_members')
          .select('group_id')
          .eq('group_id', groupId)
          .eq('user_id', session.user.id)
          .maybeSingle()
        if (membershipError) throw membershipError
        if (!membership) throw new Error('You are not a member of this community.')
        const [{ data: groupRow, error: groupError }, { data: rows, error: messagesError }, { data: memberRows, error: membersError }] = await Promise.all([
          supabase.from('community_groups').select('id,name,description,created_by').eq('id', groupId).maybeSingle(),
          supabase.from('community_group_messages').select('id,group_id,sender_id,content,media_url,media_type,created_at').eq('group_id', groupId).order('created_at', { ascending: false }).limit(101),
          supabase.from('community_group_members').select('user_id,role').eq('group_id', groupId).order('joined_at', { ascending: true }),
        ])
        if (groupError) throw groupError
        if (messagesError) throw messagesError
        if (membersError) throw membersError
        if (!groupRow) throw new Error('This community no longer exists.')
        const fetchedIds = (rows ?? []).map((row) => row.id)
        const { data: initialHidden, error: initialHiddenError } = fetchedIds.length ? await supabase.from('community_group_message_deletions').select('message_id').eq('user_id', session.user.id).in('message_id', fetchedIds) : { data: [], error: null }
        if (initialHiddenError) throw initialHiddenError
        const initialHiddenIds = new Set((initialHidden ?? []).map((row) => row.message_id as string))
        const fetchedRows = ((rows ?? []) as CommunityGroupMessage[]).filter((row) => !initialHiddenIds.has(row.id))
        setHasOlderGroupMessages(fetchedRows.length > 100)
        const nextMessages = fetchedRows.slice(0, 100).reverse()
        const senderIds = [...new Set([...nextMessages.map((row) => row.sender_id), ...((memberRows ?? []) as Array<{ user_id: string }>).map((row) => row.user_id)])]
        const { data: senderProfiles, error: profilesError } = senderIds.length
          ? await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', senderIds)
          : { data: [], error: null }
        if (profilesError) throw profilesError
        if (!active) return
        const latestMessage = nextMessages[nextMessages.length - 1]
        const nextProfiles = Object.fromEntries((senderProfiles ?? []).map((profile) => [profile.id, profile as ProfileRecord]))
        const nextMembers = ((memberRows ?? []) as Array<{ user_id: string; role: string }>).map((member) => {
          const profile = (senderProfiles ?? []).find((item) => item.id === member.user_id) as ProfileRecord | undefined
          return { user_id: member.user_id, role: member.role, username: profile?.username ?? '', display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null }
        })
        setGroup(groupRow)
        setMessages(nextMessages)
        setProfiles(nextProfiles)
        setMembers(nextMembers)
        if (session?.user.id) setCached(`group-chat:${session.user.id}:${groupId}`, { group: groupRow, messages: nextMessages, profiles: nextProfiles, members: nextMembers, hasOlderGroupMessages: fetchedRows.length > 100 }, 60_000)
        if (latestMessage) {
          void supabase.rpc('mark_community_group_read', { p_group_id: groupId, p_message_id: latestMessage.id })
            .then(({ error: markReadError }) => { if (markReadError && import.meta.env.DEV) console.error('Could not mark community group as read.', markReadError) })
        }
        void Promise.all(nextMessages.filter((item) => item.media_url).map(async (item) => {
          try { item.media_signed_url = await createGroupMediaUrl(item.media_url!) } catch { item.media_signed_url = null }
        })).then(() => {
          if (!active) return
          setMessages((current) => {
            const byId = new Map(current.map((item) => [item.id, item]))
            for (const item of nextMessages) byId.set(item.id, { ...byId.get(item.id), ...item })
            const merged = [...byId.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            if (session?.user.id) setCached(`group-chat:${session.user.id}:${groupId}`, { group: groupRow, messages: merged, profiles: nextProfiles, members: nextMembers, hasOlderGroupMessages: fetchedRows.length > 100 }, 60_000)
            return merged
          })
        })
        const unsubscribeMessages = subscribeToPostgresChanges({
          topic: `community-group:${groupId}:messages`,
          event: '*',
          table: 'community_group_messages',
          filter: `group_id=eq.${groupId}`,
        }, () => {
          void refreshGroupMessages()
        }, (status) => {
          if (active) setRealtimeError(status === 'SUBSCRIBED' ? '' : `Live group updates are unavailable (${status.toLowerCase().replace('_', ' ')}).`)
        })

        const unsubscribeMembers = subscribeToPostgresChanges({
          topic: `community-group:${groupId}:members`,
          event: '*',
          table: 'community_group_members',
          filter: `group_id=eq.${groupId}`,
        }, () => {
          void refreshGroupMembers()
        }, (status) => {
          if (active && status !== 'SUBSCRIBED') setRealtimeError(`Live member updates are unavailable (${status.toLowerCase().replace('_', ' ')}).`)
        })

        unsubscribe = () => {
          unsubscribeMessages()
          unsubscribeMembers()
        }
      } catch (caught) {
        if (active) setError(userFacingError(caught, 'Could not load this community.'))
      } finally {
        if (active) setIsLoading(false)
      }
    })()
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [groupId, session?.user.id])

  async function loadOlderGroupMessages() {
    if (!groupId || !messages.length || isLoadingOlderGroupMessages || !hasOlderGroupMessages) return
    setIsLoadingOlderGroupMessages(true)
    try {
      const oldest = messages[0]
      const { data: rows, error: olderError } = await supabase
        .from('community_group_messages')
        .select('id,group_id,sender_id,content,media_url,media_type,is_deleted_for_everyone,created_at')
        .eq('group_id', groupId)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(51)
      if (olderError) throw olderError
      const olderIds = (rows ?? []).map((row) => row.id)
      const { data: hiddenOlder, error: hiddenOlderError } = olderIds.length ? await supabase.from('community_group_message_deletions').select('message_id').eq('user_id', session?.user.id ?? '').in('message_id', olderIds) : { data: [], error: null }
      if (hiddenOlderError) throw hiddenOlderError
      const hiddenOlderIds = new Set((hiddenOlder ?? []).map((row) => row.message_id as string))
      const fetched = ((rows ?? []) as CommunityGroupMessage[]).filter((row) => !hiddenOlderIds.has(row.id))
      setHasOlderGroupMessages(fetched.length > 50)
      const older = fetched.slice(0, 50).reverse()
      for (const item of older) {
        if (item.media_url) {
          try { item.media_signed_url = await createGroupMediaUrl(item.media_url) } catch { item.media_signed_url = null }
        }
      }
      const ids = [...new Set(older.map((row) => row.sender_id))]
      if (ids.length) {
        const { data: olderProfiles } = await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', ids)
        setProfiles((current) => ({ ...current, ...Object.fromEntries((olderProfiles ?? []).map((profile) => [profile.id, profile as ProfileRecord])) }))
      }
      setMessages((current) => {
        const merged = [...older, ...current]
        return merged.filter((item,index,array) => array.findIndex((candidate) => candidate.id === item.id) === index)
      })
    } catch (caught) {
      setError(userFacingError(caught, 'Could not load older messages.'))
    } finally {
      setIsLoadingOlderGroupMessages(false)
    }
  }

  async function loadGroupMembers() {
    if (!groupId) return
    setMembersLoading(true)
    setMemberError('')
    try {
      const { data: memberRows, error: memberLoadError } = await supabase
        .from('community_group_members')
        .select('user_id,role')
        .eq('group_id', groupId)
        .order('joined_at', { ascending: true })
      if (memberLoadError) throw memberLoadError
      const ids = (memberRows ?? []).map((row) => row.user_id)
      const { data: memberProfiles, error: profileError } = ids.length
        ? await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', ids)
        : { data: [], error: null }
      if (profileError) throw profileError
      const byId = Object.fromEntries((memberProfiles ?? []).map((profile) => [profile.id, profile as ProfileRecord]))
      setMembers((memberRows ?? []).map((row) => {
        const profile = byId[row.user_id]
        return { user_id: row.user_id, role: row.role, username: profile?.username ?? '', display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null }
      }))
    } catch (caught) {
      setMemberError(userFacingError(caught, 'Could not load members.'))
    } finally {
      setMembersLoading(false)
    }
  }

  async function searchGroupMembers(value: string) {
    setMemberQuery(value)
    setMemberError('')
    if (value.trim().length < 2) {
      setMemberResults([])
      return
    }
    setMembersLoading(true)
    try {
      const results = await searchProfilesByUsername(value)
      const memberIds = new Set(members.map((member) => member.user_id))
      setMemberResults(results.filter((profile) => !memberIds.has(profile.id)).slice(0, 10))
    } catch (caught) {
      setMemberError(userFacingError(caught, 'Could not search members.'))
    } finally {
      setMembersLoading(false)
    }
  }

  async function requestGroupMember(userId: string) {
    if (!groupId) return
    setMemberAction(userId)
    setMemberError('')
    try {
      const { error: requestError } = await supabase.rpc('add_community_group_member', { p_group_id: groupId, p_user_id: userId })
      if (requestError) throw requestError
      setMemberResults((current) => current.filter((profile) => profile.id !== userId))
      setMemberQuery('')
    } catch (caught) {
      setMemberError(userFacingError(caught, 'Could not send this group request.'))
    } finally {
      setMemberAction('')
    }
  }

  async function setMemberRole(userId: string, role: 'admin' | 'member') {
    if (!groupId || !session?.user) return
    const currentUser = members.find((member) => member.user_id === session.user.id)
    if (currentUser?.role !== 'admin' || userId === session.user.id) return
    setMemberAction(`role:${userId}`)
    setMemberError('')
    try {
      const { error: roleError } = await supabase.rpc('set_community_group_member_role', {
        p_group_id: groupId,
        p_user_id: userId,
        p_role: role,
      })
      if (roleError) throw roleError
      await loadGroupMembers()
    } catch (caught) {
      setMemberError(userFacingError(caught, 'Could not update this member role.'))
    } finally {
      setMemberAction('')
    }
  }

  async function saveGroupDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!groupId || !session?.user || members.find((member) => member.user_id === session.user.id)?.role !== 'admin') return
    const name = editName.trim()
    if (name.length < 2) {
      setMemberError('Community name must be at least 2 characters.')
      return
    }
    setGroupSaving(true)
    setMemberError('')
    try {
      const { data, error: updateError } = await supabase
        .from('community_groups')
        .update({ name, description: editDescription.trim() })
        .eq('id', groupId)
        .select('id,name,description,created_by')
        .single()
      if (updateError) throw updateError
      setGroup(data)
      setGroupEditOpen(false)
    } catch (caught) {
      setMemberError(userFacingError(caught, 'Could not update this community.'))
    } finally {
      setGroupSaving(false)
    }
  }

  async function deleteGroup() {
    if (!groupId || !session?.user) return
    if (members.find((member) => member.user_id === session.user.id)?.role !== 'admin') return
    setGroupSaving(true)
    setMemberError('')
    try {
      const { data: mediaRows, error: mediaListError } = await supabase.rpc('list_community_group_media_for_cleanup', { p_group_id: groupId })
      if (mediaListError) throw mediaListError
      const mediaPaths = ((mediaRows ?? []) as Array<{ media_path: string | null }>)
        .map((row) => row.media_path)
        .filter((path): path is string => Boolean(path))
      if (mediaPaths.length) await deleteGroupMedia(mediaPaths)
      const { error: deleteError } = await supabase.rpc('delete_community_group', { p_group_id: groupId })
      if (deleteError) throw deleteError
      window.location.href = '/community'
    } catch (caught) {
      setMemberError(userFacingError(caught, 'Could not delete this community.'))
      setGroupSaving(false)
      setGroupDeleteOpen(false)
    }
  }

  async function leaveGroup() {
    if (!groupId) return
    setMemberAction('leave')
    setMemberError('')
    try {
      const { error: leaveError } = await supabase.rpc('leave_community_group', { p_group_id: groupId })
      if (leaveError) throw leaveError
      window.location.href = '/community'
    } catch (caught) {
      setMemberError(userFacingError(caught, 'Could not leave this community.'))
    } finally {
      setMemberAction('')
    }
  }

  async function loadMemberRequests() {
    if (!groupId || !isGroupAdmin) return
    setMemberRequestsLoading(true)
    setMemberError('')
    try {
      const { data, error: requestError } = await supabase.from('community_group_join_requests')
        .select('id,requester_id,created_at')
        .eq('group_id', groupId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (requestError) throw requestError
      const requesterIds = (data ?? []).map((row) => row.requester_id)
      const { data: requesterProfiles, error: profileError } = requesterIds.length
        ? await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', requesterIds)
        : { data: [], error: null }
      if (profileError) throw profileError
      const byId = new Map((requesterProfiles ?? []).map((item) => [item.id, item as ProfileRecord]))
      setMemberRequests((data ?? []).map((row) => {
        const requester = byId.get(row.requester_id)
        return {
          id: row.id,
          requester_id: row.requester_id,
          created_at: row.created_at,
          requester_name: requester?.display_name || requester?.username || 'Community member',
          requester_username: requester?.username || 'member',
          requester_avatar: requester?.avatar_url ?? null,
        }
      }))
      setMemberRequestsOpen(true)
    } catch (caught) {
      setMemberError(userFacingError(caught, 'Could not load member requests.'))
    } finally {
      setMemberRequestsLoading(false)
    }
  }

  async function respondToMemberRequest(requestId: string, approve: boolean) {
    if (!isGroupAdmin || memberRequestAction) return
    setMemberRequestAction(requestId)
    setMemberError('')
    try {
      const { error: responseError } = await supabase.rpc('respond_community_group_join_request', {
        p_request_id: requestId,
        p_approve: approve,
      })
      if (responseError) throw responseError
      setMemberRequests((current) => current.filter((request) => request.id !== requestId))
      if (approve) await loadGroupMembers()
    } catch (caught) {
      setMemberError(userFacingError(caught, approve ? 'Could not approve this request.' : 'Could not reject this request.'))
    } finally {
      setMemberRequestAction('')
    }
  }

  async function loadGroupReports() {
    if (!groupId || !isGroupAdmin) return
    setReportsLoading(true)
    setMemberError('')
    try {
      const { data, error: reportsError } = await supabase.rpc('load_community_group_reports', { p_group_id: groupId })
      if (reportsError) throw reportsError
      setReports((data ?? []) as Array<{ id: string; reporter_id: string; reported_user_id: string | null; group_message_id: string | null; reason: string; details: string | null; status: string; created_at: string; resolved_at: string | null }>)
      setReportsOpen(true)
    } catch (caught) {
      setMemberError(userFacingError(caught, 'Could not load community reports.'))
    } finally {
      setReportsLoading(false)
    }
  }

  async function updateGroupReport(reportId: string, status: 'dismissed' | 'resolved') {
    if (!groupId || !isGroupAdmin || reportAction) return
    setReportAction(reportId)
    setMemberError('')
    try {
      const { error: updateError } = await supabase.rpc('update_community_group_report', { p_report_id: reportId, p_status: status })
      if (updateError) throw updateError
      setReports((current) => current.map((report) => report.id === reportId ? { ...report, status, resolved_at: new Date().toISOString() } : report))
    } catch (caught) {
      setMemberError(userFacingError(caught, 'Could not update this report.'))
    } finally {
      setReportAction('')
    }
  }

  async function submitGroupReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!groupId || !session?.user || !reportTarget || reportSaving) return
    setReportSaving(true)
    setReportError('')
    try {
      const { error: reportSubmitError } = await supabase.rpc('report_community_group_content', {
        p_group_id: groupId,
        p_group_message_id: reportTarget.messageId ?? null,
        p_reported_user_id: reportTarget.userId,
        p_reason: reportReason,
        p_details: reportDetails.trim() || null,
      })
      if (reportSubmitError) throw reportSubmitError
      setReportTarget(null)
      setReportDetails('')
      setReportReason('Spam or unwanted content')
      setReportError('')
    } catch (caught) {
      setReportError(userFacingError(caught, 'Could not submit this report.'))
    } finally {
      setReportSaving(false)
    }
  }

  async function removeGroupMember(userId: string) {
    if (!groupId || !session?.user) return
    const currentUser = members.find((member) => member.user_id === session.user.id)
    if (currentUser?.role !== 'admin' || userId === session.user.id) return
    setMemberAction(userId)
    setMemberError('')
    try {
      const { error: removeError } = await supabase.rpc('remove_community_group_member', { p_group_id: groupId, p_user_id: userId })
      if (removeError) throw removeError
      await loadGroupMembers()
    } catch (caught) {
      setMemberError(userFacingError(caught, 'Could not remove this member.'))
    } finally {
      setMemberAction('')
    }
  }

  function clearGroupLongPressTimer() {
    if (groupLongPressTimer.current !== null) {
      window.clearTimeout(groupLongPressTimer.current)
      groupLongPressTimer.current = null
    }
  }

  function toggleGroupMessageSelection(messageId: string) {
    setSelectedGroupMessageIds((current) => current.includes(messageId) ? current.filter((id) => id !== messageId) : [...current, messageId])
  }

  function startGroupMessageLongPress(messageId: string) {
    clearGroupLongPressTimer()
    groupLongPressTimer.current = window.setTimeout(() => {
      setSelectedGroupMessageIds((current) => current.includes(messageId) ? current : [...current, messageId])
      suppressNextGroupMessageClick.current = true
      groupLongPressTimer.current = null
    }, 550)
  }

  function handleGroupMessageContextMenu(event: MouseEvent, messageId: string) {
    event.preventDefault()
    clearGroupLongPressTimer()
    suppressNextGroupMessageClick.current = true
    setSelectedGroupMessageIds((current) => current.includes(messageId) ? current : [...current, messageId])
  }

  function cancelGroupMessageSelection() {
    clearGroupLongPressTimer()
    setSelectedGroupMessageIds([])
  }

  async function deleteSelectedGroupMessages(mode: 'me' | 'everyone') {
    if (!selectedGroupMessageIds.length || pendingGroupDelete) return
    const selected = messages.filter((item) => selectedGroupMessageIds.includes(item.id))
    setPendingGroupDelete('bulk')
    setError('')
    try {
      if (mode === 'me') {
        for (const item of selected) {
          const { error: deleteError } = await supabase.rpc('delete_community_group_message_for_me', { p_message_id: item.id })
          if (deleteError) throw deleteError
        }
        setMessages((current) => current.filter((item) => !selectedGroupMessageIds.includes(item.id)))
      } else {
        const own = selected.filter((item) => item.sender_id === session?.user.id || isGroupAdmin)
        for (const item of own) {
          const { data: mediaPath, error: deleteError } = await supabase.rpc('delete_community_group_message_for_everyone', { p_message_id: item.id })
          if (deleteError) throw deleteError
          if (mediaPath) await deleteGroupMedia([mediaPath as string]).catch(() => undefined)
        }
        const ownIds = new Set(own.map((item) => item.id))
        setMessages((current) => current.map((item) => ownIds.has(item.id) ? { ...item, content: 'Message deleted', media_url: null, media_type: null, media_signed_url: null, is_deleted_for_everyone: true } : item))
      }
      setSelectedGroupMessageIds([])
    } catch (caught) {
      setError(userFacingError(caught, mode === 'everyone' ? 'Could not delete the selected messages for everyone.' : 'Could not delete the selected messages for you.'))
    } finally { setPendingGroupDelete('') }
  }

  async function sendGroupMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const textToSend = message.trim()
    if ((!textToSend && !selectedGroupMedia) || isSending || isSendingGroupMedia || !session?.user || !groupId) return
    setIsSendingGroupMedia(!!selectedGroupMedia)
    setIsSending(!selectedGroupMedia)
    setError('')
    let uploadedPath = ''
    try {
      const { data, error: sendError } = await supabase.from('community_group_messages')
        .insert({ group_id: groupId, sender_id: session.user.id, content: textToSend })
        .select('id,group_id,sender_id,content,media_url,media_type,created_at')
        .single()
      if (sendError) throw sendError
      let created = data as CommunityGroupMessage
      if (selectedGroupMedia) {
        const media = await uploadGroupMedia(selectedGroupMedia, session.user.id, groupId, created.id)
        uploadedPath = media.path
        const { data: updated, error: updateError } = await supabase.from('community_group_messages')
          .update({ media_url: media.path, media_type: media.type, updated_at: new Date().toISOString() })
          .eq('id', created.id).eq('sender_id', session.user.id)
          .select('id,group_id,sender_id,content,media_url,media_type,created_at').single()
        if (updateError) throw updateError
        created = updated as CommunityGroupMessage
        created.media_signed_url = await createGroupMediaUrl(media.path)
      }
      setMessages((current) => current.some((item) => item.id === created.id) ? current : [...current, created])
      setMessage('')
      setSelectedGroupMedia(null)
      if (groupMediaInputRef.current) groupMediaInputRef.current.value = ''
    } catch (caught) {
      if (uploadedPath) await deleteGroupMedia([uploadedPath]).catch(() => undefined)
      setError(userFacingError(caught, 'Could not send this message.'))
    } finally {
      setIsSending(false)
      setIsSendingGroupMedia(false)
    }
  }

  if (isLoading) return <section className="chat-screen"><Loading label="Loading community" /></section>
  if (error && !group) return <section className="page-stack"><ErrorState title="Could not load community" description={error} /></section>
  if (!group) return <section className="page-stack"><EmptyState title="Community unavailable" description="This community could not be found." action={<Button to="/community" variant="outline">Back to community</Button>} /></section>

  return <section className="chat-screen chat-screen--theme-rathod community-group-screen">
    <header className="chat-screen__head"><Button to="/community" variant="quiet" iconOnly aria-label="Back to community"><ArrowLeft size={18} /></Button>
      <button type="button" className="chat-screen__profile community-group-header-button" onClick={() => { setMembersOpen(true); void loadGroupMembers() }}>
        <span className="community-group-card__icon"><Users size={20} /></span>
        <span className="chat-screen__identity"><strong>{group.name}</strong><small>{members.length} members · tap for members</small></span>
      </button>
      <div className="chat-screen__actions">
        <button type="button" className="chat-screen__action" aria-label="Community options" title="Community options" aria-expanded={groupMenuOpen} onClick={() => setGroupMenuOpen((current) => !current)}>
          <MoreVertical size={20} />
        </button>
        {groupMenuOpen && <div className="chat-options-menu">
          <button type="button" className="chat-options-menu__item" onClick={() => { setGroupMenuOpen(false); setMembersOpen(true); void loadGroupMembers() }}><Users size={17} /><span>Add members</span></button>
          {isGroupAdmin && <button type="button" className="chat-options-menu__item" onClick={() => { setGroupMenuOpen(false); void loadMemberRequests() }} disabled={memberRequestsLoading}><Users size={17} /><span>{memberRequestsLoading ? 'Loading requests…' : 'Member requests'}</span></button>}
          {isGroupAdmin && <button type="button" className="chat-options-menu__item" onClick={() => { setGroupMenuOpen(false); void loadGroupReports() }} disabled={reportsLoading}><Flag size={17} /><span>{reportsLoading ? 'Loading reports…' : 'Reports'}</span></button>}
          {isGroupAdmin && <button type="button" className="chat-options-menu__item" onClick={() => { setGroupMenuOpen(false); setEditName(group.name); setEditDescription(group.description || ''); setMemberError(''); setGroupEditOpen(true) }}><Pencil size={17} /><span>Edit community</span></button>}
          {isGroupCreator && <button type="button" className="chat-options-menu__item chat-options-menu__item--danger" onClick={() => { setGroupMenuOpen(false); setMemberError(''); setGroupDeleteOpen(true) }}><Trash2 size={17} /><span>Delete community</span></button>}
          {!isGroupCreator && <button type="button" className="chat-options-menu__item chat-options-menu__item--danger" onClick={() => { setGroupMenuOpen(false); void leaveGroup() }} disabled={memberAction === 'leave'}><LogOut size={17} /><span>{memberAction === 'leave' ? 'Leaving…' : 'Leave community'}</span></button>}
        </div>}
      </div>
    </header>
    <Modal open={groupEditOpen} title="Edit community" onClose={() => setGroupEditOpen(false)}>
      <form className="form-stack" onSubmit={saveGroupDetails}>
        <Input label="Community name" value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={80} required />
        <label className="field"><span className="field__label">Description</span><textarea className="field__control field__textarea" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={500} /></label>
        {memberError && <p className="field__error" role="alert">{memberError}</p>}
        <Button type="submit" disabled={groupSaving}>{groupSaving ? 'Saving…' : 'Save changes'}</Button>
      </form>
    </Modal>
    <Modal open={reportsOpen} title="Community reports" onClose={() => setReportsOpen(false)}>
      <div className="community-group-members-panel">
        {reports.length === 0 ? <p className="micro-note">No reports for this community.</p> : reports.map((report) => <div className="community-group-member-row" key={report.id}>
          <span>
            <strong>{report.reason}</strong>
            <small>{report.status} · {new Date(report.created_at).toLocaleString()}</small>
            {report.details && <small>{report.details}</small>}
          </span>
          {report.status === 'pending' && <span className="community-group-member-actions">
            <Button type="button" variant="quiet" onClick={() => void updateGroupReport(report.id, 'dismissed')} disabled={!!reportAction}>{reportAction === report.id ? '…' : 'Dismiss'}</Button>
            <Button type="button" onClick={() => void updateGroupReport(report.id, 'resolved')} disabled={!!reportAction}>Resolve</Button>
          </span>}
        </div>)}
        {memberError && <p className="field__error" role="alert">{memberError}</p>}
      </div>
    </Modal>
    <Modal open={!!reportTarget} title={reportTarget ? 'Report ' + reportTarget.label : 'Report'} onClose={() => { if (!reportSaving) { setReportTarget(null); setReportError('') } }}>
      <form className="form-stack" onSubmit={submitGroupReport}>
        <label className="field"><span className="field__label">Reason</span><select className="field__control" value={reportReason} onChange={(event) => setReportReason(event.target.value)} disabled={reportSaving}>
          <option>Spam or unwanted content</option><option>Harassment or bullying</option><option>Hate or abusive content</option><option>Threats or dangerous content</option><option>Sexual or inappropriate content</option><option>Other</option>
        </select></label>
        <label className="field"><span className="field__label">Details (optional)</span><textarea className="field__control field__textarea" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} placeholder="Tell admins what happened" disabled={reportSaving} /></label>
        {reportError && <p className="field__error" role="alert">{reportError}</p>}
        <Button type="submit" disabled={reportSaving}>{reportSaving ? 'Submitting…' : 'Submit report'}</Button>
      </form>
    </Modal>
    <ConfirmationDialog open={groupDeleteOpen} title="Delete this community?" description="This permanently deletes the group, its members and its messages. This action cannot be undone." confirmLabel={groupSaving ? 'Deleting…' : 'Delete community'} onClose={() => { if (!groupSaving) setGroupDeleteOpen(false) }} onConfirm={() => void deleteGroup()} />

    <div className="chat-messages">
      {hasOlderGroupMessages && <div className="chat-history-loader"><Button variant="outline" onClick={() => void loadOlderGroupMessages()} disabled={isLoadingOlderGroupMessages}>{isLoadingOlderGroupMessages ? 'Loading older messages…' : 'Load older messages'}</Button></div>}
      {selectedGroupMessageIds.length > 0 && <div className="chat-selection-toolbar"><button type="button" className="chat-selection-toolbar__close" onClick={cancelGroupMessageSelection} aria-label="Close message selection">×</button><strong>{selectedGroupMessageIds.length} selected</strong><button type="button" disabled={pendingGroupDelete === 'bulk'} onClick={() => void deleteSelectedGroupMessages('me')}>Delete for me</button><button type="button" disabled={pendingGroupDelete === 'bulk'} onClick={() => void deleteSelectedGroupMessages('everyone')}>Delete for everyone</button></div>}
      {messages.length ? messages.map((item, index) => {
        const mine = item.sender_id === session?.user.id
        const selected = selectedGroupMessageIds.includes(item.id)
        const sender = profiles[item.sender_id]
        const senderName = sender?.display_name || sender?.username || 'Community member'
        return <div className={`chat-message-row${mine ? ' chat-message-row--you' : ' chat-message-row--them'}${selected ? ' chat-message-row--selected' : ''}${index === 0 ? ' chat-message-row--first' : ''}`} key={item.id}>
          <div className={`chat-bubble${mine ? ' chat-bubble--you' : ' chat-bubble--them'}${selected ? ' chat-bubble--selected' : ''}`} onPointerDown={() => startGroupMessageLongPress(item.id)} onPointerUp={clearGroupLongPressTimer} onPointerCancel={clearGroupLongPressTimer} onPointerLeave={clearGroupLongPressTimer} onContextMenu={(event) => handleGroupMessageContextMenu(event, item.id)} onClick={() => { if (suppressNextGroupMessageClick.current) { suppressNextGroupMessageClick.current = false; return } if (selectedGroupMessageIds.length > 0) toggleGroupMessageSelection(item.id) }}>
            {!mine && <strong className="community-group-message__sender">{senderName}</strong>}
            {item.is_deleted_for_everyone ? <em>Message deleted</em> : <>{item.media_signed_url && item.media_type === 'image' && <img className="chat-message-media" src={item.media_signed_url} alt="Shared photo" loading="lazy" />}{item.media_signed_url && item.media_type === 'video' && <video className="chat-message-media chat-message-media--video" src={item.media_signed_url} controls playsInline preload="metadata" />}{item.content && <p className="chat-message-text">{item.content}</p>}</>}
            <span>{new Date(item.created_at).toLocaleTimeString()}</span>
            {!mine && !selectedGroupMessageIds.length && <button type="button" className="community-group-message__delete" onClick={(event) => { event.stopPropagation(); setReportTarget({ messageId: item.id, userId: item.sender_id, label: senderName }); setReportError('') }} aria-label="Report message"><Flag size={13} /> Report</button>}
          </div>
        </div>
      }) : <p className="micro-note">No messages yet. Say hello to the group.</p>}
      {realtimeError && <p className="field__error" role="status">{realtimeError}</p>}
      {error && <p className="field__error" role="alert">{error}</p>}
    </div>
    <div className="chat-compose-area">
      {selectedGroupMedia && <div className="chat-attachment-preview"><span><Paperclip size={14} />{selectedGroupMedia.name}</span><button type="button" onClick={() => { setSelectedGroupMedia(null); if (groupMediaInputRef.current) groupMediaInputRef.current.value = '' }} aria-label="Remove selected media">×</button></div>}
      <form className="chat-disabled-compose" onSubmit={sendGroupMessage}>
        <input ref={groupMediaInputRef} className="chat-media-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={handleGroupMediaFile} />
        <input ref={groupCameraInputRef} className="chat-media-input" type="file" accept="image/*" capture="environment" onChange={handleGroupMediaFile} />
        <Button type="button" variant="quiet" iconOnly aria-label="Attach photo or video" onClick={() => groupMediaInputRef.current?.click()} disabled={isSendingGroupMedia}><Paperclip size={18} /></Button>
        <Button type="button" variant="quiet" iconOnly aria-label="Take a photo" onClick={() => groupCameraInputRef.current?.click()} disabled={isSendingGroupMedia}><Camera size={18} /></Button>
        <Input aria-label="Group message" placeholder={selectedGroupMedia ? 'Add a caption (optional)' : 'Message this community'} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />
        <Button type="submit" disabled={(!message.trim() && !selectedGroupMedia) || isSending || isSendingGroupMedia} iconOnly aria-label="Send group message">{isSending || isSendingGroupMedia ? '…' : <Send size={17} />}</Button>
      </form>
      <p className="micro-note">Photos and videos up to 50 MB</p>
    </div>
  <Modal open={memberRequestsOpen} title="Member requests" onClose={() => setMemberRequestsOpen(false)}>
    <div className="community-group-members-panel">
      {memberRequestsLoading ? <Loading label="Loading member requests" /> : memberRequests.length ? memberRequests.map((request) => <div className="community-group-member-row" key={request.id}>
        <Avatar name={request.requester_name} image={request.requester_avatar ?? undefined} />
        <span><strong>{request.requester_name}</strong><small>@{request.requester_username} · {new Date(request.created_at).toLocaleString()}</small></span>
        <span className="community-group-member-actions">
          <Button type="button" variant="quiet" onClick={() => void respondToMemberRequest(request.id, false)} disabled={!!memberRequestAction}>{memberRequestAction === request.id ? '…' : 'Reject'}</Button>
          <Button type="button" onClick={() => void respondToMemberRequest(request.id, true)} disabled={!!memberRequestAction}>Approve</Button>
        </span>
      </div>) : <EmptyState title="No pending requests" description="New requests to join this community will appear here." />}
      {memberError && <p className="field__error" role="alert">{memberError}</p>}
    </div>
  </Modal>
  {membersOpen && <Modal open={membersOpen} title={group.name} onClose={() => { setMembersOpen(false); setMemberQuery(''); setMemberResults([]); setMemberError('') }}>
      <div className="community-group-members-panel">
        <div className="community-group-members-title"><strong>Members</strong><span>{members.length}</span></div>
        <Input aria-label="Search username to add" placeholder="Search username to add" value={memberQuery} onChange={(event) => void searchGroupMembers(event.target.value)} />
        {memberError && <p className="field__error" role="alert">{memberError}</p>}
        {membersLoading && <Loading label="Loading members" />}
        {memberResults.length > 0 && <div className="community-group-member-results">{memberResults.map((profile) => <div className="community-group-member-row" key={profile.id}><Avatar name={profile.display_name || profile.username} image={profile.avatar_url ?? undefined} /><span><strong>{profile.display_name || profile.username}</strong><small>@{profile.username}</small></span><Button type="button" onClick={() => void requestGroupMember(profile.id)} disabled={memberAction === profile.id}>{memberAction === profile.id ? '…' : 'Add'}</Button></div>)}</div>}
        <div className="community-group-member-list">{members.map((member) => {
          const currentUser = members.find((item) => item.user_id === session?.user.id)
          const isCurrentAdmin = currentUser?.role === 'admin'
          const isSelf = member.user_id === session?.user.id
          const rolePending = memberAction === `role:${member.user_id}`
          return <div className="community-group-member-row" key={member.user_id}>
            <Avatar name={member.display_name || member.username} image={member.avatar_url ?? undefined} />
            <span><strong>{member.display_name || member.username || 'Community member'}</strong><small>@{member.username || 'member'} · {member.role === 'admin' ? 'Admin' : 'Member'}</small></span>
            {member.role === 'admin' && <ShieldCheck size={16} aria-label="Admin" />}
            {!isSelf && <Button type="button" variant="quiet" onClick={() => { setReportTarget({ userId: member.user_id, label: member.display_name || member.username || 'Community member' }); setReportError('') }}><Flag size={13} /> Report</Button>}
            {isCurrentAdmin && !isSelf && <span className="community-group-member-actions">
              <Button type="button" variant="quiet" onClick={() => void setMemberRole(member.user_id, member.role === 'admin' ? 'member' : 'admin')} disabled={!!memberAction}>
                {rolePending ? '…' : member.role === 'admin' ? 'Remove admin' : 'Make admin'}
              </Button>
              <Button type="button" variant="quiet" onClick={() => void removeGroupMember(member.user_id)} disabled={!!memberAction}>
                {memberAction === member.user_id ? '…' : 'Remove'}
              </Button>
            </span>}
          </div>
        })}</div>
        <Button type="button" variant="outline" onClick={() => void leaveGroup()} disabled={memberAction === 'leave'}>{memberAction === 'leave' ? 'Leaving…' : 'Leave community'}</Button>
      </div>
    </Modal>}
  </section>
}

export function NotificationsPage() {
  const { session } = useAuth()
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pendingId, setPendingId] = useState('')
  const [error, setError] = useState('')
  const [realtimeError, setRealtimeError] = useState('')
  useEffect(() => {
    let active = true
    let refreshPending = false
    let refreshQueued = false
    if (!session?.user) {
      setNotifications([])
      setError('')
      setIsLoading(false)
      setRealtimeError('')
      return () => { active = false }
    }
    setNotifications([])
    setError('')
    setIsLoading(true)
    setRealtimeError('')
    const refresh = async () => {
      if (refreshPending) {
        refreshQueued = true
        return
      }
      refreshPending = true
      do {
        refreshQueued = false
        try {
          const rows = await loadNotifications()
          if (active) {
            setNotifications(rows)
            setError('')
          }
          if (rows.some((row) => !row.is_read)) {
            await markAllNotificationsRead()
            if (active) {
              setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
            }
          }
        } catch (caught) {
          if (active) setError(userFacingError(caught, 'Could not load notifications.'))
        } finally {
          if (active) setIsLoading(false)
        }
      } while (active && refreshQueued)
      refreshPending = false
    }
    void refresh()
    const unsubscribe = subscribeToPostgresChanges({
      topic: `notifications:${session.user.id}`,
      event: '*',
      table: 'notifications',
      filter: `user_id=eq.${session.user.id}`,
    }, () => { void refresh() }, (status) => {
      if (!active) return
      setRealtimeError(status === 'SUBSCRIBED' ? '' : `Live notification updates are unavailable (${status.toLowerCase().replace('_', ' ')}). Refresh to check for new activity.`)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [session?.user.id])

  async function respondToJoinRequest(notification: NotificationRecord, approve: boolean) {
    if (!notification.group_join_request_id || pendingId) return
    setPendingId(notification.id)
    setError('')
    try {
      const { error: responseError } = await supabase.rpc('respond_community_group_join_request', { p_request_id: notification.group_join_request_id, p_approve: approve })
      if (responseError) throw responseError
      await markNotificationRead(notification.id)
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true, group_join_request_status: approve ? 'approved' : 'declined' } : item))
    } catch (caught) {
      setError(userFacingError(caught, approve ? 'Could not approve this group request.' : 'Could not decline this group request.'))
    } finally { setPendingId('') }
  }

  async function markRead(notification: NotificationRecord) {
    setPendingId(notification.id)
    setError('')
    try {
      await markNotificationRead(notification.id)
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item))
    } catch (caught) {
      setError(userFacingError(caught, 'Could not mark notification read.'))
    } finally {
      setPendingId('')
    }
  }

  const copyForType = (type: string) => {
    if (type === 'like' || type === 'post_like') return 'liked your post'
    if (type === 'comment' || type === 'post_comment') return 'commented on your post'
    if (type === 'follow') return 'started following you'
    if (type === 'message') return 'sent you a message'
    if (type === 'group_message') return 'sent a message in your community group'
    if (type === 'group_member_added') return 'added you to a community group'
    if (type === 'group_role_changed') return 'changed your role in a community group'
    if (type === 'group_member_removed') return 'removed you from a community group'
    if (type === 'group_join_request') return 'invited you to join a community group'
    if (type === 'group_join_request_result') return 'responded to your community group request'
    return 'sent you a notification'
  }

  return <section className="page-stack"><PageHeading eyebrow="A LITTLE HELLO FROM YOUR CIRCLE" title="Notifications" description="Recent activity for your account." />{realtimeError && <p className="field__error" role="status">{realtimeError}</p>}{error && <p className="field__error" role="alert">{error}</p>}{isLoading ? <Loading label="Loading notifications" /> : notifications.length ? <div className="notification-list">{notifications.map((notification) => { const actorName = notification.actor?.display_name || notification.actor?.username || 'A community member'; const Icon = notification.type.includes('like') ? Heart : notification.type.startsWith('group_') ? Users : notification.type === 'follow' ? Users : notification.type === 'message' ? MessageCircle : Sparkles; return <article className={`notification-row${notification.type === 'group_join_request' ? ' notification-row--request' : ''}`} key={notification.id}><Link className="notification-row__actor" to={notification.actor?.username ? `/profile/${encodeURIComponent(notification.actor.username)}` : '/connect'}><Avatar name={actorName} image={notification.actor?.avatar_url ?? undefined} /><span className="notification-row__body"><strong>{actorName}</strong> {copyForType(notification.type)}<small>{new Date(notification.created_at).toLocaleString()} · {notification.is_read ? 'Read' : 'Unread'}</small></span></Link><span className="notification-row__icon"><Icon size={15} /></span>{notification.type === 'group_join_request' ? <span className="notification-row__request-actions">{notification.group_join_request_status === 'approved' || notification.group_join_request_status === 'declined' ? <span className={`notification-row__request-status notification-row__request-status--${notification.group_join_request_status}`}>{notification.group_join_request_status === 'approved' ? 'Approved' : 'Declined'}</span> : <><button type="button" disabled={pendingId === notification.id} onClick={() => void respondToJoinRequest(notification, true)}>Approve</button><button type="button" disabled={pendingId === notification.id} onClick={() => void respondToJoinRequest(notification, false)}>Decline</button></>}</span> : !notification.is_read && <button type="button" className="icon-button" aria-label={`Mark ${actorName}'s notification read`} disabled={pendingId === notification.id} onClick={() => markRead(notification)}><Check size={17} /></button>}</article>})}</div> : <EmptyState title="You are all caught up" description="Notifications will appear here when available." />}</section>
}

export function AssistantPage() {
  const { session } = useAuth()
  const [searchParams] = useSearchParams()
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [input, setInput] = useState(searchParams.get('q') ?? '')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')

  async function ask(question: string) {
    const value = question.trim()
    if (!value || isSending || !session?.access_token) return
    const nextMessages = [...messages, { role: 'user' as const, content: value }]
    setMessages(nextMessages)
    setInput('')
    setError('')
    setIsSending(true)
    try {
      const { data, error: functionError } = await supabase.functions.invoke('banjara-ai', {
        body: { messages: nextMessages },
      })
      if (functionError) throw functionError
      if (!data?.answer) throw new Error('AI returned no answer.')
      setMessages((current) => [...current, { role: 'assistant', content: data.answer }])
    } catch (caught) {
      setError(userFacingError(caught, 'Could not connect to AI.'))
    } finally {
      setIsSending(false)
    }
  }

  useEffect(() => {
    const initial = searchParams.get('q')?.trim()
    if (initial) void ask(initial)
  }, [])

  return <section className="assistant-screen" aria-label="Banjara Connect AI">
    <header className="assistant-navbar"><div className="assistant-navbar__inner">
      <Button to="/home" variant="quiet" iconOnly aria-label="Back to community"><ArrowLeft size={18} /></Button>
      <div className="assistant-brand"><BrandMark size="small" /><span><strong>Ask with AI</strong><small>Banjara Connect AI</small></span></div>
      <Button variant="quiet" iconOnly aria-label="New AI conversation" onClick={() => { setMessages([]); setError(''); setInput('') }}><Plus size={17} /></Button>
    </div></header>
    <div className="assistant-shell">
      <div className="assistant-messages">
        {!messages.length && !isSending ? <div className="assistant-welcome"><BrandMark size="large" /><h1>What can I help you with?</h1><p>Ask anything. Banjara Connect AI will help you find an answer.</p></div> : messages.map((message, index) => <article className={`assistant-message assistant-message--${message.role}`} key={`${message.role}-${index}`}><strong>{message.role === 'user' ? 'You' : 'AI'}</strong><p>{message.content}</p></article>)}
        {isSending && <div className="assistant-message assistant-message--assistant"><strong>AI</strong><p>Thinking…</p></div>}
        {error && <p className="field__error" role="alert">{error}</p>}
      </div>
      {!messages.length && <div className="assistant-prompts">
        <button type="button" onClick={() => void ask('Tell me about Banjara history and culture.')}>Banjara history & culture <ArrowRight size={15} /></button>
        <button type="button" onClick={() => void ask('What are some useful community resources?')}>Community resources <ArrowRight size={15} /></button>
        <button type="button" onClick={() => void ask('Help me find useful information about my community.')}>Community discovery <ArrowRight size={15} /></button>
      </div>}
      <form className="assistant-compose" onSubmit={(event) => { event.preventDefault(); void ask(input) }}>
        <Input aria-label="Ask the assistant" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask anything…" disabled={isSending} autoComplete="off" />
        <Button type="submit" disabled={isSending || !input.trim()} iconOnly aria-label="Send question"><Send size={18} /></Button>
      </form>
    </div>
  </section>
}

const settingsGroups = [
  { heading: 'Your account', items: [{ to: '/edit-profile', icon: UserRound, title: 'Edit profile', detail: 'Name, username, and introduction' }, { to: '/settings/security', icon: KeyRound, title: 'Change password', detail: 'Verify your current password before updating' }, { to: '/settings/privacy', icon: ShieldCheck, title: 'Privacy & security', detail: 'Visibility and account safety' }, { to: '/settings/blocked', icon: LockKeyhole, title: 'Blocked users', detail: 'Manage profiles you have blocked' }] },
  { heading: 'More', items: [{ to: '/community/history', icon: BookOpen, title: 'Banjara History & Heritage', detail: 'Explore history, language, textile, performance and regional perspectives' }, { to: '/report', icon: CircleHelp, title: 'Report a concern', detail: 'Tell us what needs attention' }, { to: '/settings/delete-account', icon: UserRound, title: 'Account deletion', detail: 'Preview account options' }, { to: '/about', icon: Compass, title: 'About Banjara Connect', detail: 'The idea behind this community' }] },
]

export function SettingsPage() {
  const { signOut } = useAuth()
  const [theme, setTheme] = useState(() => window.localStorage.getItem('banjara-theme') || 'light')
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState('')

  async function handleSignOut() {
    setIsSigningOut(true)
    setError('')
    try {
      const { error: signOutError } = await signOut()
      if (signOutError) {
        setError(userFacingError(signOutError, 'Could not sign out. Please try again.'))
        return
      }
      navigate('/login', { replace: true })
    } catch (caught) {
      setError(userFacingError(caught, 'Could not sign out. Please try again.'))
    } finally {
      setIsSigningOut(false)
    }
  }

  function changeTheme(nextTheme: string) {
    setTheme(nextTheme)
    window.localStorage.setItem('banjara-theme', nextTheme)
    window.dispatchEvent(new Event('banjara-theme-change'))
  }

  return <section className="page-stack"><PageHeading eyebrow="MAKE IT YOURS" title="Settings" description="Manage your account and preferences." />
    <section className="settings-group settings-group--appearance"><h2>Appearance</h2>
      <div className="theme-control"><div><strong>App theme</strong><small>Choose how Banjara Connect looks on this device.</small></div>
        <div className="theme-control__choices">
          <button type="button" className={theme === 'light' ? 'is-active' : ''} onClick={() => changeTheme('light')}>☀️ Light</button>
          <button type="button" className={theme === 'dark' ? 'is-active' : ''} onClick={() => changeTheme('dark')}>🌙 Dark</button>
          <button type="button" className={theme === 'system' ? 'is-active' : ''} onClick={() => changeTheme('system')}>⚙️ System</button>
        </div>
      </div>
    </section>{settingsGroups.map((group) => <section className="settings-group" key={group.heading}><h2>{group.heading}</h2>{group.items.map(({ to, icon: Icon, title, detail }) => <Link className="settings-row" to={to} key={to}><span className="settings-row__icon"><Icon size={18} /></span><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={18} /></Link>)}</section>)}<PwaInstallControl />{error && <p className="field__error" role="alert">{error}</p>}<Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>{isSigningOut ? 'Signing out…' : 'Sign out'}</Button></section>
}

export function ChangePasswordPage() {
  const { session } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess(false)
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }
    if (!session?.user.email || !session.user.id) {
      setError('Your authenticated account could not be verified. Sign in again and retry.')
      return
    }

    setIsSaving(true)
    try {
      const { data: verification, error: verificationError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      })
      if (verificationError || verification.user?.id !== session.user.id) {
        setError('Could not verify your current password. Check it and try again.')
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        setError(userFacingError(updateError, 'Could not update your password.'))
        return
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess(true)
    } catch (caught) {
      setError(userFacingError(caught, 'Could not update your password.'))
    } finally {
      setIsSaving(false)
    }
  }

  return <section className="page-stack page-stack--narrow"><Button to="/settings" variant="quiet"><ArrowLeft size={16} />Settings</Button><PageHeading eyebrow="ACCOUNT SECURITY" title="Change password" description="Verify your current password before choosing a new one." /><form className="form-stack" onSubmit={submit}><Input label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /><Input label="New password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><Input label="Confirm new password" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />{error && <p className="field__error" role="alert">{error}</p>}{success && <p className="micro-note" role="status">Password updated. You are still signed in.</p>}<Button type="submit" disabled={isSaving}>{isSaving ? 'Updating password…' : 'Update password'}</Button></form><p className="micro-note">Password recovery is unavailable for mobile-only accounts.</p></section>
}

export function PrivacyPage() {
  const [privateProfile, setPrivateProfile] = useState(false)
  const [activityStatus, setActivityStatus] = useState(true)
  return <section className="page-stack page-stack--narrow"><Button to="/settings" variant="quiet"><ArrowLeft size={16} />Settings</Button><PageHeading eyebrow="YOUR SPACE, YOUR CHOICE" title="Privacy & security" description="These preference switches are visual previews and do not change account privacy." /><PreviewNotice>LOCAL UI STATE · NO ACCOUNT SETTINGS ARE SAVED</PreviewNotice><div className="settings-group"><h2>Profile visibility</h2><div className="preference-row"><span><strong>Private profile</strong><small>Preview only; this does not limit who can see your profile or posts.</small></span><button type="button" className={`toggle${privateProfile ? ' is-on' : ''}`} role="switch" aria-checked={privateProfile} aria-label="Private profile preview" onClick={() => setPrivateProfile(!privateProfile)}><span /></button></div><div className="preference-row"><span><strong>Show activity status</strong><small>Preview only; activity status is not shared or saved.</small></span><button type="button" className={`toggle${activityStatus ? ' is-on' : ''}`} role="switch" aria-checked={activityStatus} aria-label="Show activity status preview" onClick={() => setActivityStatus(!activityStatus)}><span /></button></div></div><div className="settings-group"><h2>Safety</h2><Link className="settings-row" to="/settings/blocked"><span className="settings-row__icon"><LockKeyhole size={18} /></span><span><strong>Blocked users</strong><small>Review profiles you have blocked</small></span><ChevronRight size={18} /></Link><Link className="settings-row" to="/report"><span className="settings-row__icon"><CircleHelp size={18} /></span><span><strong>Report a concern</strong><small>Let the team know what feels wrong</small></span><ChevronRight size={18} /></Link></div></section>
}

export function BlockedUsersPage() {
  const { session } = useAuth()
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pendingId, setPendingId] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!session?.user) {
      setProfiles([])
      setError('')
      setIsLoading(false)
      return () => { active = false }
    }
    setProfiles([])
    setError('')
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
        if (active) setError(userFacingError(caught, 'Could not load blocked profiles.'))
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
      setError(userFacingError(caught, 'Could not unblock this profile.'))
    } finally {
      setPendingId('')
    }
  }

  return <section className="page-stack page-stack--narrow"><Button to="/settings/privacy" variant="quiet"><ArrowLeft size={16} />Privacy & security</Button><PageHeading eyebrow="YOUR SAFETY" title="Blocked users" description="Manage profiles you have blocked." />{error && <p className="field__error" role="alert">{error}</p>}{isLoading ? <Loading label="Loading blocked profiles" /> : <div className="connect-list">{profiles.length ? profiles.map((profile) => { const name = profile.display_name || profile.username || 'Community member'; const username = profile.username || `member-${profile.id.slice(0, 8)}`; return <div className="blocked-row" key={profile.id}><Avatar name={name} image={profile.avatar_url ?? undefined} /><span><strong>{name}</strong><small>@{username}</small></span><Button variant="outline" disabled={pendingId === profile.id} onClick={() => unblock(profile.id)}>{pendingId === profile.id ? 'Updating…' : 'Unblock'}</Button></div>}) : <EmptyState title="No blocked profiles" description="Profiles you block will appear here." />}</div>}</section>
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
      setError(userFacingError(caught, 'Could not submit this report.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return <section className="page-stack page-stack--narrow"><PageHeading eyebrow="HELP KEEP THE CIRCLE KIND" title="Report a concern" description="Send a report about a post or comment." /><form className="form-stack" onSubmit={submit}><label className="field"><span className="field__label">Report target</span><select className="field__control" value={targetType} onChange={(event) => setTargetType(event.target.value)} required><option value="" disabled>Select post or comment</option><option value="post">Post</option><option value="comment">Comment</option></select></label><Input label="Target ID" value={targetId} onChange={(event) => setTargetId(event.target.value)} required /><label className="field"><span className="field__label">Reason</span><select className="field__control" value={reason} onChange={(event) => setReason(event.target.value)} required><option value="" disabled>Select a reason</option><option value="harassment">Harassment</option><option value="spam">Spam</option><option value="safety">Safety concern</option><option value="other">Other</option></select></label><label className="field"><span className="field__label">A few details</span><textarea className="field__control field__textarea" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Add context" maxLength={500} /></label>{error && <p className="field__error" role="alert">{error}</p>}{submitted && <p className="micro-note" role="status">Report submitted.</p>}<Button type="submit" disabled={isSubmitting || !targetId.trim()}>{isSubmitting ? 'Submitting…' : 'Submit report'} <ArrowRight size={16} /></Button><p className="micro-note">Profile reports are unsupported because no user-target reporting schema is verified in this project.</p></form></section>
}

export function DeleteAccountPage() {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { notify } = usePreviewToast()
  return <section className="page-stack page-stack--narrow"><Button to="/settings" variant="quiet"><ArrowLeft size={16} />Settings</Button><PageHeading eyebrow="ACCOUNT OPTIONS" title="Account deletion" description="Account deletion is not connected to a verified backend flow." /><PreviewNotice>ACCOUNT DELETION IS NOT AVAILABLE</PreviewNotice><div className="warning-panel"><LockKeyhole size={20} /><div><strong>Nothing will be deleted</strong><p>This app uses authenticated accounts, but no verified account-deletion backend is available. This confirmation is visual only.</p></div></div><Button variant="danger" onClick={() => setConfirmOpen(true)}>Preview deletion confirmation</Button><ConfirmationDialog open={confirmOpen} title="Delete preview account?" description="This is only a UI preview. No account or data will be deleted." confirmLabel="Close preview" onClose={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); notify('No account was deleted. This is a frontend preview.') }} /></section>
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
