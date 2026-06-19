import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'text'
type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  fullWidth?: boolean
}

export function Button({ variant = 'secondary', size = 'md', loading, leadingIcon, trailingIcon, fullWidth, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`ui-button ui-button--${variant} ui-button--${size}${fullWidth ? ' ui-button--full' : ''} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="ui-spin" size={16} aria-hidden="true" /> : leadingIcon}
      <span>{children}</span>
      {trailingIcon}
    </button>
  )
}

export function IconButton({ label, variant = 'ghost', size = 'md', className = '', children, ...props }: Omit<ButtonProps, 'children'> & { label: string; children: ReactNode }) {
  return (
    <button className={`ui-icon-button ui-icon-button--${variant} ui-icon-button--${size} ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}
