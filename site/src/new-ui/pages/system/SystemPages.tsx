import { AlertTriangle, CheckCircle2, Clock3, CloudOff, LoaderCircle, LockKeyhole, ShieldX } from 'lucide-react'
import { useExperience } from '../../app/ExperienceProvider'
import { FullPageState } from '../../components/ui/Feedback'
import type { Navigate } from '../../layouts/SharedChrome'

export function SystemPages({ page, navigate }: { page: string; navigate: Navigate }) {
  const { t } = useExperience()
  const common = { body: t('systemBody'), primaryLabel: t('retry'), onPrimary: () => navigate({ surface: 'public', page: 'home' }), secondaryLabel: t('back'), onSecondary: () => window.history.back() }
  if (page === '403') return <FullPageState icon={LockKeyhole} title={t('system403')} {...common} />
  if (page === '500') return <FullPageState icon={AlertTriangle} title={t('system500')} {...common} />
  if (page === '503' || page === 'server') return <FullPageState icon={CloudOff} title={t('system503')} {...common} />
  if (page === 'maintenance') return <FullPageState icon={Clock3} title={t('maintenance')} {...common} />
  if (page === 'loading') return <FullPageState icon={LoaderCircle} title={t('loading')} body={t('accountOverviewBody')} primaryLabel={t('continue')} onPrimary={() => navigate({ surface: 'portal', page: 'overview' })} />
  if (page === 'invite') return <FullPageState icon={ShieldX} title={t('decisionRequired')} body={t('systemBody')} primaryLabel={t('back')} onPrimary={() => navigate({ surface: 'public', page: 'home' })} />
  if (page === 'update-success') return <FullPageState icon={CheckCircle2} title={t('success')} body={t('managedUpdates')} primaryLabel={t('continue')} onPrimary={() => navigate({ surface: 'portal', page: 'overview' })} />
  return <FullPageState icon={AlertTriangle} title={t('system404')} {...common} />
}
