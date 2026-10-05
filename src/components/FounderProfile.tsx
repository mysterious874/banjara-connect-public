import { BookOpen, HeartHandshake, Network, ShieldCheck, Sparkles } from 'lucide-react'
import type { DeveloperProfile } from '../data/developer'

export function FounderProfile({ profile }: { profile: DeveloperProfile }) {
  return (
    <section id="developer" className="founder-section" aria-labelledby="founder-heading">
      <div className="section-heading"><div><span className="eyebrow">THE PERSON BUILDING THE PLATFORM</span><h2 id="founder-heading">Founder &amp; developer</h2></div><span className="local-label">BANJARA CONNECT</span></div>
      <div className="founder-profile">
        <div className="founder-identity">
          <span className="eyebrow">DEVELOPER CREDIT</span>
          <h3>{profile.credit}</h3>
          <div className="founder-about"><span className="eyebrow">ABOUT THE PROJECT</span><p>{profile.about}</p></div>
        </div>
      </div>
      <section className="founder-purpose" aria-labelledby="founder-purpose-heading">
        <div className="founder-purpose__icon"><HeartHandshake size={20} /></div>
        <div>
          <span className="eyebrow">BUILT TO CONNECT. BUILT TO PRESERVE.</span>
          <h3 id="founder-purpose-heading">Why I Built Banjara Connect</h3>
          <p>{profile.why}</p>
        </div>
      </section>
      <div className="founder-vision"><HeartHandshake size={18} /><p><strong>Mission</strong> {profile.mission}</p></div>
      <div className="founder-focus-grid">
        {profile.focusAreas.map(({ title, text }, index) => {
          const Icon = [Network, BookOpen, ShieldCheck][index]
          return <article className="founder-focus" key={title}><span className="founder-focus__icon"><Icon size={18} /></span><h3>{title}</h3><p>{text}</p></article>
        })}
      </div>
      <div className="founder-vision"><Sparkles size={18} /><p><strong>Vision</strong> {profile.vision}</p></div>
      <section className="developer-journey" aria-labelledby="developer-journey-heading"><div className="section-heading"><h3 id="developer-journey-heading">Technology &amp; development</h3></div><p>{profile.technology}</p><p>{profile.developmentJourney}</p></section>
      <section className="developer-public-info" aria-labelledby="developer-public-heading"><div className="section-heading"><h3 id="developer-public-heading">Public project information</h3></div><dl>{profile.publicProjectInfo.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>
    </section>
  )
}
