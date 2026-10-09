import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Avatar } from './ui'
import { useAuth } from '../hooks/AuthProvider'
import { loadActiveStories, type StoryRecord } from '../utils/storyData'

function preloadStoryMedia(story?: StoryRecord) {
  if (!story?.media_url) return
  if (story.media_type === 'video') {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.src = story.media_url
  } else {
    const image = new Image()
    image.src = story.media_url
  }
}

const STORY_VIEWED_KEY = 'banjara_connect_story_views_v1'

function loadViewedStories() {
  try {
    return JSON.parse(localStorage.getItem(STORY_VIEWED_KEY) || '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function markStoryViewed(story?: StoryRecord) {
  if (!story) return
  const viewed = loadViewedStories()
  viewed[story.user_id] = story.id
  try { localStorage.setItem(STORY_VIEWED_KEY, JSON.stringify(viewed)) } catch { /* ignore storage failures */ }
}

export function hasViewedStory(story?: StoryRecord) {
  if (!story) return false
  return loadViewedStories()[story.user_id] === story.id
}

export function StoryCard({ story, own = false, muted = false }: { story?: StoryRecord; own?: boolean; muted?: boolean }) {
  const name = story?.author?.display_name || story?.author?.username || 'Community member'
  const viewed = !own && hasViewedStory(story)
  const destination = own ? (story ? '/stories?manage=1' : '/stories?create=1') : story ? `/stories?story=${story.id}` : '/stories'
  return <Link to={destination} state={!own && story ? { story } : undefined} onPointerDown={() => preloadStoryMedia(story)} onClick={() => { if (!own) markStoryViewed(story) }} className={`story-card${own ? ' story-card--own' : ''}${!viewed && !own ? ' story-card--unread' : ''}${muted ? ' story-card--muted' : ''}`} aria-label={own ? (story ? 'View your stories' : 'Create a story') : `${name}'s story`}>
    <span className="story-card__ring"><Avatar name={name} image={story?.author?.avatar_url ?? undefined} size="large" />{own && !story && <span className="story-card__add"><Plus size={19} /></span>}</span>
    <span className="story-card__name">{own ? (story ? 'Your stories' : 'Add story') : name}</span>
  </Link>
}

export function StoriesRail() {
  const { session } = useAuth()
  const [stories, setStories] = useState<StoryRecord[]>([])
  useEffect(() => {
    let active = true
    if (!session?.user.id) {
      setStories([])
      return () => { active = false }
    }
    loadActiveStories().then((next) => { if (active) setStories(next) }).catch(() => { if (active) setStories([]) })
    return () => { active = false }
  }, [session?.user.id])
  const grouped = Array.from(stories.reduce((map, story) => {
    if (!map.has(story.user_id)) map.set(story.user_id, story)
    return map
  }, new Map<string, StoryRecord>()).values())
  // Keep users ordered by their latest story, but start each user's viewer at
  // their earliest active story so multiple stories play in sequence.
  const railStories = grouped.map((latest) => stories
    .filter((story) => story.user_id === latest.user_id)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0])
    .filter((story): story is StoryRecord => Boolean(story))
  const ownStory = railStories.find((story) => story.user_id === session?.user.id)
  const otherStories = railStories.filter((story) => story.user_id !== session?.user.id).slice(0, 8)
  return <section className="stories-rail" aria-labelledby="stories-heading"><div className="section-heading"><div><span className="eyebrow">A LITTLE WINDOW INTO TODAY</span><h2 id="stories-heading">Stories</h2></div><Link to="/stories" className="text-link">See all</Link></div><div className="stories-rail__items"><StoryCard story={ownStory} own />{otherStories.map((story) => <StoryCard key={story.user_id} story={story} muted={mutedUserIds.includes(story.user_id)} />)}</div></section>
}
