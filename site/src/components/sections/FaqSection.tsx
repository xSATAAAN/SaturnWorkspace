import { Reveal } from '../Reveal'
import type { SiteCopy } from '../../types/content'

type FaqSectionProps = {
  copy: SiteCopy
}

export function FaqSection({ copy }: FaqSectionProps) {
  return (
    <section id="faq" className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-[#2884ff]">{copy.faqTag}</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">{copy.faqTitle}</h2>
          </div>
        </Reveal>

        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-3">
          {copy.faq.map((item, idx) => (
            <Reveal key={item.q} delayMs={60 + idx * 35}>
              <details className="group rounded-[var(--radius)] border border-[#1f4f82]/70 bg-gradient-to-b from-[#0d2a4a] to-[#07192f] px-5 py-4 shadow-[0_14px_30px_rgba(40,132,255,.1)] backdrop-blur">
                <summary className="cursor-pointer list-none select-none text-sm font-semibold text-white">
                  <span className="mr-2 text-[#2884ff]">+</span>
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
