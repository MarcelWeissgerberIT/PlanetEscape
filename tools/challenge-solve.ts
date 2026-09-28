// Calibration: let the story solver try each challenge within its kit quota and report the time.
import { CHALLENGES } from '../src/game/data';
import { Sim } from '../src/game/sim';
import { solveOrder } from '../src/game/solver';
import { challengeState } from '../src/game/world';
for (const c of CHALLENGES) {
  if (process.argv[2] && process.argv[2] !== c.id) continue;
  const sim = new Sim(challengeState(c.id));
  // the solver cannot queue kits by hand: with no kits and nothing locked, auto print stands in for it
  if (!Object.keys(c.kits).length && !c.noPrint.length) sim.state.autoPrint = true;
  let log = solveOrder(sim, Number(process.argv[3] ?? 6));
  let secs = 0, rounds = 1;
  while (secs < 1500 && sim.state.challengeDone === undefined) {
    sim.tick(1 / 30);
    secs += 1 / 30;
    if (!log.ok && Math.round(secs * 30) % (60 * 30) === 0 && rounds < 12) { const l2 = solveOrder(sim, 6); rounds++; log = { ...l2, placed: [...log.placed, ...l2.placed] }; }
  }
  console.log(c.id, 'ok', log.ok, log.error ?? '', '->', sim.state.challengeDone !== undefined ? `DONE ${Math.round(sim.state.challengeDone)} s (gold ${c.medals[0]})` : 'NOT DONE', 'delivered', JSON.stringify(sim.state.delivered), 'kits left', JSON.stringify(sim.state.kits), 'power', sim.state.powerDemand, '/', sim.state.powerSupply);
}
