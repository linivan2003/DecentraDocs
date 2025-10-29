import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // same as --host 0.0.0.0
    allowedHosts: [
        '.ngrok-free.dev'
    ],
  },
})