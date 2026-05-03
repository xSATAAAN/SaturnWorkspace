import { Reveal } from '../Reveal'
import type { SiteCopy } from '../../types/content'

type HowSectionProps = {
  copy: SiteCopy
}

export function HowSection({ copy }: HowSectionProps) {
  return (
    <section id="how" className="border-t border-white/5 bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-[#2884ff]">{copy.howTag}</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">{copy.howTitle}</h2>
          </div>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {copy.how.map((s, idx) => (
            <Reveal key={s.step} delayMs={70 + idx * 45}>
              <div className="red-panel rounded-[var(--radius)] p-6 shadow-[0_16px_34px_rgba(40,132,255,.12)] backdrop-blur">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-[#2884ff]">{s.step}</div>
                  <div className="red-badge h-8 w-8 rounded-full" />
                </div>
                <div className="mt-4 text-lg font-semibold text-white">{s.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-white/72">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
