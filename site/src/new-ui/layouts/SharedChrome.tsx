import { useState, type ReactNode } from 'react'
import { Bell, ChevronDown, Globe2, HelpCircle, Menu, Moon, Search, Sun, X } from 'lucide-react'
import appIcon from '../assets/saturnws-app-icon.png'
import { useExperience } from '../app/ExperienceProvider'
import type { AppRoute, Navigate } from '../app/routes'
import { Button, IconButton } from '../components/ui/Button'
import { Dropdown, DropdownItem } from '../components/ui/Overlays'

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
  const Icon = theme === 'light' ? Sun : Moon
  return <Dropdown label={t('theme')} trigger={<span className="chrome-trigger"><Icon size={16} /><span>{theme === 'light' ? t('light') : t('dark')}</span><ChevronDown size={14} /></span>}><DropdownItem onClick={() => setTheme('light')}><Sun size={15} />{t('light')}</DropdownItem><DropdownItem onClick={() => setTheme('dark')}><Moon size={15} />{t('dark')}</DropdownItem></Dropdown>
}

export function Topbar({ title, breadcrumbs, onOpenMenu, admin = false }: { title: string; breadcrumbs?: ReactNode; onOpenMenu?: () => void; admin?: boolean }) {
  const { t } = useExperience()
  return <header className="workspace-topbar"><div className="workspace-topbar__identity">{onOpenMenu ? <IconButton className="workspace-topbar__menu" label={t('menu')} onClick={onOpenMenu}><Menu size={18} /></IconButton> : null}<div>{breadcrumbs}<strong>{title}</strong></div></div><div className="workspace-topbar__tools"><label className="topbar-search"><Search size={15} /><input aria-label={t('search')} placeholder={t('search')} /></label><IconButton label={t('notifications')}><Bell size={17} /></IconButton><IconButton label={t('support')}><HelpCircle size={17} /></IconButton><LocaleControl /><ThemeControl /><button type="button" className="account-trigger"><span>{admin ? 'A' : 'S'}</span><div><strong>{admin ? t('adminConsole') : t('account')}</strong><small>{admin ? 'admin@example.com' : 'user@example.com'}</small></div><ChevronDown size={14} /></button></div></header>
}

export function PublicHeader({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  const [open, setOpen] = useState(false)
  const links: { label: ReturnType<typeof t>; route: AppRoute }[] = [
    { label: t('product'), route: { surface: 'public', page: 'product' } },
    { label: t('pricing'), route: { surface: 'public', page: 'pricing' } },
    { label: t('downloads'), route: { surface: 'public', page: 'download' } },
    { label: t('faq'), route: { surface: 'public', page: 'faq' } },
    { label: t('contact'), route: { surface: 'public', page: 'contact' } },
  ]
  return <header className="public-header"><div className="container public-header__inner"><Brand onClick={() => navigate({ surface: 'public', page: 'home' })} /><nav className={open ? 'is-open' : ''}>{links.map((link) => <button type="button" key={link.label} onClick={() => { navigate(link.route); setOpen(false) }}>{link.label}</button>)}</nav><div className="public-header__actions"><LocaleControl /><ThemeControl /><Button variant="ghost" onClick={() => navigate({ surface: 'auth', page: 'signin' })}>{t('signIn')}</Button><Button variant="primary" onClick={() => navigate({ surface: 'auth', page: 'signup' })}>{t('getStarted')}</Button></div><IconButton className="public-header__menu" label={open ? t('close') : t('menu')} onClick={() => setOpen((value) => !value)}>{open ? <X size={19} /> : <Menu size={19} />}</IconButton></div></header>
}

export function PublicFooter({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  const columns = [
    { title: t('footerProduct'), links: [[t('product'), 'product'], [t('features'), 'features'], [t('pricing'), 'pricing'], [t('downloads'), 'download']] },
    { title: t('footerAccount'), links: [[t('signIn'), 'signin'], [t('signUp'), 'signup'], [t('subscription'), 'subscription'], [t('support'), 'support']] },
    { title: t('footerResources'), links: [[t('faq'), 'faq'], [t('contact'), 'contact']] },
    { title: t('footerLegal'), links: [[t('privacy'), 'privacy'], [t('terms'), 'terms'], [t('refund'), 'refund'], [t('acceptableUse'), 'acceptable-use']] },
  ] as const
  return <footer className="public-footer"><div className="container public-footer__grid"><div className="public-footer__brand"><Brand /><p>{t('heroBody')}</p></div>{columns.map((column) => <div key={column.title}><strong>{column.title}</strong>{column.links.map(([label, page]) => <button type="button" key={page} onClick={() => navigate({ surface: page === 'signin' || page === 'signup' ? 'auth' : 'public', page })}>{label}</button>)}</div>)}</div><div className="container public-footer__bottom"><span>© 2026 {t('brand')}. {t('rights')}</span><span>{t('windowsOnly')}</span></div></footer>
}
