import type { FeaturePaths, FeatureIconName } from '../../types/content'

export function FeatureIcon({ name }: { name: FeatureIconName }) {
  const paths: FeaturePaths = {
    vault: (
      <>
        <path d="M14 21v-5a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v5" />
        <path d="M12 21h24v15a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V21Z" />
        <circle cx="24" cy="30" r="4" />
        <path d="M24 30v-2" />
      </>
    ),
    gmail: (
      <>
        <rect x="12" y="16" width="24" height="18" rx="4" />
        <path d="m14 18 10 8 10-8" />
        <path d="M14 32l8-7" />
        <path d="M34 32l-8-7" />
      </>
    ),
    ip: (
      <>
        <path d="M24 42s12-9.2 12-22a12 12 0 0 0-24 0c0 12.8 12 22 12 22Z" />
        <circle cx="24" cy="20" r="4.5" />
      </>
    ),
    cloud: (
      <>
        <path d="M18.5 34H34a7 7 0 0 0 0-14h-1.1A10.5 10.5 0 0 0 12.8 24 5.5 5.5 0 0 0 18.5 34Z" />
        <path d="M20.5 33.5v-3.2a3.3 3.3 0 0 1 6.6 0v3.2" />
        <rect x="19.5" y="33.5" width="8.6" height="7" rx="2" />
      </>
    ),
    session: (
      <>
        <rect x="10.5" y="13" width="27" height="22" rx="4" />
        <path d="M10.5 18h27" />
        <path d="M15 16h.01" />
        <path d="M18 16h.01" />
        <path d="M21 16h.01" />
      </>
    ),
    proxy: (
      <>
        <path d="M24 12 34 16v10c0 7-5.5 13-10 14-4.5-1-10-7-10-14V16l10-4Z" />
        <path d="M20.5 24a3.5 3.5 0 0 1 7 0v2.5" />
        <rect x="19" y="26.5" width="10" height="8" rx="2" />
      </>
    ),
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-8 w-8">
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        {paths[name]}
      </g>
    </svg>
  )
}
