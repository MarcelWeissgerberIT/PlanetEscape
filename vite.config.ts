import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: { input: { main: 'index.html', ai: 'ai/index.html' } },
  },
  server: {
    port: 5173,
  },
});
