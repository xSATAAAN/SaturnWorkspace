import { type PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react'

type RevealProps = PropsWithChildren<{
  delayMs?: number
}>

export function Reveal({ children, delayMs = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [shown, setShown] = useState(false)

  const style = useMemo<React.CSSProperties>(
    () => ({
      transitionDelay: `${delayMs}ms`,
    }),
    [delayMs],
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (shown) return

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true)
            obs.disconnect()
            break
          }
        }
      },
      { threshold: 0.15 },
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [shown])

  return (
    <div ref={ref} className={shown ? 'reveal reveal--in' : 'reveal'} style={style}>
      {children}
    </div>
  )
}

