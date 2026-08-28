import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this repo at https://<user>.github.io/tools/, so asset
  // paths need the /tools/ prefix in CI builds. Local dev/build stays at "/".
  base: process.env.GITHUB_ACTIONS ? '/tools/' : '/',
  plugins: [react()],
})
