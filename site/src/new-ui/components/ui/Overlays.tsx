import { useEffect, useState, type ReactNode } from 'react'
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
  if (!open) return null
  return <div className="ui-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`ui-modal ui-modal--${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><h2 id="modal-title">{title}</h2>{description ? <p>{description}</p> : null}</div><IconButton label={closeLabel} onClick={onClose}><X size={18} /></IconButton></header><div className="ui-modal__body">{children}</div>{footer ? <footer>{footer}</footer> : null}</section></div>
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
  const [open, setOpen] = useState(false)
  return <div className="ui-dropdown"><button type="button" className="ui-dropdown__trigger" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)}>{trigger}</button>{open ? <div className="ui-popover ui-dropdown__menu" onClick={() => setOpen(false)}>{children}</div> : null}</div>
}

export function DropdownItem({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <button type="button" onClick={onClick}>{children}</button>
}
