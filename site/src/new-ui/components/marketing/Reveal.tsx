import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    if (visible) return
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])

  return <div ref={ref} className={`reveal${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`} style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}>{children}</div>
}
