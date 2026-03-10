import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

const LOCAL_PREVIEW_ALLOWED_HOSTS = ['localhost', '127.0.0.1']

const previewAllowedHostsFromEnv = (process.env.VITE_PREVIEW_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

const railwayPublicDomain = (process.env.RAILWAY_PUBLIC_DOMAIN ?? '').trim()

const previewAllowedHosts = Array.from(
  new Set([
    ...LOCAL_PREVIEW_ALLOWED_HOSTS,
    ...(railwayPublicDomain ? [railwayPublicDomain] : []),
    ...previewAllowedHostsFromEnv,
  ]),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    allowedHosts: previewAllowedHosts,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    css: true,
  },
})
