import { Check, CreditCard, LockKeyhole, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAdapters } from '../adapters/AdapterProvider'
import type { AppUser, PlanInfo } from '../adapters/contracts'
import { useExperience } from '../app/ExperienceProvider'
import { Button } from './ui/Button'
import { Alert, Badge } from './ui/Feedback'
import { Modal } from './ui/Overlays'
import { PaymentMethodCard } from './ui/ProductCards'

type CheckoutDialogProps = {
  open: boolean
  plan: PlanInfo | null
  user: AppUser | null
  features: string[]
  onClose: () => void
}

export function CheckoutDialog({ open, plan, user, features, onClose }: CheckoutDialogProps) {
  const { locale, t } = useExperience()
  const { payments } = useAdapters()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const checkoutAvailable = Boolean(plan && user && plan.enabled && plan.checkoutEnabled && payments.isCheckoutEnabled())
  const hasTrial = Boolean(plan?.trialDays)
  const paymentDescription = checkoutAvailable
    ? (locale === 'ar' ? 'سيتم تحويلك إلى صفحة دفع آمنة لإكمال الاشتراك.' : 'You will continue to a secure hosted checkout to complete the subscription.')
    : (locale === 'ar' ? 'الدفع الإلكتروني لهذه الخطة غير متاح حاليًا.' : 'Online checkout for this plan is not available yet.')
  const title = locale === 'ar' ? 'إكمال الاشتراك' : 'Complete your subscription'
  const planLabel = useMemo(() => plan?.name || '', [plan])

  const handleClose = () => {
    setError('')
    setSubmitting(false)
    onClose()
  }

  const continueToCheckout = async () => {
    if (!plan || !user || !checkoutAvailable) return
    setSubmitting(true)
    setError('')
    try {
      const result = await payments.createIntent({ plan: plan.id, planVersion: plan.version, email: user.email, locale })
      if (!result.success || !result.hostedUrl) throw new Error(result.reason || 'checkout_unavailable')
      window.location.assign(result.hostedUrl)
    } catch {
      setError(locale === 'ar' ? 'تعذر بدء عملية الدفع الآن. حاول مرة أخرى بعد قليل.' : 'Checkout could not be started. Please try again shortly.')
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={title} description={locale === 'ar' ? 'راجع الخطة وطريقة الدفع قبل المتابعة.' : 'Review the plan and payment method before continuing.'} closeLabel={t('close')} size="lg">
      <div className="checkout-dialog-grid">
        <section className="checkout-payment-panel">
          <div className="checkout-section-heading">
            <span><CreditCard size={18} /></span>
            <div><h3>{t('paymentMethod')}</h3><p>{locale === 'ar' ? 'اختر الطريقة المتاحة لإكمال الطلب.' : 'Choose an available method to complete the order.'}</p></div>
          </div>
          <PaymentMethodCard
            name={locale === 'ar' ? 'الدفع الإلكتروني الآمن' : 'Secure online payment'}
            description={paymentDescription}
            status={checkoutAvailable ? (locale === 'ar' ? 'متاح' : 'Available') : (locale === 'ar' ? 'قريبًا' : 'Coming soon')}
            selected={checkoutAvailable}
            disabled={!checkoutAvailable}
            onSelect={() => undefined}
          />
          {error ? <Alert title={t('failed')} tone="danger">{error}</Alert> : null}
          {!checkoutAvailable ? <Alert title={locale === 'ar' ? 'الدفع غير مفعّل' : 'Checkout unavailable'} tone="info">{locale === 'ar' ? 'تفاصيل الخطة ظاهرة الآن، وسيصبح زر المتابعة متاحًا عند تفعيل وسيلة الدفع لهذه الخطة.' : 'Plan details are visible now. Continue will become available when checkout is enabled for this plan.'}</Alert> : null}
          <Button variant="primary" size="lg" fullWidth disabled={!checkoutAvailable} loading={submitting} onClick={() => void continueToCheckout()}>{locale === 'ar' ? 'المتابعة إلى الدفع' : 'Continue to checkout'}</Button>
          <div className="checkout-trust"><span><LockKeyhole size={14} />{locale === 'ar' ? 'دفع آمن' : 'Secure checkout'}</span><span><Check size={14} />{locale === 'ar' ? 'يتفعّل الوصول بعد تأكيد العملية' : 'Access follows payment confirmation'}</span></div>
        </section>
        <aside className="checkout-summary-panel">
          <div className="checkout-summary-panel__head"><span>{t('orderSummary')}</span>{plan?.id === 'monthly' ? <Badge tone="info">{locale === 'ar' ? 'رائج' : 'Popular'}</Badge> : null}</div>
          <h3>{planLabel}</h3>
          <p>{plan?.description}</p>
          {hasTrial ? <div className="checkout-trial"><Sparkles size={17} /><div><strong>{locale === 'ar' ? `${plan?.trialDays} أيام مجانًا` : `${plan?.trialDays} days free`}</strong><small>{locale === 'ar' ? 'لن يتم تحصيل أي مبلغ خلال الفترة التجريبية.' : 'No charge is made during the trial period.'}</small></div></div> : null}
          <div className="checkout-price-row"><span>{locale === 'ar' ? 'الإجمالي' : 'Total'}</span><div>{plan?.originalPrice ? <del>{plan.originalPrice}</del> : null}<strong>{plan?.price}</strong><small>{plan?.period}</small></div></div>
          <ul>{features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul>
          <p className="checkout-delivery-note">{locale === 'ar' ? 'بعد إتمام العملية ستتمكن من إدارة اشتراكك وتنزيل Saturn Workspace من حسابك.' : 'After completion, you can manage your subscription and download Saturn Workspace from your account.'}</p>
        </aside>
      </div>
    </Modal>
  )
}
