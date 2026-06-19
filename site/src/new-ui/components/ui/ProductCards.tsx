import type { ReactNode } from 'react'
import { Check, Download, ExternalLink, MessageCircle } from 'lucide-react'
import { Button } from './Button'
import { Badge } from './Feedback'
import { Card } from './DataDisplay'
import { useExperience } from '../../app/ExperienceProvider'

export function FeatureCard({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return <article className="product-feature"><span className="product-feature__icon">{icon}</span><h3>{title}</h3><p>{body}</p>{children}</article>
}

export function PricingCard({ name, description, price, originalPrice, period, features, cta, featured, disabled, featuredLabel, onClick }: { name: string; description: string; price: string; originalPrice?: string; period?: string; features: string[]; cta: string; featured?: boolean; disabled?: boolean; featuredLabel?: string; onClick?: () => void }) {
  return <Card className={`pricing-card${featured ? ' is-featured' : ''}`}><div className="pricing-card__head"><h3>{name}</h3>{featured && featuredLabel ? <Badge tone="info">{featuredLabel}</Badge> : null}</div><p>{description}</p><div className="pricing-card__price">{originalPrice ? <del>{originalPrice}</del> : null}<strong>{price}</strong>{period ? <span>{period}</span> : null}</div><ul>{features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul><Button variant={featured ? 'primary' : 'secondary'} fullWidth disabled={disabled} onClick={onClick}>{cta}</Button></Card>
}

export function DownloadCard({ title, version, meta, buttonLabel, disabled, onClick }: { title: string; version: string; meta: string[]; buttonLabel: string; disabled?: boolean; onClick?: () => void }) {
  return <Card className="download-card"><div><span className="download-card__mark"><Download size={21} /></span><h3>{title}</h3><strong>{version}</strong><div className="cluster muted">{meta.map((item) => <span key={item}>{item}</span>)}</div></div><Button variant="primary" leadingIcon={<Download size={16} />} disabled={disabled} onClick={onClick}>{buttonLabel}</Button></Card>
}

export function ReleaseCard({ version, channel, status, date, notesLabel }: { version: string; channel: string; status: string; date: string; notesLabel: string }) {
  return <article className="release-row"><div><strong>{version}</strong><div className="cluster"><Badge>{channel}</Badge><Badge tone="success">{status}</Badge></div></div><span className="muted">{date}</span><Button variant="text" trailingIcon={<ExternalLink size={14} />}>{notesLabel}</Button></article>
}

export function SubscriptionCard({ title, status, details, action }: { title: string; status: string; details: { label: string; value: string }[]; action?: ReactNode }) {
  return <Card className="subscription-card"><header className="split"><div><span className="muted">{title}</span><h3>{status}</h3></div><Badge tone="success">{status}</Badge></header><dl>{details.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>{action}</Card>
}

export function SupportTicketCard({ subject, status, updated, onOpen }: { subject: string; status: string; updated: string; onOpen?: () => void }) {
  const { t } = useExperience()
  return <Card padding="sm" className="support-ticket"><MessageCircle size={18} /><div><strong>{subject}</strong><span className="muted">{updated}</span></div><Badge tone="info">{status}</Badge><Button variant="text" onClick={onOpen}>{t('open')}</Button></Card>
}

export function PaymentMethodCard({ name, description, selected, onSelect }: { name: string; description: string; selected: boolean; onSelect: () => void }) {
  return <button type="button" className={`payment-method${selected ? ' is-selected' : ''}`} onClick={onSelect}><span className="payment-method__radio">{selected ? <span /> : null}</span><span><strong>{name}</strong><small>{description}</small></span></button>
}
