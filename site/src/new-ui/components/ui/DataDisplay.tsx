import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal, Search } from 'lucide-react'
import { IconButton } from './Button'
import { EmptyState, Skeleton } from './Feedback'
import { SearchInput, Select } from './FormControls'

export function Card({ children, className = '', padding = 'md' }: { children: ReactNode; className?: string; padding?: 'none' | 'sm' | 'md' | 'lg' }) {
  return <section className={`ui-card ui-card--${padding} ${className}`}>{children}</section>
}

export function StatCard({ label, value, detail, icon }: { label: ReactNode; value: ReactNode; detail?: string; icon?: ReactNode }) {
  return <Card padding="sm" className="ui-stat"><div className="ui-stat__top"><span>{label}</span>{icon}</div><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</Card>
}

export function PageHeader({ title, description, actions, breadcrumbs }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumbs?: ReactNode }) {
  return <header className="ui-page-header">{breadcrumbs}<div className="split"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className="cluster">{actions}</div> : null}</div></header>
}

export function SectionHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <header className="ui-section-header"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{action}</header>
}

export function Breadcrumbs({ items, label }: { items: { label: string; onClick?: () => void }[]; label: string }) {
  return <nav className="ui-breadcrumbs" aria-label={label}>{items.map((item, index) => <span key={`${item.label}-${index}`}>{index ? <ChevronRight size={13} /> : null}{item.onClick ? <button type="button" onClick={item.onClick}>{item.label}</button> : item.label}</span>)}</nav>
}

export type Column<T> = { key: string; header: string; width?: string; render: (row: T) => ReactNode }

export function DataTable<T>({ columns, rows, rowKey, emptyTitle, emptyBody, loading = false, onRowClick }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; emptyTitle: string; emptyBody: string; loading?: boolean; onRowClick?: (row: T) => void }) {
  if (!loading && rows.length === 0) return <EmptyState title={emptyTitle} body={emptyBody} />
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead><tr>{columns.map((column) => <th key={column.key} style={{ width: column.width }}>{column.header}</th>)}</tr></thead>
        <tbody>
          {loading ? Array.from({ length: 5 }, (_, index) => <tr key={index}>{columns.map((column) => <td key={column.key}><Skeleton width={column.width ? '80%' : '65%'} /></td>)}</tr>) : rows.map((row) => (
            <tr key={rowKey(row)} className={onRowClick ? 'is-clickable' : ''} onClick={() => onRowClick?.(row)}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TableToolbar({ searchLabel, searchValue, onSearch, filters, action }: { searchLabel: string; searchValue: string; onSearch: (value: string) => void; filters?: ReactNode; action?: ReactNode }) {
  return <div className="ui-table-toolbar"><SearchInput label={searchLabel} placeholder={searchLabel} value={searchValue} onChange={(event) => onSearch(event.target.value)} />{filters}<span className="ui-table-toolbar__spacer" />{action}</div>
}

export function Pagination({ page, pages, label, previousLabel, nextLabel, onChange }: { page: number; pages: number; label: string; previousLabel: string; nextLabel: string; onChange: (page: number) => void }) {
  return <div className="ui-pagination"><span>{label}</span><IconButton label={previousLabel} size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={15} /></IconButton><strong>{page}</strong><IconButton label={nextLabel} size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={15} /></IconButton></div>
}

export function ActionMenu({ label, children }: { label: string; children: ReactNode }) {
  return <details className="ui-action-menu"><summary><MoreHorizontal size={16} /><span className="sr-only">{label}</span></summary><div className="ui-popover ui-action-menu__content">{children}</div></details>
}

export function ActionMenuItem({ children, onClick, danger }: { children: ReactNode; onClick?: () => void; danger?: boolean }) {
  return <button type="button" className={danger ? 'is-danger' : ''} onClick={onClick}>{children}</button>
}

export function FilterSelect({ label, options }: { label: string; options: string[] }) {
  return <Select aria-label={label} defaultValue=""><option value="">{label}</option>{options.map((option) => <option key={option}>{option}</option>)}</Select>
}

export function Timeline({ items }: { items: { title: string; body?: string; time?: string; tone?: 'brand' | 'neutral' }[] }) {
  return <ol className="ui-timeline">{items.map((item, index) => <li key={`${item.title}-${index}`} className={item.tone === 'brand' ? 'is-brand' : ''}><span /><div><strong>{item.title}</strong>{item.body ? <p>{item.body}</p> : null}{item.time ? <small>{item.time}</small> : null}</div></li>)}</ol>
}

export function Stepper({ steps, current }: { steps: { label: string; description?: string }[]; current: number }) {
  return <ol className="ui-stepper">{steps.map((step, index) => <li key={step.label} className={index < current ? 'is-complete' : index === current ? 'is-current' : ''}><span>{index + 1}</span><div><strong>{step.label}</strong>{step.description ? <small>{step.description}</small> : null}</div></li>)}</ol>
}

export function CompactSearch({ label }: { label: string }) {
  return <label className="ui-compact-search"><Search size={15} /><input aria-label={label} placeholder={label} /></label>
}
