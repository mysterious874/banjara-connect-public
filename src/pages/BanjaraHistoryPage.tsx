import { ArrowLeft, BookOpen, ChevronDown, ChevronRight, Clock3, Globe2, Languages, MapPinned, Music2, Palette, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '../components/ui'
import { heritageSections, heritageSources, heritageTimeline, heritageTopics, nangaraMuseum } from '../data/banjaraHistory'

function SourceLinks({ ids }: { ids: string[] }) {
  if (!ids.length) return null
  return <span className="heritage-citations" aria-label="References">
    Sources: {ids.map((id, index) => {
      const source = heritageSources.find((item) => item.id === id)
      return source ? <a key={id} href={`#source-${id}`} title={source.title}>[{heritageSources.indexOf(source) + 1}]</a> : index
    })}
  </span>
}

const topicIcons = [BookOpen, Languages, Palette, Palette, Sparkles, Music2, Music2, Clock3, BookOpen, BookOpen, Globe2, ShieldCheck, MapPinned]

export function BanjaraHistoryPage() {
  return <article className="page-stack heritage-page">
    <Button to="/community" variant="quiet"><ArrowLeft size={16} />Community</Button>
    <header className="page-heading">
      <div><span className="eyebrow">COMMUNITY KNOWLEDGE · SOURCED NOTES</span><h1>Banjara History &amp; Heritage</h1><p>A starting point for learning, with regional context and references alongside the stories.</p></div>
    </header>
    <div className="heritage-notice" role="note"><BookOpen size={18} /><p><strong>Many histories, many living traditions.</strong> Names, language use, clothing, customs and celebration differ across regions and communities. Examples below are identified by their source location; none is presented as universal.</p></div>

    <section className="nangara-feature" aria-labelledby="nangara-title">
      <div className="nangara-feature__hero">
        <img src={nangaraMuseum.photos[0].src} alt={nangaraMuseum.photos[0].alt} />
        <div className="nangara-feature__hero-overlay">
          <span className="eyebrow">BANJARA VIRASAT · POHARADEVI</span>
          <h2 id="nangara-title">{nangaraMuseum.name}</h2>
          <p>{nangaraMuseum.location}</p>
        </div>
      </div>
      <div className="nangara-feature__copy">
        <span className="nangara-feature__kicker">A PLACE TO EXPERIENCE BANJARA HERITAGE</span>
        <p>{nangaraMuseum.summary}</p>
        <div className="nangara-feature__facts">
          {nangaraMuseum.details.map((detail, index) => <div key={detail}><span>{String(index + 1).padStart(2, '0')}</span><p>{detail}</p></div>)}
        </div>
        <div className="nangara-feature__actions">
          <a className="button button--primary" href={nangaraMuseum.officialUrl} target="_blank" rel="noreferrer">Museum website</a>
          <a className="button button--outline" href={nangaraMuseum.galleryUrl} target="_blank" rel="noreferrer">View gallery</a>
          <a className="button button--quiet" href={nangaraMuseum.districtUrl} target="_blank" rel="noreferrer">District info</a>
        </div>
      </div>
      <div className="nangara-feature__thumbs" aria-label="More museum photographs">
        {nangaraMuseum.photos.slice(1).map((photo) => <figure key={photo.src}><img src={photo.src} alt={photo.alt} loading="lazy" /><figcaption>{photo.caption}</figcaption></figure>)}
      </div>
    </section>

    <section className="heritage-overview" aria-labelledby="heritage-overview-title">
      <div className="section-heading"><h2 id="heritage-overview-title">Explore the collection</h2><span className="local-label">{heritageTopics.length} TOPICS</span></div>
      <div className="heritage-topic-grid">{heritageTopics.map((topic, index) => {
        const Icon = topicIcons[index] ?? BookOpen
        return <a className="heritage-topic" href={`#${topic.id}`} onClick={(event) => { event.preventDefault(); const target = document.getElementById(topic.id); if (target instanceof HTMLDetailsElement) target.open = true; target?.scrollIntoView({ block: 'start', behavior: 'instant' }) }} key={`${topic.title}-${topic.id}`}><span className="heritage-topic__icon"><Icon size={17} /></span><strong>{topic.title}</strong><span>{topic.description}</span><ChevronRight size={15} className="heritage-topic__arrow" /></a>
      })}</div>
    </section>

    <section className="heritage-timeline-section" aria-labelledby="heritage-timeline-title">
      <div className="section-heading"><div><span className="eyebrow">A BROAD HISTORICAL OUTLINE</span><h2 id="heritage-timeline-title">Timeline</h2></div><span className="local-label">PERIODS, NOT A SINGLE ORIGIN STORY</span></div>
      <ol className="heritage-timeline">{heritageTimeline.map((item) => <li className="heritage-timeline__item" key={item.title}><span className="heritage-timeline__marker" aria-hidden="true" /><div className="heritage-timeline__copy"><span className="heritage-timeline__period">{item.period}</span><h3>{item.title}</h3><p>{item.text}</p><SourceLinks ids={item.sources} /></div></li>)}</ol>
    </section>

    <section className="heritage-reading" aria-labelledby="heritage-reading-title">
      <div className="section-heading"><div><span className="eyebrow">A CLOSER LOOK</span><h2 id="heritage-reading-title">History and living heritage</h2></div><span className="local-label">{heritageSections.length} NOTES</span></div>
      <div className="heritage-section-list">{heritageSections.map((section) => <details className="heritage-section" id={section.id} key={section.id}><summary className="heritage-section__summary" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const disclosure = event.currentTarget.parentElement; if (disclosure instanceof HTMLDetailsElement) disclosure.open = !disclosure.open } }}><span className="heritage-section__number">{section.number}</span><h3>{section.title}</h3><ChevronDown size={16} aria-hidden="true" /></summary><div className="heritage-section__body"><p>{section.text}</p><SourceLinks ids={section.sources} /></div></details>)}</div>
    </section>

    <section className="heritage-sources" id="sources" aria-labelledby="heritage-sources-title">
      <div className="section-heading"><div><span className="eyebrow">CHECK THE RECORD</span><h2 id="heritage-sources-title">Sources &amp; references</h2></div><span className="local-label">{heritageSources.length} SOURCES</span></div>
      <p className="heritage-sources__intro">Historical claims are linked to their sources above. Regional studies are labeled as such; this page does not treat one source or field site as representative of every Banjara community.</p>
      <ol className="heritage-source-list">{heritageSources.map((source, index) => <li className="heritage-source" id={`source-${source.id}`} key={source.id}><span className="heritage-source__number">{index + 1}</span><div><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><p>{source.author} · {source.publisher} · {source.year}</p><small>{source.scope}</small></div></li>)}</ol>
    </section>
    <footer className="heritage-footer"><span>Corrections and community perspectives are welcome through community-led contribution channels when those are available.</span></footer>
  </article>
}
