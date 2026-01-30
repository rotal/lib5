import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { claudeServerPlugin } from './vite-plugin-claude-server';

export default defineConfig({
  plugins: [react(), claudeServerPlugin()],
  base: '/imageflow/',
  optimizeDeps: {
    include: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links'],
  },
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
