import { useState } from 'react'
import { CheckoutModal, type PlanId } from '../CheckoutModal'
import { Reveal } from '../Reveal'

type PricingProps = {
  telegramHref: string
}

export function Pricing({ telegramHref }: PricingProps) {
  const telegramUsername = telegramHref.replace(/^https?:\/\/t\.me\//, '').replace(/\?.*$/, '')
  const [open, setOpen] = useState(false)
  const [initialPlan, setInitialPlan] = useState<PlanId>('lifetime')

  return (
    <section id="pricing" className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-red-300/90">PRICING</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Simple pricing. No surprises.
            </h2>
            <p className="mt-4 text-pretty text-white/65">
              Start monthly, or get lifetime access with updates included.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Reveal delayMs={80}>
            <div className="red-panel rounded-[var(--radius)] p-7 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white/80">Monthly</div>
                  <div className="mt-2 text-3xl font-semibold text-white">
                    EGP 499 <span className="text-base font-semibold text-white/60">/mo</span>
                  </div>
                </div>
                <span className="rounded-full border border-red-700/70 bg-black/25 px-3 py-1 text-xs font-semibold text-white/85">
                  Try it
                </span>
              </div>

              <ul className="mt-6 space-y-2 text-sm text-white/70">
                <li>System Boost</li>
                <li>Deep Clean</li>
                <li>Privacy Shield</li>
                <li>Basic support</li>
              </ul>

              <div className="mt-7 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setInitialPlan('monthly')
                    setOpen(true)
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-b from-red-500 to-red-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_36px_rgba(255,60,60,.22)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  Checkout
                </button>
                <a
                  href={telegramHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  Buy via Telegram
                </a>
              </div>
            </div>
          </Reveal>

          <Reveal delayMs={130}>
            <div className="glow-border">
              <div className="red-panel rounded-[var(--radius)] p-7 backdrop-blur">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-white/80">Lifetime</div>
                    <div className="mt-2 text-3xl font-semibold text-white">EGP 1,499</div>
                  </div>
                  <span className="rounded-full border border-red-700/70 bg-black/30 px-3 py-1 text-xs font-semibold text-red-200/90">
                    Best value
                  </span>
                </div>

                <ul className="mt-6 space-y-2 text-sm text-white/70">
                  <li>All features</li>
                  <li>Lifetime updates</li>
                  <li>VIP support</li>
                  <li>Early access builds</li>
                </ul>

                <div className="mt-7 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      setInitialPlan('lifetime')
                      setOpen(true)
                    }}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-b from-red-500 to-red-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_44px_rgba(255,60,60,.26)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    Checkout
                  </button>
                  <a
                    href={telegramHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    Buy via Telegram
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delayMs={220}>
          <div className="mx-auto mt-10 max-w-3xl rounded-[var(--radius)] border border-white/10 bg-white/4 px-6 py-5 text-center text-sm text-white/70 backdrop-blur">
            Checkout starts here, then finishes on Telegram (fast confirmation). Payment provider
            integration will be added next.
          </div>
        </Reveal>
      </div>

      <CheckoutModal
        open={open}
        onClose={() => setOpen(false)}
        telegramUsername={telegramUsername || 'satantoolkit'}
        initialPlan={initialPlan}
      />
    </section>
  )
}

