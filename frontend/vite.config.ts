import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Dev only: forward API calls to FastAPI so there is no CORS in development.
      '/api': 'http://localhost:8000',
    },
  },
})
