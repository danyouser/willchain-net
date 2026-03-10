import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'wagmi-vendor': ['wagmi', 'viem'],
          'rainbowkit': ['@rainbow-me/rainbowkit'],
          'i18n': ['react-i18next', 'i18next'],
        },
      },
    },
    // Largest vendor chunks (~570kB) are MetaMask SDK and WalletConnect —
    // external dependencies we can't control. App code is well under 50kB.
    chunkSizeWarningLimit: 400,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
