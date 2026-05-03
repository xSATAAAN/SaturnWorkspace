import { FeatureIcon } from '../icons/FeatureIcon'
import { Reveal } from '../Reveal'
import type { SiteCopy } from '../../types/content'

type FeaturesSectionProps = {
  copy: SiteCopy
}

export function FeaturesSection({ copy }: FeaturesSectionProps) {
  return (
    <section id="features" className="border-t border-white/5 bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-[#2884ff]">{copy.featuresTag}</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">{copy.featuresTitle}</h2>
            <p className="mt-4 text-pretty text-white/65">{copy.featuresDesc}</p>
          </div>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {copy.features.map((f, idx) => (
            <Reveal key={f.title} delayMs={60 + idx * 35}>
              <div className="red-panel rounded-[var(--radius)] p-6 shadow-[0_16px_34px_rgba(40,132,255,.12)] backdrop-blur transition">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{f.title}</div>
                      <p className="mt-2 text-sm leading-relaxed text-white/72">{f.desc}</p>
                    </div>
                    <div className="feature-icon-box h-11 w-11 shrink-0 rounded-xl">
                      <FeatureIcon name={f.icon} />
                    </div>
                  </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
