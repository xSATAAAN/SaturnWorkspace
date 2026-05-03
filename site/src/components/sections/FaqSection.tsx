import { Reveal } from '../Reveal'
import type { SiteCopy } from '../../types/content'

type FaqSectionProps = {
  copy: SiteCopy
}

export function FaqSection({ copy }: FaqSectionProps) {
  return (
    <section id="faq" className="bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-accent text-sm font-semibold">{copy.faqTag}</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">{copy.faqTitle}</h2>
          </div>
        </Reveal>

        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-3">
          {copy.faq.map((item, idx) => (
            <Reveal key={item.q} delayMs={60 + idx * 35}>
              <details className="surface-card group rounded-[var(--radius)] px-5 py-4">
                <summary className="cursor-pointer list-none select-none text-sm font-semibold text-white">
                  <span className="text-accent-muted mr-2">+</span>
                  {item.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-white/72">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
