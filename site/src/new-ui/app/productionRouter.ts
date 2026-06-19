import { useCallback, useEffect, useState } from 'react'
import type { AppRoute } from './routes'

const PUBLIC_PAGES = new Set(['product', 'features', 'pricing', 'compare', 'download', 'releases', 'changelog', 'faq', 'contact', 'support', 'privacy', 'terms', 'refund', 'acceptable-use', 'cookies'])
const PORTAL_PAGES = new Set(['overview', 'subscription', 'payments', 'downloads', 'devices', 'notifications', 'support', 'security', 'settings'])
const ADMIN_PAGES = new Set(['overview', 'users', 'subscriptions', 'commerce', 'releases', 'promos', 'support', 'communications', 'diagnostics', 'policies', 'audit', 'content', 'settings', 'coverage'])

function normalizePath(pathname: string) {
  if (!pathname || pathname === '/') return '/'
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

export function routeToPath(route: AppRoute): string {
  if (route.surface === 'auth') return route.page === 'signup' ? '/account/signup' : route.page === 'verify' ? '/account/verify' : '/account/signin'
  if (route.surface === 'portal') return route.page === 'overview' ? '/account' : `/account/${route.page}`
  if (route.surface === 'admin') return route.page === 'overview' ? '/admin' : `/admin/${route.page}`
  if (route.surface === 'system') return `/${route.page}`
  if (route.page === 'home') return '/'
  return `/${route.page}`
}

export function readProductionRoute(): AppRoute {
  const host = window.location.hostname.toLowerCase()
  const path = normalizePath(window.location.pathname)
  if (host.startsWith('admin.')) {
    const page = path === '/' || path === '/admin' ? 'overview' : path.replace(/^\/admin\/?/, '') || 'overview'
    return { surface: 'admin', page: ADMIN_PAGES.has(page) ? page : 'overview' }
  }
  if (path === '/login' || path === '/account/signin' || path === '/activate') return { surface: 'auth', page: 'signin' }
  if (path === '/account/signup') return { surface: 'auth', page: 'signup' }
  if (path === '/account/verify') return { surface: 'auth', page: 'verify' }
  if (path === '/account/linked') return { surface: 'auth', page: 'signin', state: 'linked' }
  if (path === '/account') return { surface: 'portal', page: 'overview' }
  if (path.startsWith('/account/')) {
    const page = path.replace('/account/', '')
    return { surface: 'portal', page: PORTAL_PAGES.has(page) ? page : 'overview' }
  }
  if (path === '/admin') return { surface: 'admin', page: 'overview' }
  if (path.startsWith('/admin/')) {
    const page = path.replace('/admin/', '')
    return { surface: 'admin', page: ADMIN_PAGES.has(page) ? page : 'overview' }
  }
  if (path === '/downloads') return { surface: 'public', page: 'download' }
  if (path === '/release-notes') return { surface: 'public', page: 'releases' }
  if (['/403', '/404', '/429', '/500', '/503'].includes(path)) return { surface: 'system', page: path.slice(1) }
  if (path === '/') return { surface: 'public', page: 'home' }
  const page = path.slice(1)
  return { surface: 'public', page: PUBLIC_PAGES.has(page) ? page : '404' }
}

export function useProductionRouter() {
  const [route, setRoute] = useState<AppRoute>(readProductionRoute)
  useEffect(() => {
    const onPopState = () => setRoute(readProductionRoute())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const navigate = useCallback((next: AppRoute) => {
    window.history.pushState({}, '', routeToPath(next))
    setRoute(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])
  return { route, navigate }
}
