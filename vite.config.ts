import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const stamp = Date.now().toString(36);

export default defineConfig({
  base: './',
  plugins: [
    {
      // every deploy gets its own service worker cache (see public/sw.js)
      name: 'sw-version',
      apply: 'build',
      closeBundle() {
        const f = 'dist/sw.js';
        try {
          writeFileSync(f, readFileSync(f, 'utf8').replace('__SW_VERSION__', stamp));
        } catch {
          /* no service worker in this build */
        }
      },
    },
  ],
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
