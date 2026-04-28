import { useMemo } from 'react'
import { Reveal } from './components/Reveal'
import { SiteHeader } from './components/SiteHeader'
import { Pricing } from './components/sections/Pricing'

const TELEGRAM_USERNAME = import.meta.env.VITE_TELEGRAM_USERNAME || 'satantoolkit'
const TELEGRAM_LINK = `https://t.me/${TELEGRAM_USERNAME}`

export default function App() {
  const stats = useMemo(
    () => [
      { label: 'Active installs', value: '2,500+' },
      { label: 'Satisfaction', value: '4.9/5' },
      { label: 'Time to set up', value: '< 2 min' },
    ],
    [],
  )

  return (
    <div className="relative">
      <div className="noise" aria-hidden="true" />
      <SiteHeader telegramHref={TELEGRAM_LINK} />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:pb-20 sm:pt-14">
            <div className="mx-auto max-w-3xl text-center">
              <Reveal>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80 backdrop-blur">
                  <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_24px_rgba(255,60,60,.55)]" />
                  Latest build available now
                </div>
              </Reveal>

              <Reveal delayMs={80}>
                <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-white sm:text-6xl">
                  Make your Windows setup{' '}
                  <span className="bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                    faster, cleaner, sharper
                  </span>{' '}
                  in minutes.
                </h1>
              </Reveal>

              <Reveal delayMs={140}>
                <p className="mt-5 text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
                  SATAN Toolkit is a focused performance + maintenance suite for power users. One
                  dashboard to boost, clean, harden privacy, and keep your machine responsive.
                </p>
              </Reveal>

              <Reveal delayMs={220}>
                <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <a
                    href="#pricing"
                    className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-red-500 to-red-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(255,60,60,.22)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    Get started
                    <span className="translate-x-0 transition group-hover:translate-x-0.5">→</span>
                  </a>
                  <a
                    href="#features"
                    className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/7 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    Explore features
                  </a>
                </div>
              </Reveal>
            </div>

            <Reveal delayMs={260}>
              <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
                {stats.map((s) => (
                  <div key={s.label} className="glow-border">
                    <div className="rounded-[var(--radius)] border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
                      <div className="text-2xl font-semibold text-white">{s.value}</div>
                      <div className="mt-1 text-sm text-white/60">{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm font-semibold text-red-300/90">FEATURES</p>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Everything you need, in one toolkit
                </h2>
                <p className="mt-4 text-pretty text-white/65">
                  Each action is designed to be reversible. You stay in control.
                </p>
              </div>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: 'System Boost',
                  desc: 'Targeted tuning for responsiveness and smoother desktop experience.',
                },
                { title: 'Deep Clean', desc: 'Clear temp + cache + leftovers that waste storage.' },
                {
                  title: 'Privacy Shield',
                  desc: 'Reduce noise: disable known telemetry surfaces (safely).',
                },
                {
                  title: 'Game Mode',
                  desc: 'Prioritize performance and reduce stutter while you play.',
                },
                {
                  title: 'Bloat Removal',
                  desc: 'Trim unnecessary apps and background extras.',
                },
                {
                  title: 'Auto Updates',
                  desc: 'New features and improvements shipped regularly.',
                },
              ].map((f, idx) => (
                <Reveal key={f.title} delayMs={60 + idx * 35}>
                  <div className="glow-border">
                    <div className="h-full rounded-[var(--radius)] border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:bg-white/7">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-white">{f.title}</div>
                          <p className="mt-2 text-sm leading-relaxed text-white/65">{f.desc}</p>
                        </div>
                        <div className="h-10 w-10 shrink-0 rounded-xl border border-white/10 bg-gradient-to-b from-red-500/20 to-white/5" />
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm font-semibold text-red-300/90">HOW IT WORKS</p>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Three steps. Done.
                </h2>
              </div>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                {
                  step: '01',
                  title: 'Pick your plan',
                  desc: 'Monthly to try it, or lifetime if you want everything.',
                },
                {
                  step: '02',
                  title: 'Checkout inside the site',
                  desc: 'No payment provider yet? You can still place an order and complete via Telegram.',
                },
                {
                  step: '03',
                  title: 'Activate & enjoy',
                  desc: 'Download, activate, and apply improvements with one click.',
                },
              ].map((s, idx) => (
                <Reveal key={s.step} delayMs={70 + idx * 45}>
                  <div className="rounded-[var(--radius)] border border-white/10 bg-white/5 p-6 backdrop-blur">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-red-300/90">{s.step}</div>
                      <div className="h-8 w-8 rounded-full bg-gradient-to-b from-red-500/30 to-white/5" />
                    </div>
                    <div className="mt-4 text-lg font-semibold text-white">{s.title}</div>
                    <p className="mt-2 text-sm leading-relaxed text-white/65">{s.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing (checkout UI will be implemented next todo) */}
        <Pricing telegramHref={TELEGRAM_LINK} />

        {/* FAQ */}
        <section id="faq" className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm font-semibold text-red-300/90">FAQ</p>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Quick answers
                </h2>
              </div>
            </Reveal>

            <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-3">
              {[
                {
                  q: 'Is it safe?',
                  a: 'The toolkit is designed to be reversible. We focus on safe defaults and clarity.',
                },
                { q: 'Windows versions?', a: 'Windows 10 and 11 are supported.' },
                { q: 'Multiple devices?', a: 'Licenses are per-device. Ask us for bundles.' },
                { q: 'How do I get my key?', a: 'After checkout, we confirm and send your key.' },
              ].map((item, idx) => (
                <Reveal key={item.q} delayMs={60 + idx * 35}>
                  <details className="group rounded-[var(--radius)] border border-white/10 bg-white/5 px-5 py-4 backdrop-blur open:bg-white/7">
                    <summary className="cursor-pointer list-none select-none text-sm font-semibold text-white">
                      <span className="mr-2 text-red-300/90">+</span>
                      {item.q}
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-white/65">{item.a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">SATAN Toolkit</div>
                <div className="mt-1 text-sm text-white/60">
                  Performance, cleanup, and privacy — built for control.
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <a className="text-white/70 hover:text-white" href="/privacy.html">
                  Privacy
                </a>
                <a className="text-white/70 hover:text-white" href="/terms.html">
                  Terms
                </a>
                <a className="text-white/70 hover:text-white" href="/updates/latest.json">
                  Updates
                </a>
              </div>
            </div>
            <div className="mt-8 text-xs text-white/45">© {new Date().getFullYear()} SATAN Toolkit</div>
          </div>
        </footer>
      </main>
    </div>
  )
}
