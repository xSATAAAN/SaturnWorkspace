import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button, IconButton } from './Button'

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
}

export function Modal({ open, onClose, title, description, closeLabel, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; description?: string; closeLabel: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEscape(onClose)
  const dialogRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [open])
  if (!open) return null
  return <div className="ui-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section ref={dialogRef} className={`ui-modal ui-modal--${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={(event) => { if (event.key !== 'Tab') return; const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')); if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() } }}><header><div><h2 id="modal-title">{title}</h2>{description ? <p>{description}</p> : null}</div><IconButton label={closeLabel} onClick={onClose}><X size={18} /></IconButton></header><div className="ui-modal__body">{children}</div>{footer ? <footer>{footer}</footer> : null}</section></div>
}

export function Drawer({ open, onClose, title, description, closeLabel, children, footer }: { open: boolean; onClose: () => void; title: string; description?: string; closeLabel: string; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose)
  if (!open) return null
  return <div className="ui-overlay ui-overlay--drawer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside className="ui-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"><header><div><h2 id="drawer-title">{title}</h2>{description ? <p>{description}</p> : null}</div><IconButton label={closeLabel} onClick={onClose}><X size={18} /></IconButton></header><div className="ui-drawer__body">{children}</div>{footer ? <footer>{footer}</footer> : null}</aside></div>
}

export function ConfirmDialog({ open, onClose, title, body, confirmLabel, cancelLabel, onConfirm, destructive }: { open: boolean; onClose: () => void; title: string; body: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void; destructive?: boolean }) {
  return <Modal open={open} onClose={onClose} title={title} closeLabel={cancelLabel} size="sm" footer={<><Button onClick={onClose}>{cancelLabel}</Button><Button variant={destructive ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</Button></>}><p className="secondary">{body}</p></Modal>
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="ui-tooltip" data-tooltip={label}>{children}</span>
}

export function Dropdown({ label, trigger, children }: { label: string; trigger: ReactNode; children: ReactNode }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const openMenu = () => {
    document.dispatchEvent(new CustomEvent('saturnws:dropdown-open', { detail: id }))
    setOpen(true)
  }
  const closeMenu = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }
  useEffect(() => {
    const onOtherOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) setOpen(false)
    }
    document.addEventListener('saturnws:dropdown-open', onOtherOpen)
    return () => document.removeEventListener('saturnws:dropdown-open', onOtherOpen)
  }, [id])
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu(true)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
  const navigateMenu = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'))
    if (!items.length) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : (current <= 0 ? items.length - 1 : current - 1)
    items[next]?.focus()
  }
  return <div ref={rootRef} className="ui-dropdown"><button ref={triggerRef} type="button" className="ui-dropdown__trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openMenu() } }} onClick={() => open ? closeMenu() : openMenu()}>{trigger}</button>{open ? <div className="ui-popover ui-dropdown__menu" role="menu" onKeyDown={navigateMenu} onClick={() => closeMenu()}>{children}</div> : null}</div>
}

export function DropdownItem({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <button type="button" role="menuitem" tabIndex={-1} onClick={onClick}>{children}</button>
}
