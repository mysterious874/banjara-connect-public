import type { DeveloperProfile } from '../data/developer'

export function FounderProfile({ profile }: { profile: DeveloperProfile }) {
  return (
    <section id="developer" className="developer-credit" aria-label="Developer credit">
      <span className="eyebrow">DEVELOPER CREDIT</span>
      <p>{profile.credit}</p>
    </section>
  )
}
