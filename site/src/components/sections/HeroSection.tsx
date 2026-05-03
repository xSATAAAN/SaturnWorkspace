import { Reveal } from '../Reveal'
import type { SiteCopy } from '../../types/content'

type HeroSectionProps = {
  copy: SiteCopy
}

export function HeroSection({ copy }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:pb-20 sm:pt-14">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/85 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-[#2884ff] shadow-[0_0_14px_rgba(40,132,255,.28)]" />
              {copy.heroBadge}
            </div>
          </Reveal>

          <Reveal delayMs={80}>
            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              {copy.heroTitleA}{' '}
              <span className="bg-gradient-to-r from-[#3b8eff] to-[#1b4f8f] bg-clip-text text-transparent">{copy.heroTitleB}</span>{' '}
              {copy.heroTitleC}
            </h1>
          </Reveal>

          <Reveal delayMs={140}>
            <p className="mt-5 text-pretty text-base leading-relaxed text-white/78 sm:text-lg">{copy.heroDesc}</p>
          </Reveal>

          <Reveal delayMs={220}>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <a
                href="#pricing"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#0d2a4a] to-[#07192f] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(40,132,255,.15)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2884ff]"
              >
                {copy.ctaStart}
                <span className="translate-x-0 transition group-hover:translate-x-0.5">→</span>
              </a>
              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/4 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2884ff]"
              >
                {copy.ctaExplore}
              </a>
            </div>
          </Reveal>
        </div>

        <Reveal delayMs={260}>
          <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-3">
            {copy.stats.map((s) => (
              <div key={s.label} className="rounded-[var(--radius)] border border-white/10 bg-[rgba(7,19,35,0.7)] px-5 py-5 backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-3xl font-semibold text-white">{s.value}</div>
                    <div className="mt-1 text-sm font-semibold text-white/85">{s.label}</div>
                    <div className="mt-1 text-xs text-white/60">{s.hint}</div>
                  </div>
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#2884ff]" />
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
