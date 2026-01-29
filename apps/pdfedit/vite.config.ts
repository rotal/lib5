import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/pdfedit/',
  server: {
    port: 3001,
    host: true,
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    outDir: '../../dist/pdfedit',
    emptyOutDir: true,
  },
});
