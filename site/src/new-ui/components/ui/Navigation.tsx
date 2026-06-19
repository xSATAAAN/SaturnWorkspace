import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function Tabs({ items, active, onChange, ariaLabel }: { items: { id: string; label: string; icon?: ReactNode; disabled?: boolean }[]; active: string; onChange: (id: string) => void; ariaLabel: string }) {
  return <div className="ui-tabs" role="tablist" aria-label={ariaLabel}>{items.map((item) => <button key={item.id} role="tab" aria-selected={active === item.id} className={active === item.id ? 'is-active' : ''} disabled={item.disabled} onClick={() => onChange(item.id)}>{item.icon}{item.label}</button>)}</div>
}

export function Accordion({ items }: { items: { id: string; title: string; body: ReactNode }[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null)
  return <div className="ui-accordion">{items.map((item) => <section key={item.id}><button type="button" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}><span>{item.title}</span><ChevronDown size={17} /></button>{open === item.id ? <div>{item.body}</div> : null}</section>)}</div>
}

export function SegmentedControl({ items, value, onChange, ariaLabel }: { items: { value: string; label: string }[]; value: string; onChange: (value: string) => void; ariaLabel: string }) {
  return <div className="ui-segmented" role="group" aria-label={ariaLabel}>{items.map((item) => <button type="button" key={item.value} className={item.value === value ? 'is-active' : ''} aria-pressed={item.value === value} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>
}
