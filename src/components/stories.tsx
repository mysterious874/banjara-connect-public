import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Avatar } from './ui'
import { useAuth } from '../hooks/AuthProvider'
import { loadActiveStories, type StoryRecord } from '../utils/storyData'

export function StoryCard({ story, own = false }: { story?: StoryRecord; own?: boolean }) {
  const name = story?.author?.display_name || story?.author?.username || 'Community member'
  return <Link to="/stories" state={story ? { story } : undefined} className={`story-card${own ? ' story-card--own' : ''}`} aria-label={own ? 'Add a story' : `${name}'s story`}>
    <span className="story-card__ring"><Avatar name={name} image={story?.author?.avatar_url ?? undefined} size="large" />{own && <span className="story-card__add"><Plus size={15} /></span>}</span>
    <span className="story-card__name">{own ? 'Your story' : name}</span>
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
  const grouped = Array.from(new Map(stories.map((story) => [story.user_id, story])).values())
  const ownStory = grouped.find((story) => story.user_id === session?.user.id)
  const otherStories = grouped.filter((story) => story.user_id !== session?.user.id).slice(0, 8)
  return <section className="stories-rail" aria-labelledby="stories-heading"><div className="section-heading"><div><span className="eyebrow">A LITTLE WINDOW INTO TODAY</span><h2 id="stories-heading">Stories</h2></div><Link to="/stories" className="text-link">See all</Link></div><div className="stories-rail__items"><StoryCard story={ownStory} own />{otherStories.map((story) => <StoryCard key={story.user_id} story={story} />)}</div></section>
}
