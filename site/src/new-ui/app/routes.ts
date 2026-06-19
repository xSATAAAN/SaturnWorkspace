export type Surface = 'public' | 'auth' | 'checkout' | 'portal' | 'admin' | 'system'

export type AppRoute = {
  surface: Surface
  page: string
  state?: string
}

export type Navigate = (route: AppRoute) => void
