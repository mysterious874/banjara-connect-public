import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { BrandLockup } from '../components/brand'
import { Button, Input } from '../components/ui'
import { useAuth } from '../hooks/AuthProvider'
import { supabase } from '../utils/supabase'
import { userFacingError } from '../utils/userFacingError'

export function SplashPage() {
  return (
    <main className="splash" aria-label="Connect intro">
      <div className="splash__pattern" aria-hidden="true" />
      <div className="splash__content">
        <div className="splash-logo-animation" aria-hidden="true">
          <span className="splash-logo-animation__piece splash-logo-animation__piece--top" />
          <span className="splash-logo-animation__piece splash-logo-animation__piece--right" />
          <span className="splash-logo-animation__piece splash-logo-animation__piece--bottom" />
          <span className="splash-logo-animation__piece splash-logo-animation__piece--left" />
          <span className="splash-logo-animation__center" />
        </div>
        <h1 className="splash__brand-name">Connect</h1>
        <span className="splash__line" />
        <p className="splash__quote">Where our people connect, share and grow together.</p>
        <span className="splash__loader" aria-hidden="true"><span /></span>
      </div>
    </main>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const [username, setUsername] = useState('')
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
    const normalizedUsername = username.trim()
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(normalizedUsername)) {
      setError('Enter your username (3–30 letters, numbers, underscores, or hyphens).')
      return
    }
    if (password.length < 6) {
      setError('Enter your password.')
      return
    }

    setIsSubmitting(true)
    try {
      const { data, error: functionError } = await supabase.functions.invoke('username-auth', {
        body: { mode: 'login', username: normalizedUsername, password },
      })
      if (functionError) throw functionError
      if (data?.error || !data?.session?.access_token || !data?.session?.refresh_token) {
        setError(data?.error || 'Unable to sign in with those details.')
        return
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
      if (sessionError) {
        setError(userFacingError(sessionError, 'Could not start your session. Please try again.'))
        return
      }
      navigate(destination, { replace: true })
    } catch (authError) {
      setError(userFacingError(authError, 'Could not sign in. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return <main className="auth-page"><div className="auth-page__brand"><BrandLockup /></div><div className="auth-card"><span className="eyebrow">WELCOME BACK</span><h1>Come on in.</h1><p className="auth-card__intro">Sign in with the username on your Connect profile.</p><form className="form-stack" onSubmit={submit}><Input label="Username" type="text" autoComplete="username" placeholder="Enter your username" value={username} onChange={(event) => setUsername(event.target.value)} required /><Input label="Password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} showPasswordToggle required />{error && <p className="field__error" role="alert">{error}</p>}<p className="micro-note auth-card__forgot" role="note">Use the username you have set in your profile.</p><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Continue'} {!isSubmitting && <ArrowRight size={17} />}</Button></form><div className="auth-card__divider"><span>NEW TO THE COMMUNITY?</span></div><p className="micro-note" role="note">Create your Connect username and password.</p><Button to="/signup" variant="outline" className="button--full">Create account</Button></div></main>
}

export function SignupPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
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
    const normalizedUsername = username.trim()
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(normalizedUsername)) {
      setError('Username must be 3–30 characters using only letters, numbers, underscores, or hyphens.')
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

    setIsSubmitting(true)
    try {
      const { data, error: functionError } = await supabase.functions.invoke('username-auth', {
        body: { mode: 'signup', username: normalizedUsername, password },
      })

      // Supabase treats any non-2xx Edge Function response as functionError.
      // The username-auth function intentionally uses 409/400 for expected
      // signup validation, so read the JSON response before showing a generic error.
      if (functionError) {
        let serverMessage = ''
        try {
          const context = (functionError as { context?: Response }).context
          if (context) {
            const payload = await context.clone().json() as { error?: string }
            serverMessage = payload?.error ?? ''
          }
        } catch {
          // Keep the friendly fallback below if the response body is unavailable.
        }
        setError(serverMessage || userFacingError(functionError, 'Could not create your account. Please try again.'))
        return
      }

      if (data?.error || !data?.session?.access_token || !data?.session?.refresh_token) {
        setError(data?.error || 'Could not create your account. Please try again.')
        return
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
      if (sessionError) {
        setError(userFacingError(sessionError, 'Account created, but your session could not be started. Please sign in.'))
        return
      }
      navigate('/home', { replace: true })
    } catch (caught) {
      setError(userFacingError(caught, 'Could not create your account. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return <main className="auth-page"><div className="auth-page__brand"><BrandLockup /></div><div className="auth-card"><span className="eyebrow">JOIN THE COMMUNITY</span><h1>Create your account.</h1><p className="auth-card__intro">Choose a unique username and password for Connect.</p><form className="form-stack" onSubmit={submit}><Input label="Username" type="text" autoComplete="username" placeholder="Choose a username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={30} required /><span className="micro-note">3–30 characters · letters, numbers and underscores only</span><Input label="Password" type="password" autoComplete="new-password" placeholder="Create a password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required showPasswordToggle /><Input label="Confirm password" type="password" autoComplete="new-password" placeholder="Re-enter your password" minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required showPasswordToggle />{error && <p className="field__error" role="alert">{error}</p>}<Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'} {!isSubmitting && <ArrowRight size={17} />}</Button></form><div className="auth-card__divider"><span>ALREADY A MEMBER?</span></div><Button to="/login" variant="outline" className="button--full">Back to sign in</Button></div></main>
}

