import { useState } from 'react'
import { CheckCircle2, Clock3, CreditCard, TriangleAlert, XCircle } from 'lucide-react'
import { developmentMockAdapter } from '../../adapters/mockAdapter'
import { useExperience } from '../../app/ExperienceProvider'
import { Button } from '../../components/ui/Button'
import { Card, PageHeader, Stepper } from '../../components/ui/DataDisplay'
import { Alert, FullPageState } from '../../components/ui/Feedback'
import { FormField, Input } from '../../components/ui/FormControls'
import { PaymentMethodCard } from '../../components/ui/ProductCards'
import { mockPaymentMethods, mockPlans } from '../../data/mockData'
import { Brand, LocaleControl, ThemeControl, type Navigate } from '../../layouts/SharedChrome'

function CheckoutShell({ children, navigate }: { children: React.ReactNode; navigate: Navigate }) {
  const { t } = useExperience()
  return <div className="checkout-shell"><header><Brand onClick={() => navigate({ surface: 'public', page: 'home' })} /><div className="cluster"><LocaleControl /><ThemeControl /><Button variant="ghost" onClick={() => navigate({ surface: 'public', page: 'pricing' })}>{t('cancel')}</Button></div></header><main>{children}</main></div>
}

function Checkout({ navigate }: { navigate: Navigate }) {
  const { t } = useExperience()
  const [plan, setPlan] = useState('monthly')
  const [method, setMethod] = useState<string>(mockPaymentMethods[0].id)
  const [loading, setLoading] = useState(false)
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setLoading(true); await developmentMockAdapter.simulatePayment('pending'); navigate({ surface: 'checkout', page: 'status', state: 'pending' }) }
  return <CheckoutShell navigate={navigate}><div className="checkout-page"><PageHeader title={t('checkout')} description={t('demoOnly')} /><Stepper current={1} steps={[{ label: t('selectPlan') }, { label: t('billingInformation') }, { label: t('paymentPending') }]} /><div className="checkout-grid"><form className="stack" onSubmit={submit}><Card><div className="stack"><h2>{t('selectPlan')}</h2>{mockPlans.map((item) => <label className={`checkout-plan${plan === item.id ? ' is-selected' : ''}`} key={item.id}><input type="radio" name="plan" checked={plan === item.id} onChange={() => setPlan(item.id)} /><span><strong>{item.name}</strong><small>{item.description}</small></span><b>{t('priceUnavailable')}</b></label>)}</div></Card><Card><div className="stack"><h2>{t('billingInformation')}</h2><div className="form-grid"><FormField label={t('name')} htmlFor="billing-name"><Input id="billing-name" required /></FormField><FormField label={t('email')} htmlFor="billing-email"><Input id="billing-email" type="email" required /></FormField></div><FormField label={t('details')} htmlFor="billing-details"><Input id="billing-details" /></FormField></div></Card><Card><div className="stack"><h2>{t('paymentMethod')}</h2>{mockPaymentMethods.map((item) => <PaymentMethodCard key={item.id} name={item.name} description={item.description} selected={method === item.id} onSelect={() => setMethod(item.id)} />)}</div></Card><Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>{t('placeOrder')}</Button></form><aside><Card className="order-summary"><h2>{t('orderSummary')}</h2><dl><div><dt>{t('plan')}</dt><dd>{mockPlans.find((item) => item.id === plan)?.name}</dd></div><div><dt>{t('priceUnavailable')}</dt><dd>—</dd></div><div><dt>{t('promoCode')}</dt><dd>—</dd></div></dl><Alert title={t('demoOnly')} tone="warning">{t('pricingBody')}</Alert></Card></aside></div></div></CheckoutShell>
}

function CheckoutStatus({ state, navigate }: { state: string; navigate: Navigate }) {
  const { t } = useExperience()
  const config = {
    success: { icon: CheckCircle2, title: t('paymentSuccess'), body: t('accountOverviewBody') },
    failed: { icon: XCircle, title: t('paymentFailed'), body: t('systemBody') },
    cancelled: { icon: XCircle, title: t('paymentCancelled'), body: t('systemBody') },
    expired: { icon: TriangleAlert, title: t('paymentExpired'), body: t('systemBody') },
    pending: { icon: Clock3, title: t('paymentPending'), body: t('demoOnly') },
  }[state] ?? { icon: CreditCard, title: t('paymentPending'), body: t('demoOnly') }
  return <FullPageState icon={config.icon} title={config.title} body={config.body} primaryLabel={state === 'success' ? t('returnAccount') : t('retry')} onPrimary={() => navigate(state === 'success' ? { surface: 'portal', page: 'overview' } : { surface: 'checkout', page: 'checkout' })} secondaryLabel={t('back')} onSecondary={() => navigate({ surface: 'public', page: 'pricing' })} />
}

export function CheckoutPages({ page, state = 'pending', navigate }: { page: string; state?: string; navigate: Navigate }) {
  return page === 'checkout' ? <Checkout navigate={navigate} /> : <CheckoutStatus state={state} navigate={navigate} />
}
