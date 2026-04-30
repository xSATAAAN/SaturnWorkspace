import { useMemo, useState } from 'react'
import { buildTelegramDeepLink } from '../../lib/telegram'
import { Reveal } from '../Reveal'

type FeedbackProps = {
  telegramUsername: string
  lang: 'en' | 'ar'
}

export function Feedback({ telegramUsername, lang }: FeedbackProps) {
  const isAr = lang === 'ar'
  const t = isAr
    ? {
        tag: 'الدعم',
        title: 'سجل اقتراحك أو مشكلتك',
        desc: 'وصول مباشر للفريق ومتابعة فعلية.',
        type: 'النوع',
        suggestion: 'اقتراح ميزة',
        issue: 'الإبلاغ عن مشكلة',
        contact: 'وسيلة التواصل',
        contactPlaceholder: '@username أو email',
        details: 'التفاصيل',
        detailsPlaceholder: 'اكتب تفاصيل المشكلة أو الاقتراح...',
        send: 'إرسال للدعم',
        reset: 'إعادة تعيين',
        notProvided: 'غير متوفر',
        msgTitleSuggestion: 'اقتراح ميزة',
        msgTitleIssue: 'الإبلاغ عن مشكلة',
      }
    : {
        tag: 'FEEDBACK',
        title: 'Suggest feature or report issue',
        desc: 'Real channel, direct follow-up. Send us what blocks your workflow and what you want next.',
        type: 'Type',
        suggestion: 'Feature suggestion',
        issue: 'Issue report',
        contact: 'Contact (Telegram/Email)',
        contactPlaceholder: '@username or email',
        details: 'Details',
        detailsPlaceholder: 'Write your suggestion or the problem details...',
        send: 'Send to support',
        reset: 'Reset',
        notProvided: 'Not provided',
        msgTitleSuggestion: 'Feature Suggestion',
        msgTitleIssue: 'Issue Report',
      }
  const [kind, setKind] = useState<'suggestion' | 'issue'>('suggestion')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')

  const ready = message.trim().length >= 8

  const href = useMemo(() => {
    const lines = [
      `SATAN Toolkit - ${kind === 'issue' ? t.msgTitleIssue : t.msgTitleSuggestion}`,
      `Contact: ${contact.trim() || t.notProvided}`,
      '---',
      message.trim() || '(empty)',
    ]
    return buildTelegramDeepLink({
      telegramUsername,
      message: lines.join('\n'),
    })
  }, [telegramUsername, kind, contact, message, t.msgTitleIssue, t.msgTitleSuggestion, t.notProvided])

  return (
    <section id="feedback" className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-sky-300/90">{t.tag}</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">{t.title}</h2>
            <p className="mt-4 text-pretty text-white/65">
              {t.desc}
            </p>
          </div>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="mx-auto mt-10 max-w-3xl rounded-[var(--radius)] border border-sky-700/35 bg-[rgba(11,18,32,.72)] p-6 backdrop-blur">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-white/70">{t.type}</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as 'suggestion' | 'issue')}
                  className="h-11 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white outline-none focus:border-sky-500/40"
                >
                  <option value="suggestion">{t.suggestion}</option>
                  <option value="issue">{t.issue}</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-white/70">{t.contact}</span>
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={t.contactPlaceholder}
                  className="h-11 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-sky-500/40"
                />
              </label>
            </div>

            <label className="mt-4 grid gap-1">
              <span className="text-xs font-semibold text-white/70">{t.details}</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder={t.detailsPlaceholder}
                className="resize-none rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-sky-500/40"
              />
            </label>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <a
                href={ready ? href : '#feedback'}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex flex-1 items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${
                  ready
                    ? 'bg-gradient-to-b from-sky-500 to-blue-700 shadow-[0_16px_44px_rgba(56,189,248,.18)] hover:brightness-110'
                    : 'cursor-not-allowed border border-white/12 bg-white/5 text-white/55'
                }`}
              >
                {t.send}
              </a>
              <button
                type="button"
                onClick={() => {
                  setKind('suggestion')
                  setContact('')
                  setMessage('')
                }}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8"
              >
                {t.reset}
              </button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

