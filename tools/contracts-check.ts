// Headless check for automation contracts: steady rate band, exact batches per beat, stock level.
import { Sim } from '../src/game/sim';
import type { Contract, GameState } from '../src/game/types';
import { newGame } from '../src/game/world';

function world(): { st: GameState; sim: Sim } {
  const st = newGame(41, { mode: 'free', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 48, h: 48, blank: true });
  st.contracts = [];
  st.nextContractAt = Infinity;
  st.nextEventAt = Infinity;
  return { st, sim: new Sim(st) };
}
function contract(sim: Sim, kind: Contract['kind']): Contract {
  const c = sim.makeAutomationContract(kind);
  if (!c) throw new Error(`no ${kind} contract`);
  c.item = 'iron_plate';
  sim.state.contracts.push(c);
  sim.acceptContract(c);
  return c;
}
/** Runs seconds of game time and feeds the core one plate every `every` seconds (0 = none). */
function run(sim: Sim, seconds: number, every: number) {
  const core = sim.core()!;
  let next = sim.state.time + 0.01;
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    if (every && sim.state.time >= next) {
      sim.accept(core, 'iron_plate', 0);
      next += every;
    }
    sim.tick(1 / 30);
  }
}
const inv = (st: GameState) => st.inventory.machine_part ?? 0;

// steady: 8 to 12 per minute for 90 s. 10/min must win, 30/min must not count
{
  const { st, sim } = world();
  const c = contract(sim, 'steady');
  c.lo = 8; c.hi = 12;
  run(sim, 100, 2); // 30 per minute: too much
  console.log('steady too fast: held', c.held?.toFixed(1), 'rate', sim.automationValue(c));
  if (!st.contracts.includes(c) || (c.held ?? 0) > 0) throw new Error('too many deliveries counted as steady');
  const before = inv(st);
  run(sim, 170, 6); // 10 per minute
  console.log('steady at 10/min: done', !st.contracts.includes(c), 'reward', before, '->', inv(st));
  if (st.contracts.includes(c) || inv(st) <= before) throw new Error('steady contract not completed');
}

// batch: exactly n per 30 s beat, 4 beats in a row; one wrong beat restarts the series
{
  const { st, sim } = world();
  const c = contract(sim, 'batch');
  c.n = 6;
  run(sim, 30, 5); // 6 in the first beat
  run(sim, 30, 3); // 10 in the second: wrong
  run(sim, 0.2, 0); // let the beat close
  console.log('batch after a wrong beat: done', c.done);
  if (c.done !== 0) throw new Error('a wrong beat did not reset the series');
  run(sim, 30 * 4 + 1, 5);
  console.log('batch 4 good beats: finished', !st.contracts.includes(c));
  if (st.contracts.includes(c)) throw new Error('batch contract not completed');
}

// level: keep 30 to 50 plates stored in a depot for 90 s (the core does not count)
{
  const { st, sim } = world();
  const c = contract(sim, 'level');
  c.lo = 30; c.hi = 50;
  const core = sim.core()!;
  const store = sim.place('storage', core.x + 5, core.y, 0)!;
  run(sim, 2, 0);
  store.store = { iron_plate: 70 };
  run(sim, 20, 0);
  if ((c.held ?? 0) > 0) throw new Error('a stock above the band counted');
  store.store = { iron_plate: 40 };
  run(sim, 92, 0);
  console.log('level at 40: finished', !st.contracts.includes(c));
  if (st.contracts.includes(c)) throw new Error('level contract not completed');
}

// offers: from mission 4 on, automation offers appear among the plain ones
{
  const { st, sim } = world();
  st.missionIndex = 4;
  let auto = 0;
  for (let i = 0; i < 60; i++) {
    st.contracts = [];
    st.nextContractAt = st.time;
    sim.tick(1 / 30);
    if (st.contracts[0]?.kind && st.contracts[0].kind !== 'amount') auto++;
  }
  console.log('automation offers', auto, 'of 60');
  if (auto < 10 || auto > 40) throw new Error('automation share off');
}
console.log('contracts check ok');
