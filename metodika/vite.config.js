import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/metodika/',
  build: { outDir: '../public/metodika', emptyOutDir: true },
  server: { port: 5175, proxy: { '/api': 'http://localhost:5000' } },
})
