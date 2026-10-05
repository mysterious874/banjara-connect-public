import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Info, LoaderCircle, X } from 'lucide-react'

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
}

export function Input({ label, error, id, className = '', ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <label className="field" htmlFor={inputId}>
      {label && <span className="field__label">{label}</span>}
      <input id={inputId} className={`field__control${error ? ' field__control--error' : ''}${className ? ` ${className}` : ''}`} aria-invalid={Boolean(error)} {...props} />
      {error && <span className="field__error">{error}</span>}
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
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item) => <button key={item} type="button" className={`tabs__item${value === item ? ' is-active' : ''}`} role="tab" aria-selected={value === item} onClick={() => onChange(item)}>{item}</button>)}
    </div>
  )
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal__head"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>{children}</section></div>
}

export function BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="bottom-sheet" role="dialog" aria-modal="true" aria-label={title}><div className="bottom-sheet__handle" /><div className="modal__head"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Close sheet"><X size={18} /></button></div>{children}</section></div>
}

export function ConfirmationDialog({ open, title, description, confirmLabel = 'Confirm', onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  return <Modal open={open} title={title} onClose={onClose}><div className="dialog-copy"><p>{description}</p><div className="dialog-copy__actions"><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={onConfirm}><Check size={16} />{confirmLabel}</Button></div></div></Modal>
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null
  return <div className="toast" role="status"><Info size={17} /><span>{message}</span><button type="button" className="toast__close" onClick={onClose} aria-label="Dismiss notification"><X size={16} /></button></div>
}
