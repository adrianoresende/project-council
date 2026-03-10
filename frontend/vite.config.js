import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

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
  resolve: {
    alias: {
      '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), './src'),
    },
  },
  preview: {
    allowedHosts: previewAllowedHosts,
  },
})
