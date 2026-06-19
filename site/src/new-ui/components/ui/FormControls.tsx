import { useRef, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Check, ChevronDown, Eye, EyeOff, Search, X } from 'lucide-react'
import { IconButton } from './Button'
import { useExperience } from '../../app/ExperienceProvider'

export function FormField({ label, htmlFor, helper, error, required, children }: { label: string; htmlFor?: string; helper?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className={`ui-field${error ? ' ui-field--error' : ''}`}>
      <label className="ui-field__label" htmlFor={htmlFor}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
      {children}
      {error ? <p className="ui-field__error">{error}</p> : helper ? <p className="ui-field__helper">{helper}</p> : null}
    </div>
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`} {...props} />
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false)
  const { t } = useExperience()
  return (
    <div className="ui-input-shell">
      <input className="ui-input" {...props} type={visible ? 'text' : 'password'} />
      <IconButton label={visible ? t('hidePassword') : t('showPassword')} size="sm" type="button" onClick={() => setVisible((value) => !value)}>
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </IconButton>
    </div>
  )
}

export function SearchInput({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="ui-input-shell ui-search">
      <Search size={16} aria-hidden="true" />
      <input aria-label={label} className="ui-input" type="search" {...props} />
    </div>
  )
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`ui-input ui-textarea ${className}`} {...props} />
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="ui-select-shell">
      <select className={`ui-input ui-select ${className}`} {...props}>{children}</select>
      <ChevronDown size={15} aria-hidden="true" />
    </div>
  )
}

export function MultiSelect({ label, options, values, onChange }: { label: string; options: { value: string; label: string; disabled?: boolean }[]; values: string[]; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const selectedLabels = options.filter((option) => values.includes(option.value)).map((option) => option.label)
  return (
    <div className="ui-multi-select">
      <button type="button" className="ui-input ui-multi-select__trigger" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="truncate">{selectedLabels.length ? selectedLabels.join(', ') : label}</span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="ui-popover ui-multi-select__menu">
          {options.map((option) => {
            const checked = values.includes(option.value)
            return (
              <button key={option.value} type="button" className="ui-option" disabled={option.disabled} onClick={() => onChange(checked ? values.filter((value) => value !== option.value) : [...values, option.value])}>
                <span className={`ui-checkmark${checked ? ' is-checked' : ''}`}>{checked ? <Check size={13} /> : null}</span>
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="ui-check"><input type="checkbox" {...props} /><span className="ui-check__box"><Check size={12} /></span><span>{label}</span></label>
}

export function Radio({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="ui-radio"><input type="radio" {...props} /><span className="ui-radio__dot" /><span>{label}</span></label>
}

export function Switch({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`ui-switch-row${disabled ? ' is-disabled' : ''}`}>
      <span><strong>{label}</strong>{description ? <small>{description}</small> : null}</span>
      <input className="sr-only" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span className={`ui-switch${checked ? ' is-on' : ''}`}><span /></span>
    </label>
  )
}

export function OTPInput({ value, onChange, length = 6, label }: { value: string; onChange: (value: string) => void; length?: number; label: string }) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const chars = Array.from({ length }, (_, index) => value[index] || '')

  const update = (index: number, next: string) => {
    const digit = next.replace(/\D/g, '').slice(-1)
    const values = [...chars]
    values[index] = digit
    onChange(values.join('').slice(0, length))
    if (digit && index < length - 1) refs.current[index + 1]?.focus()
  }

  const paste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!digits) return
    event.preventDefault()
    onChange(digits)
    refs.current[Math.min(digits.length, length) - 1]?.focus()
  }

  return (
    <div className="ui-otp" role="group" aria-label={label} dir="ltr">
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(element) => { refs.current[index] = element }}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={char}
          aria-label={`${label} ${index + 1}`}
          onChange={(event: ChangeEvent<HTMLInputElement>) => update(index, event.target.value)}
          onPaste={paste}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !char && index > 0) refs.current[index - 1]?.focus()
            if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus()
            if (event.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus()
          }}
        />
      ))}
    </div>
  )
}

export function SelectedToken({ children, onRemove, label }: { children: ReactNode; onRemove: () => void; label: string }) {
  return <span className="ui-token">{children}<button type="button" aria-label={label} onClick={onRemove}><X size={12} /></button></span>
}
