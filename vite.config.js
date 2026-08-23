import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' 讓 build 後用 file:// 也能載入資源
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
