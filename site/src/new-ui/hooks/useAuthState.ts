import { useEffect, useState } from 'react'
import { useAdapters } from '../adapters/AdapterProvider'
import type { AppUser, AuthState } from '../adapters/contracts'

const INITIAL_STATE: AuthState = { ready: false, user: null as AppUser | null }

export function useAuthState() {
  const { auth } = useAdapters()
  const [state, setState] = useState<AuthState>(INITIAL_STATE)

  useEffect(() => auth.subscribe(setState), [auth])

  return state
}
