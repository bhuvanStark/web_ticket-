import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  // Production is served from a sub-path (https://<domain>/customer/). The dev
  // server stays at the root. In-app redirects use import.meta.env.BASE_URL,
  // which tracks this value.
  base: command === 'build' ? '/customer/' : '/',
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: false,
    middlewareMode: false
  }
}))
