import { AdminProductionPages, AuthProductionPages, PortalProductionPages, PublicProductionPages, SystemProductionPages } from '../pages/production/ProductionPages'
import { useProductionRouter } from './productionRouter'

export function ProductionApp() {
  const { route, navigate } = useProductionRouter()
  if (route.surface === 'auth') return <AuthProductionPages page={route.page} navigate={navigate} />
  if (route.surface === 'portal') return <PortalProductionPages page={route.page} navigate={navigate} />
  if (route.surface === 'admin') return <AdminProductionPages page={route.page} navigate={navigate} />
  if (route.surface === 'system') return <SystemProductionPages page={route.page} navigate={navigate} />
  return <PublicProductionPages page={route.page} navigate={navigate} />
}
