import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/kontakthub/',
  build: { outDir: '../public/kontakthub', emptyOutDir: true },
  server: { port: 5174 },
})
