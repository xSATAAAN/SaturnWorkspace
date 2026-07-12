import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/tajawal/arabic-400.css'
import '@fontsource/tajawal/arabic-500.css'
import '@fontsource/tajawal/arabic-700.css'
import '@fontsource/tajawal/arabic-800.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AdapterProvider } from './adapters/AdapterProvider'
import { productionAdapters } from './adapters/productionAdapters'
import { NewUiApp } from './app/NewUiApp'
import { ExperienceProvider } from './app/ExperienceProvider'
import './foundation/tokens.css'
import './foundation/global.css'
import './foundation/components.css'
import './foundation/layouts.css'
import './foundation/public.css'
import './foundation/auth.css'
import './foundation/portal.css'
import './foundation/admin.css'
import './foundation/admin-login.css'
import './foundation/admin-responsive.css'
import './foundation/preview.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ExperienceProvider>
      <AdapterProvider adapters={productionAdapters}>
        <NewUiApp />
      </AdapterProvider>
    </ExperienceProvider>
  </StrictMode>,
)
