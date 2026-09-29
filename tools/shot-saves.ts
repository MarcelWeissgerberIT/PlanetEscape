// Saves for the store screenshots (tools/steam-shots.mjs): factories the solver builds and runs for a while.
import { mkdirSync, writeFileSync } from 'node:fs';
import { serialize } from '../src/game/save';
import { Sim } from '../src/game/sim';
import { solveOrder } from '../src/game/solver';
import { chapterState } from '../src/game/world';

(globalThis as { localStorage?: unknown }).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
mkdirSync('steam-assets/.saves', { recursive: true });
for (const [ch, secs] of [[4, 200], [6, 360]] as const) {
  const st = chapterState(ch, { mode: 'story', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: false });
  st.introSeen = true;
  st.tutorialStep = -1;
  const sim = new Sim(st);
  solveOrder(sim, 8);
  for (let i = 0; i < secs * 30 && st.missionIndex < ch; i++) sim.tick(1 / 30);
  writeFileSync(`steam-assets/.saves/chapter${ch}.json`, serialize(st));
  console.log(`chapter ${ch}: ${st.buildings.length} buildings`);
}
