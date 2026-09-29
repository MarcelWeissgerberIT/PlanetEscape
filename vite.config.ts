import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const stamp = Date.now().toString(36);

export default defineConfig(({ mode }) => {
  const desktop = mode === 'desktop';
  return {
  base: './',
  plugins: [
    {
      // every deploy gets its own service worker cache (see public/sw.js)
      name: 'sw-version',
      apply: 'build',
      closeBundle() {
        const f = `${desktop ? 'desktop/app' : 'dist'}/sw.js`;
        try {
          // the desktop app loads its files from disk: no service worker there
          if (desktop) {
            rmSync(f);
            // the app plays the full-size WebM videos (Electron always has VP9); the web's smaller and MP4 copies stay out
            for (const v of ['intro_720.mp4', 'menu_720.mp4', 'intro_720.webm', 'menu_720.webm', 'intro_1080.mp4', 'menu_1080.mp4']) rmSync(`desktop/app/video/${v}`, { force: true });
          }
          else writeFileSync(f, readFileSync(f, 'utf8').replace('__SW_VERSION__', stamp));
        } catch {
          /* no service worker in this build */
        }
      },
    },
  ],
  define: {
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
    __DESKTOP__: JSON.stringify(desktop),
    __EDITION__: JSON.stringify(process.env.PE_EDITION === 'demo' ? 'demo' : 'full'),
    __STORE_URL__: JSON.stringify(process.env.PE_STORE_URL ?? ''),
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    // the desktop app ships the game only (no AI / spectator pages) into desktop/app
    outDir: desktop ? 'desktop/app' : 'dist',
    emptyOutDir: true,
    rollupOptions: { input: desktop ? { main: 'index.html' } : { main: 'index.html', ai: 'ai/index.html', spectate: 'spectate/index.html' } },
  },
  server: {
    port: 5173,
  },
  };
});
