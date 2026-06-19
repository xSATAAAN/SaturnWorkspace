import { useCallback, useEffect, useState } from 'react'
import type { AppRoute, Surface } from './routes'

export type PreviewRoute = AppRoute
export type { Surface }

const DEFAULT_ROUTE: PreviewRoute = { surface: 'public', page: 'home' }

export function readPreviewRoute(): PreviewRoute {
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('surface') as Surface | null
  const allowed: Surface[] = ['public', 'auth', 'checkout', 'portal', 'admin', 'system']
  return {
    surface: requested && allowed.includes(requested) ? requested : DEFAULT_ROUTE.surface,
    page: params.get('page') || DEFAULT_ROUTE.page,
    state: params.get('state') || undefined,
  }
}

export function routeHref(route: PreviewRoute) {
  const params = new URLSearchParams({ surface: route.surface, page: route.page })
  if (route.state) params.set('state', route.state)
  return `?${params.toString()}`
}

export function usePreviewRouter() {
  const [route, setRoute] = useState<PreviewRoute>(readPreviewRoute)

  useEffect(() => {
    const onPopState = () => setRoute(readPreviewRoute())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((next: PreviewRoute) => {
    window.history.pushState({}, '', routeHref(next))
    setRoute(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return { route, navigate }
}
