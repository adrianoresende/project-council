import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_PREVIEW_ALLOWED_HOSTS = ['front-end-development-2ed0.up.railway.app']

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
  resolve: {
    alias: {
      '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), './src'),
    },
  },
  preview: {
    allowedHosts: previewAllowedHosts,
  },
})
