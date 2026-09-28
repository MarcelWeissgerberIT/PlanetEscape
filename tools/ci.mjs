// Runs every headless check (and the story solver for the chapters it can finish) one after another.
// Used by the deploy workflow before the build; locally: npm run ci  (or: node tools/ci.mjs kits route)
import { execSync, spawnSync } from 'node:child_process';

const CHECKS = [
  'kits', 'logistics', 'storage', 'parts', 'examples', 'board', 'kdos', 'contracts', 'projects', 'wear',
  'flights', 'challenges', 'merger', 'route', 'saves', 'perf', 'ray', 'blocks', 'blockshd', 'trailer',
];
const SOLVER_CHAPTERS = [1, 2, 3, 4, 5, 6]; // chapter 7 is not finished by the solver yet
const only = process.argv.slice(2);
const results = [];
let failed = 0;

function run(name, cmd, args, ok = (out) => true) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const pass = r.status === 0 && ok(out);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  results.push({ name, pass, secs });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} (${secs} s)`);
  if (!pass) {
    failed++;
    console.log(out.split('\n').slice(-25).join('\n'));
  }
}

for (const c of CHECKS) if (!only.length || only.includes(c)) run(`${c}:check`, 'npm', ['run', '-s', `${c}:check`]);
if (!only.length || only.includes('challenges')) run('challenges:ref', 'npm', ['run', '-s', 'challenges:ref']);
if (!only.length || only.includes('solver')) {
  execSync('npx esbuild tools/solver-check.ts --bundle --platform=node --format=esm --outfile=mcp/dist/solver-check.mjs --log-level=warning');
  for (const ch of SOLVER_CHAPTERS) run(`solver ch${ch}`, 'node', ['mcp/dist/solver-check.mjs', String(ch)], (out) => new RegExp(`ch${ch} solve=\\S+ .*-> DONE`).test(out));
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
