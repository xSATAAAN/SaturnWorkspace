import { AdminPages } from '../pages/admin/AdminPages'
import { AuthPages } from '../pages/auth/AuthPages'
import { CheckoutPages } from '../pages/auth/CheckoutPages'
import { PortalPages } from '../pages/portal/PortalPages'
import { PublicPages } from '../pages/public/PublicPages'
import { SystemPages } from '../pages/system/SystemPages'
import { PreviewSwitcher } from './PreviewSwitcher'
import { usePreviewRouter } from './previewRouter'

export function NewUiApp() {
  const { route, navigate } = usePreviewRouter()
  const content = route.surface === 'auth' ? <AuthPages page={route.page} navigate={navigate} /> : route.surface === 'checkout' ? <CheckoutPages page={route.page} state={route.state} navigate={navigate} /> : route.surface === 'portal' ? <PortalPages page={route.page} navigate={navigate} /> : route.surface === 'admin' ? <AdminPages page={route.page} navigate={navigate} /> : route.surface === 'system' ? <SystemPages page={route.page} navigate={navigate} /> : <PublicPages page={route.page} navigate={navigate} />
  return <>{content}<PreviewSwitcher route={route} navigate={navigate} /></>
}
