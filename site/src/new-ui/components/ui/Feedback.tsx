import { AlertCircle, CheckCircle2, Info, LoaderCircle, TriangleAlert, XCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const toneIcons: Record<Exclude<Tone, 'neutral'>, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: XCircle,
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>
}

export function Alert({ title, children, tone = 'info', action }: { title: string; children?: ReactNode; tone?: Exclude<Tone, 'neutral'>; action?: ReactNode }) {
  const Icon = toneIcons[tone]
  return <div className={`ui-alert ui-alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}><Icon size={18} /><div><strong>{title}</strong>{children ? <div>{children}</div> : null}</div>{action ? <div className="ui-alert__action">{action}</div> : null}</div>
}

export function Banner({ children, tone = 'neutral', action }: { children: ReactNode; tone?: Tone; action?: ReactNode }) {
  return <div className={`ui-banner ui-banner--${tone}`}><span>{children}</span>{action}</div>
}

export function InlineLoading({ label }: { label: string }) {
  return <span className="ui-inline-state"><LoaderCircle className="ui-spin" size={16} />{label}</span>
}

export function InlineError({ message }: { message: string }) {
  return <span className="ui-inline-state ui-inline-state--error"><AlertCircle size={16} />{message}</span>
}

export function EmptyState({ icon: Icon = Info, title, body, action }: { icon?: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return <div className="ui-empty"><span className="ui-empty__icon"><Icon size={22} /></span><h3>{title}</h3><p>{body}</p>{action}</div>
}

export function Skeleton({ width = '100%', height = 14 }: { width?: string; height?: number }) {
  return <span className="ui-skeleton" style={{ width, height }} aria-hidden="true" />
}

export function FullPageState({ icon: Icon = AlertCircle, title, body, primaryLabel, onPrimary, secondaryLabel, onSecondary }: { icon?: LucideIcon; title: string; body: string; primaryLabel: string; onPrimary: () => void; secondaryLabel?: string; onSecondary?: () => void }) {
  return (
    <main className="ui-full-state page-enter">
      <div className="ui-full-state__mark"><Icon size={32} /></div>
      <h1>{title}</h1>
      <p>{body}</p>
      <div className="cluster">
        <Button variant="primary" onClick={onPrimary}>{primaryLabel}</Button>
        {secondaryLabel && onSecondary ? <Button onClick={onSecondary}>{secondaryLabel}</Button> : null}
      </div>
    </main>
  )
}

export function Toast({ title, body, tone = 'success' }: { title: string; body?: string; tone?: Exclude<Tone, 'neutral'> }) {
  const Icon = toneIcons[tone]
  return <div className={`ui-toast ui-toast--${tone}`} role="status"><Icon size={17} /><div><strong>{title}</strong>{body ? <p>{body}</p> : null}</div></div>
}
