import { useState, type ReactNode } from 'react'
import { Bell, ChevronDown, Globe2, HelpCircle, LayoutDashboard, LogOut, Menu, Moon, Search, Settings, Sun, X } from 'lucide-react'
import appIcon from '../assets/saturnws-app-icon.png'
import { useAdapters } from '../adapters/AdapterProvider'
import { useExperience } from '../app/ExperienceProvider'
import { createAuthRoute, currentInternalLocation } from '../app/navigationIntent'
import type { AppRoute, Navigate } from '../app/routes'
import { Button, IconButton } from '../components/ui/Button'
import { Dropdown, DropdownItem } from '../components/ui/Overlays'
import { useAuthState } from '../hooks/useAuthState'

export type { Navigate } from '../app/routes'

export function Brand({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  const { t } = useExperience()
  return <button type="button" className={`brand${compact ? ' brand--compact' : ''}`} onClick={onClick}><img src={appIcon} alt="" /><span>{t('brand')}</span></button>
}

export function LocaleControl() {
  const { locale, setLocale, t } = useExperience()
  return <Dropdown label={t('language')} trigger={<span className="chrome-trigger"><Globe2 size={16} /><span>{locale === 'en' ? t('english') : t('arabic')}</span><ChevronDown size={14} /></span>}><DropdownItem onClick={() => setLocale('en')}>{t('english')}</DropdownItem><DropdownItem onClick={() => setLocale('ar')}>{t('arabic')}</DropdownItem></Dropdown>
}

export function ThemeControl() {
  const { theme, setTheme, t } = useExperience()
  return <div className="theme-toggle" role="group" aria-label={t('theme')}><button type="button" className={theme === 'light' ? 'is-active' : ''} aria-pressed={theme === 'light'} title={t('light')} onClick={() => setTheme('light')}><Sun size={15} /><span className="sr-only">{t('light')}</span></button><button type="button" className={theme === 'dark' ? 'is-active' : ''} aria-pressed={theme === 'dark'} title={t('dark')} onClick={() => setTheme('dark')}><Moon size={15} /><span className="sr-only">{t('dark')}</span></button></div>
}

export function Topbar({ title, breadcrumbs, onOpenMenu, navigate, admin = false }: { title: string; breadcrumbs?: ReactNode; onOpenMenu?: () => void; navigate: Navigate; admin?: boolean }) {
  const { t } = useExperience()
  const { auth } = useAdapters()
  const { user } = useAuthState()
  const email = user?.email || ''
  const initial = email.slice(0, 1).toUpperCase() || (admin ? 'A' : 'S')
  return <header className="workspace-topbar"><div className="workspace-topbar__identity">{onOpenMenu ? <IconButton className="workspace-topbar__menu" label={t('menu')} onClick={onOpenMenu}><Menu size={18} /></IconButton> : null}<div>{breadcrumbs}<strong>{title}</strong></div></div><div className="workspace-topbar__tools"><label className="topbar-search"><Search size={15} /><input aria-label={t('search')} placeholder={t('search')} /></label><IconButton label={t('notifications')} onClick={() => !admin && navigate({ surface: 'portal', page: 'notifications' })}><Bell size={17} /></IconButton><IconButton label={t('support')} onClick={() => navigate({ surface: admin ? 'admin' : 'portal', page: 'support' })}><HelpCircle size={17} /></IconButton><LocaleControl /><ThemeControl /><Dropdown label={t('account')} trigger={<span className="account-trigger"><span>{initial}</span><div><strong>{user?.displayName || (admin ? t('adminConsole') : t('account'))}</strong><small>{email}</small></div><ChevronDown size={14} /></span>}><DropdownItem onClick={() => navigate({ surface: admin ? 'admin' : 'portal', page: 'overview' })}><LayoutDashboard size={15} />{admin ? t('adminConsole') : t('account')}</DropdownItem><DropdownItem onClick={() => { void auth.signOut().finally(() => navigate({ surface: 'public', page: 'home' })) }}><LogOut size={15} />{t('signOut')}</DropdownItem></Dropdown></div></header>
}

export function PublicHeader({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  const { auth } = useAdapters()
  const { ready, user } = useAuthState()
  const [open, setOpen] = useState(false)
  const links: { label: ReturnType<typeof t>; route: AppRoute }[] = [
    { label: t('product'), route: { surface: 'public', page: 'product' } },
    { label: t('pricing'), route: { surface: 'public', page: 'pricing' } },
    { label: t('downloads'), route: { surface: 'public', page: 'download' } },
    { label: t('faq'), route: { surface: 'public', page: 'faq' } },
    { label: t('contact'), route: { surface: 'public', page: 'contact' } },
  ]
  const returnTo = currentInternalLocation()
  return <header className="public-header"><div className="container public-header__inner"><Brand onClick={() => navigate({ surface: 'public', page: 'home' })} /><nav className={open ? 'is-open' : ''}>{links.map((link) => <button type="button" key={link.label} onClick={() => { navigate(link.route); setOpen(false) }}>{link.label}</button>)}</nav><div className="public-header__actions"><LocaleControl /><ThemeControl />{ready && user ? <><Button variant="ghost" onClick={() => navigate({ surface: 'portal', page: 'overview' })}>{t('account')}</Button><Dropdown label={t('account')} trigger={<span className="public-account-trigger"><span>{user.email.slice(0, 1).toUpperCase()}</span><ChevronDown size={14} /></span>}><DropdownItem onClick={() => navigate({ surface: 'portal', page: 'settings' })}><Settings size={15} />{t('settings')}</DropdownItem><DropdownItem onClick={() => { void auth.signOut().finally(() => navigate({ surface: 'public', page: 'home' })) }}><LogOut size={15} />{t('signOut')}</DropdownItem></Dropdown></> : <><Button variant="ghost" disabled={!ready} onClick={() => navigate(createAuthRoute('signin', { returnTo }))}>{t('signIn')}</Button><Button variant="primary" disabled={!ready} onClick={() => navigate(createAuthRoute('signup', { returnTo }))}>{t('getStarted')}</Button></>}</div><IconButton className="public-header__menu" label={open ? t('close') : t('menu')} onClick={() => setOpen((value) => !value)}>{open ? <X size={19} /> : <Menu size={19} />}</IconButton></div></header>
}

export function PublicFooter({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  const { ready, user } = useAuthState()
  const columns = [
    { title: t('footerProduct'), links: [[t('product'), 'product'], [t('features'), 'features'], [t('pricing'), 'pricing'], [t('downloads'), 'download']] },
    { title: t('footerAccount'), links: [[t('signIn'), 'signin'], [t('signUp'), 'signup'], [t('subscription'), 'subscription'], [t('support'), 'support']] },
    { title: t('footerResources'), links: [[t('faq'), 'faq'], [t('contact'), 'contact']] },
    { title: t('footerLegal'), links: [[t('privacy'), 'privacy'], [t('terms'), 'terms'], [t('refund'), 'refund'], [t('acceptableUse'), 'acceptable-use']] },
  ] as const
  const footerRoute = (page: string): AppRoute => {
    if (page === 'signin' || page === 'signup') return createAuthRoute(page, { returnTo: currentInternalLocation() })
    if (page === 'subscription') return ready && user ? { surface: 'portal', page } : createAuthRoute('signin', { returnTo: '/account/subscription' })
    if (page === 'support') return ready && user ? { surface: 'portal', page } : createAuthRoute('signin', { returnTo: '/account/support' })
    return { surface: 'public', page }
  }
  return <footer className="public-footer"><div className="container public-footer__grid"><div className="public-footer__brand"><Brand onClick={() => navigate({ surface: 'public', page: 'home' })} /><p>{t('heroBody')}</p></div>{columns.map((column) => <div key={column.title}><strong>{column.title}</strong>{column.links.map(([label, page]) => <button type="button" key={page} onClick={() => navigate(footerRoute(page))}>{label}</button>)}</div>)}</div><div className="container public-footer__bottom"><span>© 2026 {t('brand')}. {t('rights')}</span><span>{t('windowsOnly')}</span></div></footer>
}
