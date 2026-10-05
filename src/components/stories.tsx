import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Avatar } from './ui'

const stories = [
  { name: 'Meera', tone: 'orange', initials: 'MP' },
  { name: 'Kiran', tone: 'blue', initials: 'KR' },
  { name: 'Sonal', tone: 'red', initials: 'SB' },
  { name: 'Ravi', tone: 'green', initials: 'RJ' },
  { name: 'Lata', tone: 'orange', initials: 'LR' },
]

export function StoryCard({ name, initials, tone, own = false }: { name: string; initials: string; tone: string; own?: boolean }) {
  return <Link to="/stories" className={`story-card${own ? ' story-card--own' : ''}`} aria-label={own ? 'Add a story, preview only' : `${name}'s story, preview only`}><span className="story-card__ring"><Avatar name={name} initials={initials} tone={tone} size="large" />{own && <span className="story-card__add"><Plus size={15} /></span>}</span><span className="story-card__name">{own ? 'Your story' : name}</span></Link>
}

export function StoriesRail() {
  return <section className="stories-rail" aria-labelledby="stories-heading"><div className="section-heading"><div><span className="eyebrow">A little window into today</span><h2 id="stories-heading">Stories</h2></div><Link to="/stories" className="text-link">See all</Link></div><div className="stories-rail__items"><StoryCard name="Your story" initials="AR" tone="red" own />{stories.map((story) => <StoryCard key={story.name} {...story} />)}</div></section>
}
