import { useMemo, useState } from 'react'
import { buildTelegramDeepLink } from '../../lib/telegram'
import { Reveal } from '../Reveal'

type FeedbackProps = {
  telegramUsername: string
}

export function Feedback({ telegramUsername }: FeedbackProps) {
  const [kind, setKind] = useState<'suggestion' | 'issue'>('suggestion')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')

  const ready = message.trim().length >= 8

  const href = useMemo(() => {
    const lines = [
      `SATAN Toolkit - ${kind === 'issue' ? 'Issue Report' : 'Feature Suggestion'}`,
      `Contact: ${contact.trim() || 'Not provided'}`,
      '---',
      message.trim() || '(empty)',
    ]
    return buildTelegramDeepLink({
      telegramUsername,
      message: lines.join('\n'),
    })
  }, [telegramUsername, kind, contact, message])

  return (
    <section id="feedback" className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-red-300/90">FEEDBACK</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Suggest feature or report issue
            </h2>
            <p className="mt-4 text-pretty text-white/65">
              Real channel, direct follow-up. Send us what blocks your workflow and what you want
              next.
            </p>
          </div>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="mx-auto mt-10 max-w-3xl rounded-[var(--radius)] border border-red-900/80 bg-gradient-to-br from-red-900/70 via-black/65 to-red-950/75 p-6 backdrop-blur">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-white/70">Type</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as 'suggestion' | 'issue')}
                  className="h-11 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white outline-none focus:border-red-500/40"
                >
                  <option value="suggestion">Feature suggestion</option>
                  <option value="issue">Issue report</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-white/70">Contact (Telegram/Email)</span>
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="@username or email"
                  className="h-11 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-red-500/40"
                />
              </label>
            </div>

            <label className="mt-4 grid gap-1">
              <span className="text-xs font-semibold text-white/70">Details</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Write your suggestion or the problem details..."
                className="resize-none rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-red-500/40"
              />
            </label>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <a
                href={ready ? href : '#feedback'}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex flex-1 items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${
                  ready
                    ? 'bg-gradient-to-b from-red-500 to-red-700 shadow-[0_16px_44px_rgba(255,60,60,.24)] hover:brightness-110'
                    : 'cursor-not-allowed border border-white/12 bg-white/5 text-white/55'
                }`}
              >
                Send to support
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
                Reset
              </button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

