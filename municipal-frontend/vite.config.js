import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: false,
  },
  // Keep local API calls first-party. This is essential for the httpOnly
  // session cookie: 127.0.0.1 and localhost are different browser sites even
  // though they point to the same development machine.
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
})
