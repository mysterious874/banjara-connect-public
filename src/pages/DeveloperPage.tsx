import { ArrowLeft } from 'lucide-react'
import { FounderProfile } from '../components/FounderProfile'
import { Button } from '../components/ui'
import { developerProfile } from '../data/developer'

export function DeveloperPage() {
  return <section className="page-stack page-stack--narrow"><Button to="/about" variant="quiet"><ArrowLeft size={16} />About Connect</Button><header className="page-heading"><div><span className="eyebrow">ABOUT CONNECT</span><h1>Developer credit</h1><p>A community space for connection, culture, and shared stories.</p></div></header><FounderProfile profile={developerProfile} /></section>
}
