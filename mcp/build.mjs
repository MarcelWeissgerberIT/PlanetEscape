import { build } from 'esbuild';
await build({
  entryPoints: ['mcp/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: 'mcp/dist/index.mjs',
  packages: 'external',
  banner: { js: '#!/usr/bin/env node' },
});
console.log('mcp built -> mcp/dist/index.mjs');
