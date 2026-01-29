import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/imageflow/',
  server: {
    port: 3000,
    host: true,
  },
  preview: {
    port: 3000,
    host: true,
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    outDir: '../../dist/imageflow',
    emptyOutDir: true,
  },
});
