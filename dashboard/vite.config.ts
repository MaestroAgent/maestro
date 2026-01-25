import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  server: {
    proxy: {
      '/chat': 'http://localhost:3000',
      '/agents': 'http://localhost:3000',
      '/sessions': 'http://localhost:3000',
      '/observability': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
