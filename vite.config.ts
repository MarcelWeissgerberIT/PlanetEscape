import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: { input: { main: 'index.html', ai: 'ai/index.html', spectate: 'spectate/index.html' } },
  },
  server: {
    port: 5173,
  },
});
