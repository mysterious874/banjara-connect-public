import { Link } from 'react-router-dom'

type BrandMarkProps = {
  size?: 'small' | 'medium' | 'large'
}

export function BrandMark({ size = 'medium' }: BrandMarkProps) {
  return (
    <span className={`brand-mark brand-mark--${size}`} aria-hidden="true">
      <img src="/banjara-mark.svg" alt="" />
    </span>
  )
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/home" className={`brand-lockup${compact ? ' brand-lockup--compact' : ''}`} aria-label="Banjara Connect home">
      <BrandMark size={compact ? 'small' : 'medium'} />
      <span className="brand-lockup__copy"><span className="brand-lockup__name">Banjara Connect</span><span className="brand-lockup__tagline">People · Community · Culture</span></span>
    </Link>
  )
}
