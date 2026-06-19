import { useExperience } from './ExperienceProvider'
import type { PreviewRoute, Surface } from './previewRouter'

export function PreviewSwitcher({ route, navigate }: { route: PreviewRoute; navigate: (route: PreviewRoute) => void }) {
  const { t } = useExperience()
  const items: { surface: Surface; page: string; label: string }[] = [
    { surface: 'public', page: 'home', label: t('publicSite') },
    { surface: 'portal', page: 'overview', label: t('customerPortal') },
    { surface: 'admin', page: 'overview', label: t('adminConsole') },
    { surface: 'system', page: '404', label: t('systemStates') },
  ]
  return <nav className="preview-switcher" aria-label={t('preview')}>{items.map((item) => <button type="button" key={item.surface} className={route.surface === item.surface ? 'is-active' : ''} onClick={() => navigate(item)}>{item.label}</button>)}</nav>
}
