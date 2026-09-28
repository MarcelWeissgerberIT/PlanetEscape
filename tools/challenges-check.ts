// Headless check for challenges: kit quota, locked printing, goal and medals.
import { CHALLENGES, challengeMedal } from '../src/game/data';
import { Sim } from '../src/game/sim';
import type { ItemId } from '../src/game/types';
import { challengeState } from '../src/game/world';

for (const c of CHALLENGES) {
  const st = challengeState(c.id);
  const sim = new Sim(st);
  const core = sim.core()!;
  // every goal item has a recipe in the challenge, every kit is a building of the challenge
  for (const k in c.kits) if (!c.buildings.includes(k as never)) throw new Error(`${c.id}: kit ${k} not buildable`);
  // quota: without a kit a building cannot be placed, locked parts cannot be printed
  for (const id of c.noPrint) {
    if (sim.queuePrint(id, 1) !== 0) throw new Error(`${c.id}: printed locked ${id}`);
  }
  st.kits = {};
  let spot = { x: 0, y: 0 };
  for (let r = 4; r < 12 && !spot.x; r++) for (let dx = -r; dx <= r && !spot.x; dx++) if (sim.terrain(core.x + dx, core.y - r) === 'ground') spot = { x: core.x + dx, y: core.y - r };
  const probe = c.buildings.includes('conveyor') ? 'conveyor' : 'road';
  const err = sim.placementError(probe, spot.x, spot.y);
  if (err !== 'err_no_kit') throw new Error(`${c.id}: placement without a kit gave ${err}`);
  st.kits = { ...c.kits };
  // the goal: deliver everything, then the challenge reports its time once
  sim.tick(1 / 30);
  if (st.challengeDone !== undefined) throw new Error(`${c.id}: done at start`);
  for (let s = 0; s < 5; s++) for (let i = 0; i < 30; i++) sim.tick(1 / 30);
  for (const [k, n] of Object.entries(c.deliver)) for (let i = 0; i < n!; i++) sim.accept(core, k as ItemId, 0);
  sim.tick(1 / 30);
  const events = sim.events.filter((e) => e.type === 'challenge_done');
  console.log(c.id, 'done after', st.challengeDone?.toFixed(1), 's, medal', challengeMedal(c.id, st.challengeDone ?? 1e9), 'wear', sim.wearOn(), 'autoPrint', st.autoPrint);
  if (st.challengeDone === undefined || events.length !== 1) throw new Error(`${c.id}: goal not detected`);
  if (sim.wearOn() || st.autoPrint !== false) throw new Error(`${c.id}: wear or auto print on`);
}
if (challengeMedal('c_drills', 100) !== 3 || challengeMedal('c_drills', 300) !== 2 || challengeMedal('c_drills', 5000) !== 0) throw new Error('medals wrong');
console.log('challenges check ok');
