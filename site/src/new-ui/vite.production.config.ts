import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL('./production-index.html', import.meta.url)),
    },
    outDir: 'dist-production',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
  server: {
    port: 4280,
    strictPort: false,
  },
  preview: {
    port: 4281,
    strictPort: false,
  },
})
