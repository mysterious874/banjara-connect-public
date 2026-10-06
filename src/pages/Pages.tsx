import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Compass, Heart, KeyRound, LockKeyhole, MapPin, MessageCircle, Paperclip, Pencil, Plus, Search, Send, ShieldCheck, Sparkles, Trash2, UserRound, Users, X } from 'lucide-react'
import { PostCard, PostComposer } from '../components/feed'
import { BrandLockup, BrandMark } from '../components/brand'
import { SearchBar } from '../components/search'
import { PwaInstallControl } from '../components/PwaInstall'
import { StoriesRail } from '../components/stories'
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
import { createStory, deleteStory, loadActiveStories, validateStoryMedia, type StoryRecord } from '../utils/storyData'
import { userFacingError } from '../utils/userFacingError'
import { subscribeToPostgresChanges } from '../utils/realtimeData'
import { loadNotifications, markNotificationRead, markAllNotificationsRead, type NotificationRecord } from '../utils/notificationData'
import { createReport } from '../utils/reportData'
import type { FeedPost, ProfileRecord } from '../types/app'
import { deleteMessageForEveryone, deleteMessageForMe, loadConversationMessages, loadConversationPeer, loadConversations, sendConversationMessage, subscribeToConversation, type ChatMessage } from '../utils/chatData'
import { createComment, deleteComment, loadCommentLikes, loadComments, toggleCommentLike, updateComment, type CommentRecord } from '../utils/socialData'

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

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}

function PreviewNotice({ children = 'FRONTEND PREVIEW · LOCAL SAMPLE CONTENT' }: { children?: ReactNode }) {
  return <div className="preview-notice"><span className="preview-notice__dot" />{children}</div>
}

