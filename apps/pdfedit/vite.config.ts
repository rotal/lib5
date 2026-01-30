import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/pdfedit/',
  server: {
    port: 3001,
    host: true,
    headers: {
      // Required for SharedArrayBuffer which MuPDF may use
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    outDir: '../../dist/pdfedit',
    emptyOutDir: true,
  },
  optimizeDeps: {
    // Exclude mupdf from pre-bundling as it has WASM
    exclude: ['mupdf'],
  },
});
