import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 🔥 REQUIRED for GitHub Pages
  build: {
    outDir: 'docs',   // 🔥 build output goes to /docs instead of /dist
  },
})
