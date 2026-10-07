import { Link } from 'react-router-dom'
import { Download, ShieldCheck, Smartphone } from 'lucide-react'
import { BrandMark } from '../components/brand'
import { PwaInstallControl } from '../components/PwaInstall'

export function InstallPage() {
  return (
    <main className="splash" style={{ minHeight: '100dvh', overflow: 'auto' }}>
      <div className="splash__pattern" aria-hidden="true" />
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          width: 'min(92vw, 430px)',
          margin: '0 auto',
          padding: '32px 0 40px',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 18 }}>
          <BrandMark size="large" />
        </div>

        <h1 style={{ marginBottom: 8 }}>Banjara Connect</h1>
        <p style={{ margin: '0 auto 24px', maxWidth: 340 }}>
          Install the app for a faster, full-screen community experience.
        </p>

        <div
          style={{
            background: 'var(--surface, rgba(255,255,255,.92))',
            borderRadius: 20,
            padding: 20,
            boxShadow: '0 12px 40px rgba(0,0,0,.12)',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Download size={20} />
              <span>One-tap install when your browser supports it</span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Smartphone size={20} />
              <span>Opens like a normal mobile app</span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <ShieldCheck size={20} />
              <span>Your existing account and data stay unchanged</span>
            </div>
          </div>

          <PwaInstallControl />
        </div>

        <Link
          to="/"
          style={{
            display: 'inline-block',
            marginTop: 20,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Continue to Banjara Connect
        </Link>
      </div>
    </main>
  )
}
