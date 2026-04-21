import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/advisor-training/',
  build: { outDir: '../../../public/advisor-training', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5000' },
  },
});
