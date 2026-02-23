import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const DEFAULT_PREVIEW_ALLOWED_HOSTS = ['front-end-production-4235.up.railway.app']

const previewAllowedHostsFromEnv = (process.env.VITE_PREVIEW_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

const previewAllowedHosts =
  previewAllowedHostsFromEnv.length > 0
    ? previewAllowedHostsFromEnv
    : DEFAULT_PREVIEW_ALLOWED_HOSTS

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    allowedHosts: previewAllowedHosts,
  },
})
