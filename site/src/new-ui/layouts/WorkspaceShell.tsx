import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useExperience } from '../app/ExperienceProvider'
import type { AppRoute, Surface } from '../app/routes'
import { Brand, PublicFooter, PublicHeader, Topbar, type Navigate } from './SharedChrome'

export type NavigationGroup = { label?: string; items: { id: string; label: string; icon: LucideIcon; badge?: string; disabled?: boolean }[] }

export function WorkspaceShell({ surface, page, title, groups, navigate, children, admin = false }: { surface: Extract<Surface, 'portal' | 'admin'>; page: string; title: string; groups: NavigationGroup[]; navigate: Navigate; children: ReactNode; admin?: boolean }) {
  const { t, locale } = useExperience()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const nextRoute = (id: string): AppRoute => ({ surface, page: id })
  return <div className={`workspace-shell${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}><aside className="workspace-sidebar"><Brand compact={collapsed} onClick={() => navigate(nextRoute('overview'))} /><div className="workspace-sidebar__nav">{groups.map((group, index) => <nav key={`${group.label}-${index}`}>{group.label && !collapsed ? <span>{group.label}</span> : null}{group.items.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={page === item.id ? 'is-active' : ''} disabled={item.disabled} title={collapsed ? item.label : undefined} onClick={() => { navigate(nextRoute(item.id)); setMobileOpen(false) }}><Icon size={17} /><span>{item.label}</span>{item.badge && !collapsed ? <em>{item.badge}</em> : null}</button> })}</nav>)}</div><button type="button" className="workspace-sidebar__collapse" onClick={() => setCollapsed((value) => !value)}>{locale === 'ar' ? (collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />) : (collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />)}<span>{collapsed ? t('expand') : t('collapse')}</span></button></aside><div className="workspace-main"><Topbar title={title} admin={admin} onOpenMenu={() => setMobileOpen(true)} /><main className="workspace-content page-enter">{children}</main></div>{mobileOpen ? <button type="button" aria-label={t('close')} className="workspace-scrim" onClick={() => setMobileOpen(false)} /> : null}</div>
}

export function PublicLayout({ navigate, children }: { navigate: Navigate; children: ReactNode }) {
  return <div className="public-shell"><PublicHeader navigate={navigate} /><main>{children}</main><PublicFooter navigate={navigate} /></div>
}
