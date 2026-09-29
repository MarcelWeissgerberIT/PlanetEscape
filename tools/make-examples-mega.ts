// Megafactory examples for the playground: the solver lays out whole production chains on a big random map, the
// factory then runs for a few minutes so belts are full when it loads. Written to public/examples/<id>.json.
// usage: npx esbuild tools/make-examples-mega.ts --bundle --platform=node --format=esm --outfile=mcp/dist/mega.mjs && node mcp/dist/mega.mjs [id]
import { mkdirSync, writeFileSync } from 'node:fs';
import { serialize } from '../src/game/save';
import { Sim } from '../src/game/sim';
import { buildChain, isFree, powerBalance, type SolverLog } from '../src/game/solver';
import type { GameOptions, GameState, ItemId } from '../src/game/types';
import { newGame } from '../src/game/world';
import { MEGA } from '../src/game/examples';

const only = process.argv[2];
mkdirSync('public/examples', { recursive: true });
for (const m of MEGA) {
  if (only && m.id !== only) continue;
  let best: { st: GameState; ok: number; n: number; seed: number } | null = null;
  for (const seed of m.seeds) {
    const opts: GameOptions = { mode: 'free', mapSize: m.size, infiniteOre: true, allUnlocked: true, storms: false };
    const st = newGame(seed, opts);
    const sim = new Sim(st);
    sim.creative = true;
    let ok = 0;
    // every chain several times over: parallel lines from further deposits
    for (let r = 0; r < m.rounds; r++)
      for (const [item, rate] of m.chains) {
        const log: SolverLog = { ok: true, steps: [], placed: [] };
        if (buildChain(sim, item as ItemId, st.buildings[0], rate, log)) ok++;
      }
    ok /= m.rounds;
    // power: solar parks in 8×6 blocks on free ground, nearest to the core first, until supply covers demand + 15 %
    const core = st.buildings[0];
    const blocks: { x: number; y: number; d: number }[] = [];
    for (let y = 2; y + 6 < st.height - 2; y += 7)
      for (let x = 2; x + 8 < st.width - 2; x += 9) {
        let free = true;
        for (let yy = y - 1; yy < y + 7 && free; yy++) for (let xx = x - 1; xx < x + 9 && free; xx++) free = isFree(sim, xx, yy);
        if (free) blocks.push({ x, y, d: Math.hypot(x + 4 - core.x, y + 3 - core.y) });
      }
    blocks.sort((a, b) => a.d - b.d);
    for (const bl of blocks) {
      const pb = powerBalance(sim);
      if (pb.supply >= pb.demand * 1.15) break;
      for (let yy = bl.y; yy < bl.y + 6; yy++) for (let xx = bl.x; xx < bl.x + 8; xx++) sim.place('solar', xx, yy, 0);
    }
    const pb = powerBalance(sim);
    console.log(`  power ${pb.supply}/${pb.demand}`);
    console.log(`${m.id} seed ${seed}: ${ok}/${m.chains.length} chains, ${st.buildings.length} buildings`);
    if (!best || ok > best.ok || (ok === best.ok && st.buildings.length > best.n)) best = { st, ok, n: st.buildings.length, seed };
    if (ok === m.chains.length) break;
  }
  const st = best!.st;
  const sim = new Sim(st);
  sim.creative = true;
  for (let i = 0; i < 30 * m.warm; i++) sim.tick(1 / 30);
  // hand it over as a playground map: free building, no orders
  st.options = { ...st.options, mode: 'playground' };
  st.time = 0;
  st.note = m.note;
  const core = st.buildings[0];
  st.focus = { x: core.x + 2, y: core.y + 2, zoom: m.zoom };
  st.inventory = { iron_plate: 999, copper_plate: 999, copper_wire: 500, machine_part: 300, circuit: 200, glass: 200 };
  const json = serialize(st);
  writeFileSync(`public/examples/${m.id}.json`, json);
  console.log(`=> ${m.id}: seed ${best!.seed}, ${best!.ok}/${m.chains.length}, ${st.buildings.length} buildings, produced ${JSON.stringify(st.stats.produced)}, ${(json.length / 1024).toFixed(0)} KB`);
}
