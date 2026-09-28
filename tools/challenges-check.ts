// Headless check for challenges: kit quota, locked printing, goal and medals.
import { CHALLENGES, challengeMedal } from '../src/game/data';
import { Sim } from '../src/game/sim';
import { decodeResult, encodeResult, resultMedal, shareLink } from '../src/game/share';
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
  if (c.rate) {
    // a throughput goal: the amounts alone are not enough
    if (st.challengeDone !== undefined) throw new Error(`${c.id}: done without holding the rate`);
    const acc: Record<string, number> = {};
    for (let s = 0; s < (c.rateHold ?? 45) + 70 && st.challengeDone === undefined; s++) {
      for (const [k, r] of Object.entries(c.rate)) {
        acc[k] = (acc[k] ?? 0) + (r! + 3) / 60;
        while (acc[k] >= 1) { sim.accept(core, k as ItemId, 0); acc[k]--; }
      }
      for (let i = 0; i < 30; i++) sim.tick(1 / 30);
    }
  }
  const events = sim.events.filter((e) => e.type === 'challenge_done');
  console.log(c.id, 'done after', st.challengeDone?.toFixed(1), 's, medal', challengeMedal(c.id, st.challengeDone ?? 1e9), 'wear', sim.wearOn(), 'autoPrint', st.autoPrint);
  if (st.challengeDone === undefined || events.length !== 1) throw new Error(`${c.id}: goal not detected`);
  if (sim.wearOn() || st.autoPrint !== false) throw new Error(`${c.id}: wear or auto print on`);
}
if (challengeMedal('c_drills', 100) !== 3 || challengeMedal('c_drills', 300) !== 2 || challengeMedal('c_drills', 5000) !== 0) throw new Error('medals wrong');
// share codes: round trip (with umlauts), links, typos and unknown challenges are refused
{
  const r = { id: 'c_drills', time: 187, name: 'Jürgen Ö.' };
  const code = encodeResult(r);
  const back = decodeResult(code);
  console.log('share code', code, '->', JSON.stringify(back));
  if (!back || back.id !== r.id || back.time !== r.time || back.name !== r.name) throw new Error('share code round trip failed');
  const link = shareLink(r, 'https://planet-escape.dev/?x=1#top');
  if (!link.startsWith('https://planet-escape.dev/?ch=PE-C1-') || decodeResult(link)?.time !== 187) throw new Error('share link wrong');
  const typo = code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11);
  if (decodeResult(typo) !== null) throw new Error('a mistyped code was accepted');
  if (decodeResult(encodeResult({ id: 'c_nope', time: 10, name: '' })) !== null) throw new Error('unknown challenge accepted');
  if (decodeResult('hello') !== null || decodeResult('') !== null) throw new Error('garbage accepted');
  if (resultMedal(back) !== 3) throw new Error('medal of a shared time wrong');
}
console.log('challenges check ok');
