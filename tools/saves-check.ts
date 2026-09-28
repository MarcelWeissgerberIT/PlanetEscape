// Old saves keep working: saves written by five earlier versions of the game (tools/fixtures, generated from
// commits f327c80 … eb43807) and the showcase saves in saves/ load, migrate and run for a while without errors.
import { readdirSync, readFileSync } from 'node:fs';
import { BUILDINGS, MISSIONS } from '../src/game/data';
import { lastDropped, migrate, serialize } from '../src/game/save';
import { Sim } from '../src/game/sim';
import type { GameState } from '../src/game/types';
import { SAVE_VERSION } from '../src/game/world';

// localStorage and btoa/atob stand-ins for the loader (node has no browser storage)
(globalThis as { localStorage?: unknown }).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const files = [
  ...readdirSync('tools/fixtures').filter((f) => f.endsWith('.json')).map((f) => `tools/fixtures/${f}`),
  ...readdirSync('saves').filter((f) => f.endsWith('.json')).map((f) => `saves/${f}`),
];
const finite = (o: Record<string, number | undefined>) => Object.values(o).every((v) => v === undefined || Number.isFinite(v));
for (const f of files) {
  const raw = JSON.parse(readFileSync(f, 'utf8')) as Partial<GameState>;
  const from = raw.version;
  const n = raw.buildings?.length ?? 0;
  const st = migrate(raw);
  if (!st) throw new Error(`${f}: did not load`);
  if (st.version !== SAVE_VERSION) throw new Error(`${f}: version ${st.version}`);
  const sim = new Sim(st);
  const t0 = st.time;
  for (let i = 0; i < 30 * 90; i++) sim.tick(1 / 30);
  if (!finite(st.inventory as Record<string, number>)) throw new Error(`${f}: inventory broke: ${JSON.stringify(st.inventory)}`);
  if (!Number.isFinite(st.powerSupply) || !Number.isFinite(st.powerDemand)) throw new Error(`${f}: power broke`);
  if (st.buildings.some((b) => !(b.type in BUILDINGS))) throw new Error(`${f}: unknown building survived`);
  // unlocks of an old story save cover what its finished missions unlock today
  if (st.options.mode === 'story') for (let i = 0; i < Math.min(st.missionIndex, MISSIONS.length); i++) for (const u of MISSIONS[i].unlocks) if (!st.unlockedBuildings.includes(u)) throw new Error(`${f}: ${u} not unlocked`);
  // what we write reads back the same
  const again = migrate(JSON.parse(serialize(st)));
  if (!again || again.buildings.length !== st.buildings.length) throw new Error(`${f}: round trip lost buildings`);
  console.log(`${f}: v${from} -> v${st.version}, ${n} buildings (${lastDropped} dropped), mode ${st.options.mode}, ran ${Math.round(st.time - t0)} s, kits ${Object.keys(st.kits ?? {}).length}, robots ${sim.robots().length}`);
}
// broken input is refused, not crashed on
for (const bad of [null, {}, { buildings: [] }, { buildings: [{ type: 'miner' }], terrain: [] }, 'x']) if (migrate(bad) !== null) throw new Error(`accepted ${JSON.stringify(bad)}`);
console.log('saves check ok');
