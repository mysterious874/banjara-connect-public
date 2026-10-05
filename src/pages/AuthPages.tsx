import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { BrandLockup, BrandMark } from '../components/brand'
import { Button, Input } from '../components/ui'
import { useAuth } from '../hooks/AuthProvider'
import { hideSyntheticAuthEmail, mobileAuthEmail, normalizeMobileNumber } from '../utils/authIdentity'
import { supabase } from '../utils/supabase'

export function SplashPage() {
  const navigate = useNavigate()
  useEffect(() => {
    const timer = window.setTimeout(() => navigate('/home', { replace: true }), 3200)
    return () => window.clearTimeout(timer)
  }, [navigate])
  return <main className="splash"><div className="splash__pattern" aria-hidden="true" /><div className="splash__content"><span className="splash__logo-wrap"><span className="splash__logo-ring" /><BrandMark size="large" /></span><h1>Banjara Connect</h1><span className="splash__line" /><p>Apni community. Apni pehchaan. Apna connection.</p><span className="splash__loader" aria-hidden="true"><span /></span></div></main>
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/home'

  useEffect(() => {
    if (session) navigate(destination, { replace: true })
  }, [destination, navigate, session])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const normalizedPhone = normalizeMobileNumber(mobile)
    if (!normalizedPhone) {
      setError('Enter a valid mobile number.')
      return
    }

    const authEmail = mobileAuthEmail(normalizedPhone)
    setIsSubmitting(true)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: authEmail, password })
      if (authError) {
        setError(authError.code === 'user_already_exists' || /already (registered|exists)/i.test(authError.message)
          ? 'We could not complete signup. If you already have an account, sign in instead.'
          : hideSyntheticAuthEmail(authError.message))
        return
      }
      navigate(destination, { replace: true })
    } catch (authError) {
      setError(authError instanceof Error ? hideSyntheticAuthEmail(authError.message) : 'Could not sign in. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <main className="auth-page"><div className="auth-page__brand"><BrandLockup /></div><div className="auth-card"><span className="eyebrow">WELCOME BACK</span><h1>Come on in.</h1><p className="auth-card__intro">Your people and their stories are right here.</p><form className="form-stack" onSubmit={submit}><Input label="Mobile number" type="tel" autoComplete="username" placeholder="Enter your mobile number" value={mobile} onChange={(event) => setMobile(event.target.value)} required /><Input label="Password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />{error && <p className="field__error" role="alert">{error}</p>}<p className="micro-note auth-card__forgot" role="note">Password recovery is unavailable for mobile-only accounts.</p><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Continue'} {!isSubmitting && <ArrowRight size={17} />}</Button></form><div className="auth-card__divider"><span>NEW TO THE COMMUNITY?</span></div><p className="micro-note" role="note">New account registration is temporarily unavailable. Please try again later.</p></div></main>
}

export function SignupPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (session) navigate('/home', { replace: true })
  }, [navigate, session])

  return <main className="auth-page"><div className="auth-page__brand"><BrandLockup /></div><div className="auth-card"><span className="eyebrow">WELCOME TO THE COMMUNITY</span><h1>Sign-up is temporarily unavailable.</h1><p className="auth-card__intro">New account registration is temporarily unavailable. Please try again later.</p><p className="micro-note">Existing members can continue to sign in.</p><Button to="/login" variant="outline" className="button--full">Back to sign in</Button></div></main>
}
