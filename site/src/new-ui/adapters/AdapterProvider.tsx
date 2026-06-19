/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react'
import type { AppAdapters } from './contracts'

const AdapterContext = createContext<AppAdapters | null>(null)

export function AdapterProvider({ adapters, children }: { adapters: AppAdapters; children: ReactNode }) {
  return <AdapterContext.Provider value={adapters}>{children}</AdapterContext.Provider>
}

export function useAdapters() {
  const adapters = useContext(AdapterContext)
  if (!adapters) throw new Error('useAdapters must be used inside AdapterProvider')
  return adapters
}