export function HomePage() {
  const { profile, isProfileLoading, profileError, session } = useAuth()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isPostsLoading, setIsPostsLoading] = useState(true)
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false)
  const [postsHasMore, setPostsHasMore] = useState(false)
  const [postsOffset, setPostsOffset] = useState(0)
  const [postsError, setPostsError] = useState('')
  const [people, setPeople] = useState<ProfileRecord[]>([])
  const [isPeopleLoading, setIsPeopleLoading] = useState(true)
  const [peopleError, setPeopleError] = useState('')

  useEffect(() => {
    let active = true
    if (!session?.user) {
      setPeople([])
      setPeopleError('')
      setIsPeopleLoading(false)
      return () => { active = false }
    }
    setPeople([])
    setPeopleError('')
    setIsPeopleLoading(true)
    loadProfiles().then((nextPeople) => {
      if (active) setPeople(nextPeople)
    }).catch((error: unknown) => {
      if (active) setPeopleError(userFacingError(error, 'Could not load profiles.'))
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
    setPosts([])
    setPostsHasMore(false)
    setIsPostsLoading(true)
    setPostsError('')
    void (async () => {
      try {
        const blockedIds = await loadBlockedUserIds()
        const page = await loadPostsPage({ excludeUserIds: blockedIds })
        if (active) {
          setPosts(page.posts)
          setPostsHasMore(page.hasMore)
          setPostsOffset(page.nextOffset)
        }
      } catch (error) {
        if (active) setPostsError(userFacingError(error, 'Could not load posts.'))
      } finally {
        if (active) setIsPostsLoading(false)
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
      const page = await loadPostsPage({ excludeUserIds: blockedIds, offset: postsOffset })
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
        <SearchBar showAssistant />
        <StoriesRail />
        <PostComposer name={profile?.display_name || profile?.username || 'Your profile'} image={profile?.avatar_url} />
        <div className="feed-heading"><div><span className="eyebrow">FROM YOUR COMMUNITY</span><h2>Your feed</h2></div></div>
        {isPostsLoading ? <Loading label="Loading posts" /> : postsError && !posts.length ? <ErrorState title="Could not load posts" description={postsError} /> : posts.length === 0 ? <EmptyState title="No posts yet" description="Posts shared with your community will appear here." action={<Button to="/create" variant="outline">Create a post</Button>} /> : <><div className="feed-list">{posts.map((post) => <PostCard key={post.id} post={post} onDeleted={() => setPosts((current) => current.filter((item) => item.id !== post.id))} />)}</div>{postsError && <p className="field__error" role="alert">{postsError}</p>}{postsHasMore && <Button variant="outline" onClick={() => void loadMorePosts()} disabled={isLoadingMorePosts}>{isLoadingMorePosts ? 'Loading posts…' : 'Load more posts'}</Button>}</>}
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
  const [searchResults, setSearchResults] = useState<ProfileRecord[]>([])
  const [usernameQuery, setUsernameQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')
  const [searchError, setSearchError] = useState('')
  useEffect(() => {
    let active = true
    if (!session?.user) {
      setPeople([])
      setSearchResults([])
      setUsernameQuery('')
      setError('')
      setIsLoading(false)
      return () => { active = false }
    }
    setPeople([])
    setError('')
    setIsLoading(true)
    loadProfiles().then((nextPeople) => { if (active) setPeople(nextPeople) }).catch((caught: unknown) => { if (active) setError(userFacingError(caught, 'Could not load profiles.')) }).finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [session?.user.id])
  useEffect(() => {
    let active = true
    const value = usernameQuery.trim()
    setSearchError('')
    if (value.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return () => { active = false }
    }
    setIsSearching(true)
    const timer = window.setTimeout(() => {
      searchProfilesByUsername(value).then((results) => {
        if (active) setSearchResults(results)
      }).catch((caught: unknown) => {
        if (active) {
          setSearchResults([])
          setSearchError(userFacingError(caught, 'Could not search usernames.'))
        }
      }).finally(() => {
        if (active) setIsSearching(false)
      })
    }, 300)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [session?.user.id, usernameQuery])
  const showingSearch = usernameQuery.trim().length >= 2
  return <section className="page-stack"><PageHeading eyebrow="FIND YOUR CIRCLE" title="Connect" description="Meet community members and discover the places, traditions, and ideas they care about." /><div className="connect-search"><Search size={17} aria-hidden="true" /><input type="search" value={usernameQuery} onChange={(event) => setUsernameQuery(event.target.value)} placeholder="Search by username" aria-label="Search by username" autoComplete="off" />{usernameQuery && <button type="button" aria-label="Clear username search" onClick={() => setUsernameQuery('')}><X size={16} /></button>}</div>{showingSearch && <section className="connect-search-results"><div className="section-heading"><h2>{isSearching ? 'Searching…' : `Results for @${usernameQuery.trim()}`}</h2></div>{searchError ? <p className="field__error" role="alert">{searchError}</p> : isSearching ? <Loading label="Searching usernames" /> : searchResults.length ? <div className="connect-list">{searchResults.map((user) => <UserCard key={user.id} user={user} />)}</div> : <EmptyState title="No username found" description="Try another username." />}</section>}<div className="connect-feature"><div className="connect-feature__icon"><Users size={23} /></div><div><span className="eyebrow">YOUR COMMUNITY</span><h2>Good things grow together.</h2><p>Discover members and shared interests.</p></div><Compass className="connect-feature__watermark" size={74} /></div><div className="section-heading"><h2>People you may know</h2></div>{isLoading ? <Loading label="Loading profiles" /> : error ? <ErrorState title="Could not load profiles" description={error} /> : people.length ? <div className="connect-list">{people.map((user) => <UserCard key={user.id} user={user} />)}</div> : <EmptyState title="No profiles to show" description="Other community profiles will appear here when available." />}</section>
}

export function CommunityPage() {
  const { profile, session } = useAuth()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState('')
  const [groups, setGroups] = useState<Array<{ id: string; name: string; description: string; member_count: number }>>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
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
      if (!ids.length) { setGroups([]); return }
      const { data, error: groupsError } = await supabase.from('community_groups').select('id,name,description').in('id', ids).order('created_at', { ascending: false })
      if (groupsError) throw groupsError
      const { data: members, error: membersError } = await supabase.from('community_group_members').select('group_id').in('group_id', ids)
      if (membersError) throw membersError
      const counts = new Map<string, number>()
      for (const member of members ?? []) counts.set(member.group_id, (counts.get(member.group_id) ?? 0) + 1)
      setGroups((data ?? []).map((group) => ({ ...group, member_count: counts.get(group.id) ?? 0 })))
    } catch (caught) {
      setGroupError(userFacingError(caught, 'Could not load your communities.'))
    } finally {
      setGroupsLoading(false)
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
    if (append) setIsLoadingMore(true); else setIsLoading(true)
    setError('')
    try {
      const blockedIds = await loadBlockedUserIds()
      const page = await loadPostsPage({ excludeUserIds: blockedIds, offset: nextOffset })
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
    setPosts([]); setOffset(0); setHasMore(false)
    void loadCommunityPosts()
    void loadGroups()
  }, [session?.user.id])

  return <section className="page-stack page-stack--narrow">
    <PageHeading eyebrow="SHARED STORIES, SHARED ROOTS" title="Community" description="Share stories, join groups and connect around the things that matter to you." />

    <div className="community-groups-head">
      <div><span className="eyebrow">YOUR COMMUNITIES</span><h2>Groups</h2></div>
      <Button onClick={() => { setGroupError(''); setGroupModalOpen(true) }}><Plus size={16} />Create community</Button>
    </div>

    {groupsLoading ? <Loading label="Loading your groups" /> : groups.length ? <div className="community-groups-list">{groups.map((group) => <Link to={`/community/groups/${group.id}`} className="community-group-card" key={group.id}><span className="community-group-card__icon"><Users size={20} /></span><div><strong>{group.name}</strong><p>{group.description || 'A Banjara Connect community group.'}</p><small>{group.member_count} {group.member_count === 1 ? 'member' : 'members'}</small></div><ChevronRight size={18} /></Link>)}</div> : <div className="community-groups-empty"><Users size={22} /><div><strong>No communities yet</strong><p>Create a group for your friends, family, region, interests or local circle.</p></div></div>}

    <div className="community-action-card"><div className="post-card__author"><Avatar name={profile?.display_name || profile?.username || 'Your profile'} image={profile?.avatar_url ?? undefined} /><span><strong>{profile?.display_name || profile?.username || 'Your profile'}</strong><small>Share something with the community</small></span></div><Button to="/create">Create a post <Send size={15} /></Button></div>

    <div className="section-heading"><div><span className="eyebrow">COMMUNITY FEED</span><h2>What people are sharing</h2></div><button type="button" className="button button--quiet" onClick={() => void loadCommunityPosts()} disabled={isLoading}>Refresh</button></div>
    {isLoading ? <Loading label="Loading community posts" /> : error && !posts.length ? <ErrorState title="Could not load community" description={error} /> : posts.length ? <div className="feed-list">{posts.map((post) => <PostCard key={post.id} post={post} onDeleted={() => setPosts((current) => current.filter((item) => item.id !== post.id))} />)}</div> : <EmptyState title="The community is quiet" description="Be the first to share a story, photo or thought with the community." action={<Button to="/create">Create the first post</Button>} />}
    {error && posts.length > 0 && <p className="field__error" role="alert">{error}</p>}
    {hasMore && <Button variant="outline" onClick={() => void loadCommunityPosts(offset, true)} disabled={isLoadingMore}>{isLoadingMore ? 'Loading more posts…' : 'Load more posts'}</Button>}
    <Link to="/community/history" className="community-heritage-link"><span className="community-heritage-link__icon"><BookOpen size={20} /></span><span><strong>Banjara History &amp; Heritage</strong><small>Explore history, language, textile, performance and regional perspectives.</small></span><ChevronRight size={18} /></Link>

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
  return <section className="page-stack"><PageHeading eyebrow="LOOK A LITTLE CLOSER" title="Search" description="Find community profiles." /><SearchBar placeholder="Try a name or place" /><div className="section-heading"><h2>{query ? `Results for “${query}”` : 'Suggested profiles'}</h2></div>{isLoading ? <Loading label="Searching profiles" /> : error && !profiles.length ? <ErrorState title="Could not search profiles" description={error} /> : <>{error && <p className="field__error" role="alert">{error}</p>}{matches.length ? <div className="connect-list">{matches.map((user) => <UserCard key={user.id} user={user} />)}</div> : <EmptyState title="No profiles found" description={hasMore ? 'Load more profiles to continue searching.' : 'Try another name or place.'} />}{hasMore && <Button variant="outline" onClick={() => void loadMoreProfiles()} disabled={isLoadingMore}>{isLoadingMore ? 'Loading profiles…' : 'Load more profiles'}</Button>}</>}</section>
}

export function CreatePostPage() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

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
    <PageHeading eyebrow="MAKE SOMETHING TOGETHER" title="Create a post" description="Share a thought, photo, or video with your community." />
    <form className="create-post-box" onSubmit={submit}>
      <div className="post-card__author"><Avatar name={profile?.display_name || profile?.username || 'Your profile'} image={profile?.avatar_url ?? undefined} /><span><strong>{profile?.display_name || profile?.username || 'Your profile'}</strong><span>Sharing with the community</span></span></div>
      <label className="visually-hidden" htmlFor="post-text">Write your post</label>
      <textarea id="post-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="What would you like to share?" maxLength={500} />
      <div className="create-post-media-picker">
        <label className="button button--outline" htmlFor="post-media">Add photo or video</label>
        <input id="post-media" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={handleMediaChange} />
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
    Promise.all([loadPost(postId), loadComments(postId), loadBlockedUserIds()]).then(([nextPost, nextComments, blockedIds]) => {
      if (!active) return
      if (nextPost && blockedIds.includes(nextPost.user_id)) {
        setPost(null)
        setComments([])
        return
      }
      setPost(nextPost)
      setComments(nextComments.filter((comment) => !blockedIds.includes(comment.user_id)))
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

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!content.trim() || isSubmitting) return
    setIsSubmitting(true)
    setError('')
    try {
      const refreshedComments = await createComment(postId, content)
      const blockedIds = await loadBlockedUserIds()
      setComments(refreshedComments.filter((comment) => !blockedIds.includes(comment.user_id)))
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

  return <section className="page-stack page-stack--narrow"><Button to={`/posts/${post.id}`} variant="quiet"><ArrowLeft size={16} />Back to post</Button><PageHeading eyebrow="COMMUNITY COMMENTS" title="The conversation" description={`On ${postAuthor}'s post`} />{error && <p className="field__error" role="alert">{error}</p>}<div className="comment-list">{comments.length ? comments.map((comment) => <CommentItemCard key={comment.id} comment={comment} like={commentLikes[comment.id] ?? { count: 0, liked: false }} isLikePending={pendingLikeIds.includes(comment.id)} onToggleLike={toggleLike} onUpdated={(commentId, updatedContent) => setComments((current) => current.map((item) => item.id === commentId ? { ...item, content: updatedContent } : item))} onDeleted={(commentId) => { setComments((current) => current.filter((item) => item.id !== commentId)); setCommentLikes((current) => { const next = { ...current }; delete next[commentId]; return next }) }} />) : <EmptyState title="No comments yet" description="Start the conversation." />}</div><form className="comment-compose" onSubmit={submitComment}><Input aria-label="Write a comment" placeholder="Add to the conversation..." value={content} onChange={(event) => setContent(event.target.value)} /><Button type="submit" iconOnly aria-label="Send comment" disabled={!content.trim() || isSubmitting}>{isSubmitting ? '…' : <Send size={17} />}</Button></form></section>
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
  return <section className="page-stack"><div className="profile-cover"><span className="profile-cover__stitch" /><span className="profile-cover__label">COMMUNITY PROFILE</span></div><div className="profile-summary"><Avatar name={name} image={profile.avatar_url ?? undefined} size="large" /><div className="profile-summary__actions">{isOwn ? <Button to="/edit-profile" variant="outline">Edit profile</Button> : <><Button variant="outline" onClick={startConversation} disabled={isStartingConversation || isBlockPending}>{isStartingConversation ? 'Opening…' : 'Message'}</Button><Button variant="quiet" onClick={handleBlock} disabled={isBlockPending}>{isBlockPending ? 'Updating…' : 'Block'}</Button></>}</div><h1>{name}</h1><span className="profile-handle">@{profileUsername}</span><span className="local-label">{profile.is_verified ? 'Verified' : 'Member'}</span>{profile.bio && <p>{profile.bio}</p>}{profile.location && <span className="profile-location"><MapPin size={14} />{profile.location}</span>}{blockError && <p className="field__error" role="alert">{blockError}</p>}</div><div className="section-heading"><h2>Posts</h2></div>{isProfilePostsLoading ? <Loading label="Loading profile posts" /> : profilePostsError && !profilePosts.length ? <ErrorState title="Could not load profile posts" description={profilePostsError} /> : profilePosts.length === 0 ? <EmptyState title="No posts yet" description="Posts shared by this profile will appear here." /> : <><div className="feed-list">{profilePosts.map((post) => <PostCard key={post.id} post={post} onDeleted={() => setProfilePosts((current) => current.filter((item) => item.id !== post.id))} />)}</div>{profilePostsError && <p className="field__error" role="alert">{profilePostsError}</p>}{profilePostsHasMore && <Button variant="outline" onClick={() => void loadMoreProfilePosts()} disabled={isLoadingMoreProfilePosts}>{isLoadingMoreProfilePosts ? 'Loading posts…' : 'Load more posts'}</Button>}</>}</section>
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
      <div className="location-picker__input">
        <Input aria-label="Location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Search city or place" autoComplete="off" />
        <Button type="button" variant="quiet" onClick={() => void useCurrentLocation()} disabled={isFetchingLocation} title="Use my current location">{isFetchingLocation ? 'Finding…' : <><MapPin size={16} />Use current</>}</Button>
      </div>
      {(isLoadingSuggestions || locationSuggestions.length > 0) && <div className="location-suggestions" role="listbox" aria-label="Location suggestions">
        {isLoadingSuggestions && <span className="location-suggestions__status">Searching locations…</span>}
        {locationSuggestions.map((suggestion, index) => <button type="button" className="location-suggestion" key={suggestion.displayName + index} onClick={() => selectLocation(suggestion)}><MapPin size={15} /><span>{suggestion.displayName}</span></button>)}
      </div>}
      <span className="micro-note">Type a place for suggestions, or use your current browser location.</span>
    </div>
    {error && <p className="field__error" role="alert">{error}</p>}
    {success && <p className="micro-note" role="status">Profile saved.</p>}
    <Button type="submit" disabled={isSaving || isProfileLoading}>{isSaving ? 'Saving…' : 'Save profile'} {!isSaving && <Check size={17} />}</Button>
  </form></section>
}
export function StoriesPage() {
  const navigate = useNavigate()
  const [storyParams] = useSearchParams()
  const { session, profile } = useAuth()
  const [stories, setStories] = useState<StoryRecord[]>([])
  const [selectedStory, setSelectedStory] = useState<StoryRecord | null>(null)
  const [storyText, setStoryText] = useState('')
  const [storyFile, setStoryFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isReplying, setIsReplying] = useState(false)
  const [error, setError] = useState('')
  const [replyMessage, setReplyMessage] = useState('')
  const [success, setSuccess] = useState('')
  const storyTimer = useRef<number | null>(null)

  const grouped = Array.from(new Map(stories.map((story) => [story.user_id, story])).values())
  const activeIndex = selectedStory ? grouped.findIndex((story) => story.user_id === selectedStory.user_id) : -1

  async function refreshStories() {
    setIsLoading(true)
    setError('')
    try {
      const next = await loadActiveStories()
      setStories(next)
      const requestedStoryId = storyParams.get('story')
      setSelectedStory((current) => {
        if (requestedStoryId) return next.find((item) => item.id === requestedStoryId) ?? current ?? next[0] ?? null
        if (current) return next.find((item) => item.user_id === current.user_id) ?? next[0] ?? null
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
    if (!selectedStory || grouped.length <= 1) return
    if (storyTimer.current) window.clearTimeout(storyTimer.current)
    storyTimer.current = window.setTimeout(() => {
      if (activeIndex >= 0 && activeIndex < grouped.length - 1) {
        setSelectedStory(grouped[activeIndex + 1])
      } else {
        navigate('/home')
      }
    }, selectedStory.media_type === 'video' ? 8000 : 5000)
    return () => {
      if (storyTimer.current) window.clearTimeout(storyTimer.current)
    }
  }, [selectedStory?.id, activeIndex, grouped.length, navigate])

  useEffect(() => {
    if (!selectedStory) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') navigate('/home')
      if (event.key === 'ArrowRight' && activeIndex < grouped.length - 1) setSelectedStory(grouped[activeIndex + 1])
      if (event.key === 'ArrowLeft' && activeIndex > 0) setSelectedStory(grouped[activeIndex - 1])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedStory?.id, activeIndex, grouped.length, navigate])

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
      setSuccess('Your story is live for 24 hours.')
    } catch (caught) {
      setError(userFacingError(caught, 'Could not publish your story.'))
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
      const nextGrouped = Array.from(new Map(remaining.map((item) => [item.user_id, item])).values())
      const nextIndex = Math.min(activeIndex, nextGrouped.length - 1)
      setSelectedStory(nextGrouped[nextIndex] ?? null)
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
    setSelectedStory(story)
    setReplyMessage('')
    setSuccess('')
  }

  return <section className="page-stack">
    {!isLoading && !selectedStory && <>
          <PageHeading eyebrow="LITTLE WINDOWS INTO TODAY" title="Stories" description="Share a photo, video, or message. Stories disappear after 24 hours." />
          <form className="story-create-box" onSubmit={publishStory}>
            <div className="post-card__author"><Avatar name={profile?.display_name || profile?.username || 'Your profile'} image={profile?.avatar_url ?? undefined} /><span><strong>Your story</strong><span>Visible for 24 hours</span></span></div>
            <textarea aria-label="Story message" value={storyText} onChange={(event) => setStoryText(event.target.value)} placeholder="Add a message to your story (optional)" maxLength={500} />
            <div className="story-create-box__media"><label className="button button--outline" htmlFor="story-media">Add photo or video</label><input id="story-media" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={handleStoryFile} />{storyFile && <span className="micro-note">{storyFile.name} · {(storyFile.size / (1024 * 1024)).toFixed(1)} MB</span>}<span className="micro-note">JPG, PNG, WEBP, GIF, MP4, WebM or MOV · max 50 MB</span></div>
            <Button type="submit" disabled={isPublishing || (!storyText.trim() && !storyFile)}>{isPublishing ? 'Publishing…' : 'Post story'} <Send size={15} /></Button>
          </form>
          {error && <p className="field__error" role="alert">{error}</p>}
          {success && <p className="micro-note" role="status">{success}</p>}
          {isLoading ? <Loading label="Loading stories" /> : grouped.length === 0 ? <EmptyState title="No active stories" description="Be the first to share something with the community." /> : <div className="story-page-thumbs"><div className="section-heading"><h2>Today's stories</h2><span className="local-label">{grouped.length} people</span></div><div className="stories-rail__items">{grouped.map((story) => {
            const name = story.author?.display_name || story.author?.username || 'Community member'
            return <button type="button" key={story.user_id} className="story-card story-card--button" onClick={() => openViewer(story)}><span className="story-card__ring"><Avatar name={name} image={story.author?.avatar_url ?? undefined} size="large" /></span><span className="story-card__name">{name}</span></button>
          })}</div></div>}
      
    </>}
    {selectedStory && grouped.length > 0 && <div className="story-fullscreen" role="dialog" aria-modal="true" aria-label="Story viewer">
      <div className="story-fullscreen__backdrop" onClick={() => navigate('/home')} />
      <div className="story-fullscreen__card">
        <div className="story-fullscreen__progress">{grouped.map((story, index) => <span key={story.user_id} className={`story-fullscreen__progress-segment${index < activeIndex ? ' is-complete' : index === activeIndex ? ' is-active' : ''}`} />)}</div>
        <div className="story-fullscreen__head">
          <div className="post-card__author"><Avatar name={selectedStory.author?.display_name || selectedStory.author?.username || 'Community member'} image={selectedStory.author?.avatar_url ?? undefined} /><span><strong>{selectedStory.author?.display_name || selectedStory.author?.username || 'Community member'}</strong><span>{new Date(selectedStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span></div>
          <button type="button" className="story-fullscreen__close" onClick={() => navigate('/home')} aria-label="Close story"><X size={22} /></button>
        </div>
        <button type="button" className="story-fullscreen__prev" onClick={() => activeIndex > 0 && setSelectedStory(grouped[activeIndex - 1])} disabled={activeIndex <= 0} aria-label="Previous story"><ArrowLeft size={25} /></button>
        <div className="story-fullscreen__content">
          {selectedStory.media_url && selectedStory.media_type === 'video' && <video src={selectedStory.media_url} controls autoPlay playsInline className="story-fullscreen__asset" />}
          {selectedStory.media_url && selectedStory.media_type === 'image' && <img src={selectedStory.media_url} alt="Story" className="story-fullscreen__asset" />}
          {!selectedStory.media_url && <div className="story-fullscreen__text">{selectedStory.content}</div>}
          {selectedStory.media_url && selectedStory.content && <div className="story-fullscreen__caption">{selectedStory.content}</div>}
        </div>
        <button type="button" className="story-fullscreen__next" onClick={() => activeIndex < grouped.length - 1 ? setSelectedStory(grouped[activeIndex + 1]) : navigate('/home')} aria-label="Next story"><ArrowRight size={25} /></button>
        {selectedStory.user_id !== session?.user.id && <form className="story-fullscreen__reply" onSubmit={replyToStory}><Input aria-label="Reply to story" placeholder="Send message…" value={replyMessage} onChange={(event) => setReplyMessage(event.target.value)} /><Button type="submit" iconOnly aria-label="Send message" disabled={!replyMessage.trim() || isReplying}>{isReplying ? '…' : <Send size={17} />}</Button></form>}
        {selectedStory.user_id === session?.user.id && <button type="button" className="story-fullscreen__delete" onClick={() => void removeStory(selectedStory)}><Trash2 size={16} /> Delete story</button>}
      </div>
    </div>}
  </section>
}

export function ReelsPage() {
  return <section className="page-stack"><PageHeading eyebrow="SHORT COMMUNITY FILMS" title="Reels" description="A small visual preview of stories in motion." /><PreviewNotice /><div className="reel-placeholder"><img src="/loom-preview.svg" alt="Abstract, Banjara-inspired geometric threadwork" /><div className="reel-placeholder__copy"><span className="eyebrow">LOCAL ARTWORK PREVIEW</span><h2>Made by hand,<br />held in memory.</h2><p>Short videos will live here when media is connected.</p><Button to="/about" variant="outline">About the community</Button></div></div></section>
}

export function ChatListPage() {
  const { session } = useAuth()
  const [conversations, setConversations] = useState<Awaited<ReturnType<typeof loadConversations>>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let requestPending = false
    let refreshQueued = false
    setConversations([])
    setError('')
    setIsLoading(true)
    const refresh = async () => {
      if (requestPending) {
        refreshQueued = true
        return
      }
      requestPending = true
      do {
        refreshQueued = false
        try {
          const rows = await loadConversations()
          if (active) {
            setConversations(rows)
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
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      active = false
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [session?.user.id])
  return <section className="page-stack"><PageHeading eyebrow="CONVERSATIONS" title="Chat" description="Your conversations." />{isLoading ? <Loading label="Loading conversations" /> : error ? <ErrorState title="Could not load conversations" description={error} /> : conversations.length ? <div className="chat-list">{conversations.map((conversation) => { const name = conversation.member.display_name || conversation.member.username; return <Link to={`/chat/${conversation.id}`} className="chat-row" key={conversation.id}><Avatar name={name} image={conversation.member.avatar_url ?? undefined} /><span className="chat-row__copy"><strong>{name}</strong><span>{conversation.lastMessage?.content || (conversation.lastMessage?.media_type === 'image' ? '📷 Photo' : conversation.lastMessage?.media_type === 'video' ? '🎥 Video' : 'No messages yet')}</span></span><span className="chat-row__time">{conversation.unreadCount > 0 ? `${conversation.unreadCount} unread` : conversation.lastMessage ? new Date(conversation.lastMessage.created_at).toLocaleDateString() : ''}</span></Link>})}</div> : <EmptyState title="No conversations yet" description="Start a conversation from a community profile." />}</section>
}

export function ChatConversationPage() {
  const { conversationId = '' } = useParams()
  const { session } = useAuth()
  const [message, setMessage] = useState('')
  const [person, setPerson] = useState<ProfileRecord | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [error, setError] = useState('')
  const [realtimeError, setRealtimeError] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState('')
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([])
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null)
  const [isSendingMedia, setIsSendingMedia] = useState(false)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const suppressNextMessageClick = useRef(false)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | null = null
    let messageRefreshPending = false
    let messageRefreshQueued = false
    setIsLoading(true)
    setError('')
    setRealtimeError('')
    setPerson(null)
    setMessages([])
    setHasOlderMessages(false)
    setSelectedMedia(null)
    if (mediaInputRef.current) mediaInputRef.current.value = ''
    void (async () => {
      try {
        const [peer, history] = await Promise.all([loadConversationPeer(conversationId), loadConversationMessages(conversationId)])
        if (!active) return
        setPerson(peer as ProfileRecord)
        setMessages(history.messages)
        setHasOlderMessages(history.hasMore)
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
                return [...byId.values()].sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
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
      } catch (caught) {
        if (active) setError(userFacingError(caught, 'Could not load this conversation.'))
      } finally {
        if (active) setIsLoading(false)
      }
    })()
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [conversationId, session?.user.id])

  async function loadOlderMessages() {
    const oldest = messages[0]
    if (!oldest || isLoadingOlder || !hasOlderMessages) return
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
        if (textToSend === message.trim()) setMessage('')
      } catch (caught) {
        setError(userFacingError(caught, 'Could not send the photo or video.'))
      } finally {
        setIsSendingMedia(false)
      }
      return
    }

    try {
      const created = await sendConversationMessage(conversationId, textToSend)
      setMessages((current) => current.some((item) => item.id === created.id) ? current : [...current, created])
      setMessage('')
    } catch (caught) {
      setError(userFacingError(caught, 'Could not send this message.'))
    }
  }

  if (isLoading) return <section className="chat-screen"><Loading label="Loading conversation" /></section>
  if (error && !person) return <section className="page-stack"><ErrorState title="Could not load conversation" description={error} /></section>
  if (!person) return <section className="page-stack"><EmptyState title="Conversation unavailable" description="This conversation could not be found." action={<Button to="/chat" variant="outline">Back to chats</Button>} /></section>
  const personName = person.display_name || person.username
  return <section className="chat-screen"><header className="chat-screen__head"><Button to="/chat" variant="quiet" iconOnly aria-label="Back to chats"><ArrowLeft size={18} /></Button><Link to={`/profile/${encodeURIComponent(person.username)}`} className="chat-screen__profile"><Avatar name={personName} image={person.avatar_url ?? undefined} /><span className="chat-screen__identity"><strong>{personName}</strong><small>@{person.username}</small></span></Link><span /></header><div className="chat-messages">{hasOlderMessages && <Button variant="quiet" onClick={() => void loadOlderMessages()} disabled={isLoadingOlder}>{isLoadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}</Button>}{selectedMessageIds.length > 0 && <div className="chat-selection-toolbar"><button type="button" className="chat-selection-toolbar__close" onClick={cancelMessageSelection} aria-label="Close message selection">×</button><strong>{selectedMessageIds.length} selected</strong><button type="button" onClick={() => void copySelectedMessages()}>Copy</button><button type="button" disabled={pendingDeleteId === 'bulk'} onClick={() => void deleteSelectedMessages('me')}>Delete for me</button>{messages.some((item) => selectedMessageIds.includes(item.id) && item.sender_id === session?.user.id && !item.is_deleted_for_everyone && (item.media_type === 'image' || item.media_type === 'video' || item.content)) && <button type="button" disabled={pendingDeleteId === 'bulk'} onClick={() => void deleteSelectedMessages('everyone')}>Delete for everyone</button>}</div>}{messages.length ? messages.map((item) => { const mine = item.sender_id === session?.user.id; const selected = selectedMessageIds.includes(item.id); const mediaUrl = item.media_signed_url; return <div className={`chat-message-row${mine ? ' chat-message-row--you' : ' chat-message-row--them'}${selected ? ' chat-message-row--selected' : ''}`} key={item.id}><div className={`chat-bubble${mine ? ' chat-bubble--you' : ' chat-bubble--them'}${selected ? ' chat-bubble--selected' : ''}`} onPointerDown={() => startMessageLongPress(item.id)} onPointerUp={clearLongPressTimer} onPointerCancel={clearLongPressTimer} onPointerLeave={clearLongPressTimer} onContextMenu={(event) => handleMessageContextMenu(event, item.id)} onClick={() => {
  if (suppressNextMessageClick.current) {
    suppressNextMessageClick.current = false
    return
  }
  if (selectedMessageIds.length > 0) toggleMessageSelection(item.id)
}}>{item.is_deleted_for_everyone ? <em>Message deleted</em> : <>{mediaUrl && item.media_type === 'image' && <img className="chat-message-media" src={mediaUrl} alt="Shared photo" loading="lazy" />}{mediaUrl && item.media_type === 'video' && <video className="chat-message-media chat-message-media--video" src={mediaUrl} controls playsInline preload="metadata" />}{item.content && <p className="chat-message-text">{renderChatMessageContent(item.content)}</p>}</>}<span>{new Date(item.created_at).toLocaleTimeString()}</span></div></div>}) : <p className="micro-note">No messages yet. Start the conversation.</p>}{realtimeError && <p className="field__error" role="status">{realtimeError}</p>}{error && <p className="field__error" role="alert">{error}</p>}</div><div className="chat-compose-area">{isSendingMedia && <div className="chat-media-sending" role="status" aria-live="polite"><span className="chat-media-sending__icon"><Paperclip size={14} /></span><span className="chat-media-sending__info"><strong>Sending photo/video…</strong><small>You can continue chatting while it sends</small><span className="chat-media-sending__track"><span /></span></span></div>}{selectedMedia && !isSendingMedia && <div className="chat-attachment-preview"><span><Paperclip size={14} />{selectedMedia.name}</span><button type="button" onClick={clearSelectedMedia} aria-label="Remove selected media">×</button></div>}<form className="chat-disabled-compose" onSubmit={sendMessage}><input ref={mediaInputRef} className="chat-media-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={handleMediaChange} /><Button type="button" variant="quiet" iconOnly aria-label="Attach photo or video" onClick={() => mediaInputRef.current?.click()} disabled={isSendingMedia}><Paperclip size={18} /></Button><Input aria-label="Message" placeholder={selectedMedia ? 'Add a caption (optional)' : 'Write a message'} value={message} onChange={(event) => setMessage(event.target.value)} /><Button type="submit" disabled={!message.trim() && !selectedMedia} iconOnly aria-label="Send message">{isSendingMedia ? '…' : <Send size={17} />}</Button></form><p className="micro-note">Photos and videos up to 50 MB</p></div></section>
}


type CommunityGroupMessage = {
  id: string
  group_id: string
  sender_id: string
  content: string
  created_at: string
}

export function CommunityGroupPage() {
  const { groupId = '' } = useParams()
  const { session } = useAuth()
  const [group, setGroup] = useState<{ id: string; name: string; description: string; created_by: string } | null>(null)
  const [messages, setMessages] = useState<CommunityGroupMessage[]>([])
  const [profiles, setProfiles] = useState<Record<string, ProfileRecord>>({})
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const [realtimeError, setRealtimeError] = useState('')
  const [members, setMembers] = useState<Array<{ user_id: string; role: string; username: string; display_name: string | null; avatar_url: string | null }>>([])
  const [membersOpen, setMembersOpen] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')
  const [memberResults, setMemberResults] = useState<ProfileRecord[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberAction, setMemberAction] = useState('')
  const [memberError, setMemberError] = useState('')

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | null = null
    setIsLoading(true)
    setError('')
    setRealtimeError('')
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
          supabase.from('community_group_messages').select('id,group_id,sender_id,content,created_at').eq('group_id', groupId).order('created_at', { ascending: true }).limit(100),
          supabase.from('community_group_members').select('user_id,role').eq('group_id', groupId).order('joined_at', { ascending: true }),
        ])
        if (groupError) throw groupError
        if (messagesError) throw messagesError
        if (membersError) throw membersError
        if (!groupRow) throw new Error('This community no longer exists.')
        const nextMessages = (rows ?? []) as CommunityGroupMessage[]
        const senderIds = [...new Set([...nextMessages.map((row) => row.sender_id), ...((memberRows ?? []) as Array<{ user_id: string }>).map((row) => row.user_id)])]
        const { data: senderProfiles, error: profilesError } = senderIds.length
          ? await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', senderIds)
          : { data: [], error: null }
        if (profilesError) throw profilesError
        if (!active) return
        setGroup(groupRow)
        setMessages(nextMessages)
        setProfiles(Object.fromEntries((senderProfiles ?? []).map((profile) => [profile.id, profile as ProfileRecord])))
        setMembers(((memberRows ?? []) as Array<{ user_id: string; role: string }>).map((member) => ({ user_id: member.user_id, role: member.role, username: '', display_name: null, avatar_url: null })))
        unsubscribe = subscribeToPostgresChanges({
          topic: `community-group:${groupId}`,
          event: '*',
          table: 'community_group_messages',
          filter: `group_id=eq.${groupId}`,
        }, () => {
          void (async () => {
            const { data: latest, error: latestError } = await supabase
              .from('community_group_messages')
              .select('id,group_id,sender_id,content,created_at')
              .eq('group_id', groupId)
              .order('created_at', { ascending: true })
              .limit(100)
            if (latestError || !active) return
            const next = (latest ?? []) as CommunityGroupMessage[]
            setMessages(next)
            const ids = [...new Set(next.map((row) => row.sender_id))]
            if (ids.length) {
              const { data: latestProfiles } = await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', ids)
              if (active) setProfiles(Object.fromEntries((latestProfiles ?? []).map((profile) => [profile.id, profile as ProfileRecord])))
            }
          })()
        }, (status) => {
          if (active) setRealtimeError(status === 'SUBSCRIBED' ? '' : `Live group updates are unavailable (${status.toLowerCase().replace('_', ' ')}).`)
        })
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

  async function addGroupMember(userId: string) {
    if (!groupId) return
    setMemberAction(userId)
    setMemberError('')
    try {
      const { error: addError } = await supabase.rpc('add_community_group_member', { p_group_id: groupId, p_user_id: userId })
      if (addError) throw addError
      setMemberResults((current) => current.filter((profile) => profile.id !== userId))
      await loadGroupMembers()
      setMemberQuery('')
    } catch (caught) {
      setMemberError(userFacingError(caught, 'Could not add this member.'))
    } finally {
      setMemberAction('')
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

  async function sendGroupMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const textToSend = message.trim()
    if (!textToSend || isSending || !session?.user || !groupId) return
    setIsSending(true)
    setError('')
    try {
      const { data, error: sendError } = await supabase.from('community_group_messages')
        .insert({ group_id: groupId, sender_id: session.user.id, content: textToSend })
        .select('id,group_id,sender_id,content,created_at')
        .single()
      if (sendError) throw sendError
      setMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data as CommunityGroupMessage])
      setMessage('')
    } catch (caught) {
      setError(userFacingError(caught, 'Could not send this message.'))
    } finally {
      setIsSending(false)
    }
  }

  async function deleteGroupMessage(messageId: string) {
    if (!session?.user) return
    try {
      const { error: deleteError } = await supabase.from('community_group_messages').delete().eq('id', messageId).eq('sender_id', session.user.id)
      if (deleteError) throw deleteError
      setMessages((current) => current.filter((item) => item.id !== messageId))
    } catch (caught) {
      setError(userFacingError(caught, 'Could not delete this message.'))
    }
  }

  if (isLoading) return <section className="chat-screen"><Loading label="Loading community" /></section>
  if (error && !group) return <section className="page-stack"><ErrorState title="Could not load community" description={error} /></section>
  if (!group) return <section className="page-stack"><EmptyState title="Community unavailable" description="This community could not be found." action={<Button to="/community" variant="outline">Back to community</Button>} /></section>

  return <section className="chat-screen community-group-screen">
    <header className="chat-screen__head">
      <Button to="/community" variant="quiet" iconOnly aria-label="Back to community"><ArrowLeft size={18} /></Button>
      <button type="button" className="chat-screen__profile community-group-header-button" onClick={() => { setMembersOpen(true); void loadGroupMembers() }}>
        <span className="community-group-card__icon"><Users size={20} /></span>
        <span className="chat-screen__identity"><strong>{group.name}</strong><small>{members.length} members · tap for members</small></span>
      </button>
      <button type="button" className="icon-button" aria-label="Leave community" onClick={() => void leaveGroup()} disabled={memberAction === 'leave'}>{memberAction === 'leave' ? '…' : <ArrowRight size={17} />}</button>
    </header>
    <div className="chat-messages">
      {messages.length ? messages.map((item) => {
        const mine = item.sender_id === session?.user.id
        const sender = profiles[item.sender_id]
        const senderName = sender?.display_name || sender?.username || 'Community member'
        return <div className={`chat-message-row${mine ? ' chat-message-row--you' : ' chat-message-row--them'}`} key={item.id}>
          <div className={`chat-bubble${mine ? ' chat-bubble--you' : ' chat-bubble--them'}`}>
            {!mine && <strong className="community-group-message__sender">{senderName}</strong>}
            <p className="chat-message-text">{item.content}</p>
            <span>{new Date(item.created_at).toLocaleTimeString()}</span>
            {mine && <button type="button" className="community-group-message__delete" onClick={() => void deleteGroupMessage(item.id)} aria-label="Delete message">Delete</button>}
          </div>
        </div>
      }) : <p className="micro-note">No messages yet. Say hello to the group.</p>}
      {realtimeError && <p className="field__error" role="status">{realtimeError}</p>}
      {error && <p className="field__error" role="alert">{error}</p>}
    </div>
    <div className="chat-compose-area">
      <form className="chat-disabled-compose" onSubmit={sendGroupMessage}>
        <Input aria-label="Group message" placeholder="Message this community" value={message} onChange={(event) => setMessage(event.target.value)} />
        <Button type="submit" disabled={!message.trim() || isSending} iconOnly aria-label="Send group message">{isSending ? '…' : <Send size={17} />}</Button>
      </form>
    </div>
  {membersOpen && <Modal title={group.name} onClose={() => { setMembersOpen(false); setMemberQuery(''); setMemberResults([]); setMemberError('') }}>
      <div className="community-group-members-panel">
        <div className="community-group-members-title"><strong>Members</strong><span>{members.length}</span></div>
        <Input aria-label="Search username to add" placeholder="Search username to add" value={memberQuery} onChange={(event) => void searchGroupMembers(event.target.value)} />
        {memberError && <p className="field__error" role="alert">{memberError}</p>}
        {membersLoading && <Loading label="Loading members" />}
        {memberResults.length > 0 && <div className="community-group-member-results">{memberResults.map((profile) => <div className="community-group-member-row" key={profile.id}><Avatar name={profile.display_name || profile.username} image={profile.avatar_url ?? undefined} /><span><strong>{profile.display_name || profile.username}</strong><small>@{profile.username}</small></span><Button type="button" onClick={() => void addGroupMember(profile.id)} disabled={memberAction === profile.id}>{memberAction === profile.id ? '…' : 'Add'}</Button></div>)}</div>}
        <div className="community-group-member-list">{members.map((member) => <div className="community-group-member-row" key={member.user_id}><Avatar name={member.display_name || member.username} image={member.avatar_url ?? undefined} /><span><strong>{member.display_name || member.username || 'Community member'}</strong><small>@{member.username || 'member'} · {member.role === 'admin' ? 'Admin' : 'Member'}</small></span>{member.role === 'admin' && <ShieldCheck size={16} aria-label="Admin" />}</div>)}</div>
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
    return 'sent you a notification'
  }

  return <section className="page-stack"><PageHeading eyebrow="A LITTLE HELLO FROM YOUR CIRCLE" title="Notifications" description="Recent activity for your account." />{realtimeError && <p className="field__error" role="status">{realtimeError}</p>}{error && <p className="field__error" role="alert">{error}</p>}{isLoading ? <Loading label="Loading notifications" /> : notifications.length ? <div className="notification-list">{notifications.map((notification) => { const actorName = notification.actor?.display_name || notification.actor?.username || 'A community member'; const Icon = notification.type.includes('like') ? Heart : notification.type === 'follow' ? Users : notification.type === 'message' ? MessageCircle : Sparkles; return <article className="notification-row" key={notification.id}><Avatar name={actorName} image={notification.actor?.avatar_url ?? undefined} /><span className="notification-row__icon"><Icon size={15} /></span><p><strong>{actorName}</strong> {copyForType(notification.type)}<small>{new Date(notification.created_at).toLocaleString()} · {notification.is_read ? 'Read' : 'Unread'}</small></p>{!notification.is_read && <button type="button" className="icon-button" aria-label={`Mark ${actorName}'s notification read`} disabled={pendingId === notification.id} onClick={() => markRead(notification)}><Check size={17} /></button>}</article>})}</div> : <EmptyState title="You are all caught up" description="Notifications will appear here when available." />}</section>
}

export function AssistantPage() {
  const { notify } = usePreviewToast()
  return <section className="assistant-screen" aria-label="Banjara Connect AI preview"><header className="assistant-navbar"><div className="assistant-navbar__inner"><Button to="/home" variant="quiet" iconOnly aria-label="Back to community"><ArrowLeft size={18} /></Button><div className="assistant-brand"><BrandMark size="small" /><span><strong>Ask with AI</strong><small>Banjara Connect AI · preview</small></span></div><Button variant="quiet" iconOnly aria-label="New preview conversation" onClick={() => notify('AI is not connected. No conversation was started.')}><Plus size={17} /></Button></div></header><div className="assistant-shell"><PreviewNotice>AI IS NOT CONNECTED IN THIS PHASE</PreviewNotice><div className="assistant-messages"><div className="assistant-welcome"><BrandMark size="large" /><h1>What can I help you with?</h1><p>This visual preview does not generate answers or send messages to an AI service.</p></div></div><div className="assistant-prompts"><button type="button" onClick={() => notify('Assistant suggestions are placeholders in this preview.')}>Community resources <ArrowRight size={15} /></button><button type="button" onClick={() => notify('Assistant suggestions are placeholders in this preview.')}>Banjara history & culture <ArrowRight size={15} /></button><button type="button" onClick={() => notify('Assistant suggestions are placeholders in this preview.')}>Find a local gathering <ArrowRight size={15} /></button></div><form className="assistant-compose" onSubmit={(event) => { event.preventDefault(); notify('The assistant is not connected. Your message was not sent.') }}><Input aria-label="Ask the assistant" placeholder="Assistant is unavailable in this preview" disabled /><Button type="submit" disabled iconOnly aria-label="Send question"><Send size={18} /></Button></form></div></section>
}

const settingsGroups = [
  { heading: 'Your account', items: [{ to: '/edit-profile', icon: UserRound, title: 'Edit profile', detail: 'Name, username, and introduction' }, { to: '/settings/security', icon: KeyRound, title: 'Change password', detail: 'Verify your current password before updating' }, { to: '/settings/privacy', icon: ShieldCheck, title: 'Privacy & security', detail: 'Visibility and account safety' }, { to: '/settings/blocked', icon: LockKeyhole, title: 'Blocked users', detail: 'Manage profiles you have blocked' }] },
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

  return <section className="page-stack"><PageHeading eyebrow="MAKE IT YOURS" title="Settings" description="Manage your account and preferences." />{settingsGroups.map((group) => <section className="settings-group" key={group.heading}><h2>{group.heading}</h2>{group.items.map(({ to, icon: Icon, title, detail }) => <Link className="settings-row" to={to} key={to}><span className="settings-row__icon"><Icon size={18} /></span><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={18} /></Link>)}</section>)}<PwaInstallControl />{error && <p className="field__error" role="alert">{error}</p>}<Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>{isSigningOut ? 'Signing out…' : 'Sign out'}</Button></section>
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
