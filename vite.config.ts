import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 5174, so Be in touch (5173) can run at the same time.
    port: 5174,
    strictPort: true,
    // The API server (server/index.ts) runs separately; forwarding /api keeps cookies same-origin.
    // The browser tests (e2e/) run their own API server elsewhere and say where in API_URL.
    proxy: {
      '/api': process.env.API_URL || 'http://127.0.0.1:3002',
    },
    // The coverage report is written into the project; don't reload the page when it changes.
    watch: {
      ignored: ['**/coverage/**'],
    },
  },
})
