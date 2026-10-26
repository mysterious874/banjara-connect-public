import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Eye, EyeOff, Info, LoaderCircle, X } from 'lucide-react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  to?: string
  variant?: 'primary' | 'outline' | 'quiet' | 'danger'
  iconOnly?: boolean
}

export function Button({ to, variant = 'primary', iconOnly = false, className = '', children, title, ['aria-label']: ariaLabel, ...props }: ButtonProps) {
  const classes = `button button--${variant}${iconOnly ? ' button--icon' : ''}${className ? ` ${className}` : ''}`
  if (to) {
    return <Link className={classes} to={to} title={title} aria-label={ariaLabel}>{children}</Link>
  }
  return <button className={classes} title={title} aria-label={ariaLabel} {...props}>{children}</button>
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  error?: string
  showPasswordToggle?: boolean
}

export function Input({ label, error, id, className = '', showPasswordToggle = false, ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const { ['aria-describedby']: existingDescribedBy, type, ...inputProps } = props
  const [showPassword, setShowPassword] = useState(false)
  const inputType = showPasswordToggle && type === 'password' ? (showPassword ? 'text' : 'password') : type
  const describedBy = [existingDescribedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
  return (
    <label className="field" htmlFor={inputId}>
      {label && <span className="field__label">{label}</span>}
      <span className={`field__control-wrap${showPasswordToggle && type === 'password' ? ' field__control-wrap--password' : ''}`}><input {...inputProps} type={inputType} id={inputId} className={`field__control${error ? ' field__control--error' : ''}${className ? ` ${className}` : ''}`} aria-invalid={Boolean(error)} aria-describedby={describedBy} />{showPasswordToggle && type === 'password' && <button type="button" className="field__password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>}</span>
      {error && <span id={errorId} className="field__error">{error}</span>}
    </label>
  )
}

export function Avatar({ name, initials, tone = 'green', size = 'medium', image }: { name: string; initials?: string; tone?: string; size?: 'small' | 'medium' | 'large'; image?: string }) {
  const shortName = initials ?? name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span className={`avatar avatar--${size} avatar--${tone}`} aria-label={name} role="img">
      {image ? <img src={image} alt="" /> : shortName}
    </span>
  )
}

export function Loading({ label = 'Loading preview' }: { label?: string }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), 180)
    return () => window.clearTimeout(timer)
  }, [])
  if (!show) return null
  return <div className="state-block" role="status"><LoaderCircle className="state-block__spinner" size={22} /><span>{label}</span></div>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="state-block state-block--empty"><span className="state-block__icon"><Info size={20} /></span><h3>{title}</h3><p>{description}</p>{action}</div>
}

export function ErrorState({ title = 'This preview did not load', description = 'The sample view is unavailable right now.' }: { title?: string; description?: string }) {
  return <div className="state-block state-block--error" role="alert"><span className="state-block__icon"><Info size={20} /></span><h3>{title}</h3><p>{description}</p></div>
}

export function Tabs({ items, value, onChange, label }: { items: string[]; value: string; onChange: (value: string) => void; label: string }) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {items.map((item) => <button key={item} type="button" className={`tabs__item${value === item ? ' is-active' : ''}`} aria-pressed={value === item} onClick={() => onChange(item)}>{item}</button>)}
    </div>
  )
}

function useDialogAccessibility(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const dialogElement = dialogRef.current
    if (!dialogElement) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    const getFocusable = () => Array.from(dialogElement.querySelectorAll<HTMLElement>(focusableSelector))
    const initialFocus = getFocusable()[0] ?? dialogElement
    initialFocus.focus({ preventScroll: true })

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = getFocusable()
      if (!focusable.length) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialogElement.addEventListener('keydown', handleKeyDown)
    return () => {
      dialogElement.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [open])

  return dialogRef
}



let bodyScrollLockCount = 0
let bodyScrollLockY = 0
let bodyScrollLockStyles: { bodyPosition: string; bodyTop: string; bodyWidth: string; bodyOverflow: string; htmlOverflow: string } | null = null

/** Lock the page behind an open overlay and restore its exact scroll position on close. */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return
    if (bodyScrollLockCount === 0) {
      bodyScrollLockY = window.scrollY
      bodyScrollLockStyles = {
        bodyPosition: document.body.style.position,
        bodyTop: document.body.style.top,
        bodyWidth: document.body.style.width,
        bodyOverflow: document.body.style.overflow,
        htmlOverflow: document.documentElement.style.overflow,
      }
      document.body.style.position = 'fixed'
      document.body.style.top = `-${bodyScrollLockY}px`
      document.body.style.width = '100%'
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    }
    bodyScrollLockCount += 1
    const isInsideOverlay = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('.modal, .bottom-sheet, .media-preview-dialog, .story-viewers-modal, .story-fullscreen__card, .chat-media-viewer, .chat-forward-modal'))
    const preventBackgroundScroll = (event: Event) => {
      if (!isInsideOverlay(event.target)) event.preventDefault()
    }
    document.addEventListener('touchmove', preventBackgroundScroll, { passive: false, capture: true })
    document.addEventListener('wheel', preventBackgroundScroll, { passive: false, capture: true })
    return () => {
      document.removeEventListener('touchmove', preventBackgroundScroll, true)
      document.removeEventListener('wheel', preventBackgroundScroll, true)
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1)
      if (bodyScrollLockCount !== 0 || !bodyScrollLockStyles) return
      const saved = bodyScrollLockStyles
      bodyScrollLockStyles = null
      document.body.style.position = saved.bodyPosition
      document.body.style.top = saved.bodyTop
      document.body.style.width = saved.bodyWidth
      document.body.style.overflow = saved.bodyOverflow
      document.documentElement.style.overflow = saved.htmlOverflow
      window.scrollTo(0, bodyScrollLockY)
    }
  }, [locked])
}

export function Modal({ open, title, onClose, children, className = '' }: { open: boolean; title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const dialogRef = useDialogAccessibility(open, onClose)
  useBodyScrollLock(open)
  const titleId = useId()
  if (!open) return null
  return <div className={`modal-backdrop${className ? ` modal-backdrop--${className}` : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section ref={dialogRef} className={`modal${className ? ` modal--${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className="modal__head"><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>{children}</section></div>
}

export function BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useDialogAccessibility(open, onClose)
  useBodyScrollLock(open)
  const titleId = useId()
  if (!open) return null
  return <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section ref={dialogRef} className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className="bottom-sheet__handle" /><div className="modal__head"><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Close sheet"><X size={18} /></button></div>{children}</section></div>
}

export function ConfirmationDialog({ open, title, description, confirmLabel = 'Confirm', onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  return <Modal open={open} title={title} onClose={onClose}><div className="dialog-copy"><p>{description}</p><div className="dialog-copy__actions"><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={onConfirm}><Check size={16} />{confirmLabel}</Button></div></div></Modal>
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null
  return <div className="toast" role="status"><Info size={17} /><span>{message}</span><button type="button" className="toast__close" onClick={onClose} aria-label="Dismiss notification"><X size={16} /></button></div>
}
