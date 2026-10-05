import { ArrowLeft } from 'lucide-react'
import { FounderProfile } from '../components/FounderProfile'
import { Button } from '../components/ui'
import { developerProfile } from '../data/developer'

export function DeveloperPage() {
  return <section className="page-stack page-stack--narrow"><Button to="/about" variant="quiet"><ArrowLeft size={16} />About Banjara Connect</Button><header className="page-heading"><div><span className="eyebrow">THE PERSON BUILDING THE PLATFORM</span><h1>Founder &amp; developer</h1><p>The public founder profile for Banjara Connect.</p></div></header><FounderProfile profile={developerProfile} /></section>
}
