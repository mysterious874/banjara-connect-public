import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { BrandLockup, BrandMark } from '../components/brand'
import { Button, Input } from '../components/ui'
import { useAuth } from '../hooks/AuthProvider'
import { mobileAuthEmail, normalizeMobileNumber } from '../utils/authIdentity'
import { supabase } from '../utils/supabase'
import { userFacingError } from '../utils/userFacingError'

export function SplashPage() {
  const navigate = useNavigate()
  useEffect(() => {
    const timer = window.setTimeout(() => navigate('/home', { replace: true }), 4000)
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
  const requestedDestination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
  const destination = requestedDestination?.startsWith('/') && !requestedDestination.startsWith('//') && !requestedDestination.includes('\\')
    ? requestedDestination
    : '/home'

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
        setError(userFacingError(authError, 'Unable to sign in with those details. Please try again.'))
        return
      }
      navigate(destination, { replace: true })
    } catch (authError) {
      setError(userFacingError(authError, 'Could not sign in. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return <main className="auth-page"><div className="auth-page__brand"><BrandLockup /></div><div className="auth-card"><span className="eyebrow">WELCOME BACK</span><h1>Come on in.</h1><p className="auth-card__intro">Your people and their stories are right here.</p><form className="form-stack" onSubmit={submit}><Input label="Mobile number" type="tel" autoComplete="username" placeholder="Enter your mobile number" value={mobile} onChange={(event) => setMobile(event.target.value)} required /><Input label="Password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} showPasswordToggle required />{error && <p className="field__error" role="alert">{error}</p>}<p className="micro-note auth-card__forgot" role="note">Password recovery is unavailable for mobile-only accounts.</p><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Continue'} {!isSubmitting && <ArrowRight size={17} />}</Button></form><div className="auth-card__divider"><span>NEW TO THE COMMUNITY?</span></div><p className="micro-note" role="note">Create your account with your mobile number and password.</p><Button to="/signup" variant="outline" className="button--full">Create account</Button></div></main>
}

export function SignupPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (session) navigate('/home', { replace: true })
  }, [navigate, session])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const normalizedPhone = normalizeMobileNumber(mobile)
    if (!normalizedPhone) {
      setError('Enter a valid mobile number.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    const authEmail = mobileAuthEmail(normalizedPhone)
    setIsSubmitting(true)

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: authEmail,
        password,
        options: {
          data: {
            display_name: 'Banjara member',
          },
        },
      })

      if (authError) {
        setError(userFacingError(authError, 'Could not create your account. Please try again.'))
        return
      }

      if (!data.user) {
        setError('Could not create your account. Please try again.')
        return
      }

      if (data.session) {
        const username = `member-${data.user.id.slice(0, 8)}`
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: data.user.id,
          username,
          display_name: 'Banjara member',
        }, { onConflict: 'id' })

        if (profileError) {
          setError(userFacingError(profileError, 'Account created, but your profile could not be prepared. Please sign in again.'))
          return
        }

        navigate('/home', { replace: true })
        return
      }

      setError('Account created. Please complete the verification step before signing in.')
    } catch (caught) {
      setError(userFacingError(caught, 'Could not create your account. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return <main className="auth-page"><div className="auth-page__brand"><BrandLockup /></div><div className="auth-card"><span className="eyebrow">JOIN THE COMMUNITY</span><h1>Create your account.</h1><p className="auth-card__intro">Use your mobile number and choose a password to join Banjara Connect.</p><form className="form-stack" onSubmit={submit}><Input label="Mobile number" type="tel" autoComplete="tel" placeholder="Enter your mobile number" value={mobile} onChange={(event) => setMobile(event.target.value)} required /><Input label="Password" type="password" autoComplete="new-password" placeholder="Create a password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /><Input label="Confirm password" type="password" autoComplete="new-password" placeholder="Re-enter your password" minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />{error && <p className="field__error" role="alert">{error}</p>}<Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'} {!isSubmitting && <ArrowRight size={17} />}</Button></form><div className="auth-card__divider"><span>ALREADY A MEMBER?</span></div><Button to="/login" variant="outline" className="button--full">Back to sign in</Button></div></main>
}
