// Headless check for the circuit helpers: timer switch, light barrier, radio bridge and battery.
import { BATTERY_RATE, RADIO_QUEUE } from '../src/game/data';
import { Sim } from '../src/game/sim';
import type { Building, Dir, GameState } from '../src/game/types';
import { newGame } from '../src/game/world';

function world() {
  const st: GameState = newGame(7, { mode: 'playground', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 48, h: 48, blank: true });
  const sim = new Sim(st);
  sim.creative = true;
  const place = (type: Building['type'], x: number, y: number, dir: Dir = 0): Building => {
    const b = sim.place(type, x, y, dir);
    if (!b) throw new Error(`cannot place ${type} at ${x},${y}: ${sim.placementError(type, x, y)}`);
    return b;
  };
  const tick = (s: number) => { for (let i = 0; i < Math.round(s * 30); i++) sim.tick(1 / 30); };
  const count = (d: Building) => Object.values(d.store ?? {}).reduce((a, c) => a + (c ?? 0), 0);
  return { st, sim, place, tick, count };
}

// timer: a depot feeds a column south through a timer (period 2 s) into a sink; a plain belt column next to it is the reference
{
  const w = world();
  const src = w.place('storage', 4, 4, 2);
  src.store = { copper_wire: 200 };
  w.place('conveyor', 4, 5, 2);
  const timer = w.place('timer', 4, 6, 2);
  timer.threshold = 2;
  w.place('conveyor', 4, 7, 2);
  const sink = w.place('storage', 4, 8, 2);
  const ref = w.place('storage', 8, 4, 2);
  ref.store = { copper_wire: 200 };
  for (let y = 5; y < 8; y++) w.place('conveyor', 8, y, 2);
  const refSink = w.place('storage', 8, 8, 2);
  let openings = 0, wasOpen = false;
  for (let i = 0; i < 30 * 12; i++) {
    w.sim.tick(1 / 30);
    const open = timer.open !== false;
    if (open && !wasOpen) openings++;
    wasOpen = open;
  }
  console.log('timer: openings in 12 s', openings, '| gated', w.count(sink), 'vs free belt', w.count(refSink));
  if (openings < 5 || openings > 7) throw new Error('timer period wrong');
  if (w.count(sink) < 3 || w.count(sink) >= w.count(refSink)) throw new Error('timer gate does not gate');
}

// sensor: items run through to the sink, every item flips the switch beside the sensor and releases the register on the other side
{
  const w = world();
  const src = w.place('storage', 10, 4, 2);
  src.store = { copper_wire: 200 };
  w.place('conveyor', 10, 5, 2);
  const sensor = w.place('sensor', 10, 6, 2);
  w.place('conveyor', 10, 7, 2);
  const sink = w.place('storage', 10, 8, 2);
  const sw = w.place('switch', 11, 6, 2); // east of the sensor, facing south
  sw.open = false;
  const reg = w.place('register', 9, 6, 2); // west of the sensor, outputs south (the pulse arrives at its side)
  reg.value = 3;
  reg.recipe = 'glass';
  w.place('conveyor', 9, 7, 2);
  const regSink = w.place('storage', 9, 8, 2);
  w.tick(6);
  const passed = sensor.acc ?? 0;
  console.log('sensor: passed', passed, 'sink', w.count(sink), 'switch open', sw.open, 'register value', reg.value, 'released', w.count(regSink));
  if (passed < 5 || w.count(sink) < passed - 4) throw new Error('sensor does not pass items');
  if ((sw.open !== false) !== (passed % 2 === 1)) throw new Error('sensor did not flip the switch per item');
  if (reg.value !== 0 || w.count(regSink) !== 3) throw new Error('sensor did not release the register');
}

// sensor fed from the side: belt runs east into a sensor that points south
{
  const w = world();
  const src = w.place('storage', 20, 10, 1);
  src.store = { quartz: 50 };
  w.place('conveyor', 21, 10, 1);
  w.place('conveyor', 22, 10, 1);
  const sensor = w.place('sensor', 23, 10, 2);
  w.place('conveyor', 23, 11, 2);
  const sink = w.place('storage', 23, 12, 2);
  w.tick(6);
  console.log('sensor (side feed): passed', sensor.acc, 'sink', w.count(sink));
  if ((sensor.acc ?? 0) < 5 || w.count(sink) < 3) throw new Error('sensor does not take a belt from the side');
}

// radio: transmitter in one corner, receiver in the other, same channel; a second channel stays silent
{
  const w = world();
  const src = w.place('storage', 4, 20, 1);
  src.store = { circuit: 200 };
  w.place('conveyor', 5, 20, 1);
  const tx = w.place('radio', 6, 20, 1);
  tx.threshold = 3;
  const rx = w.place('radio', 40, 40, 1);
  rx.mode = 'rx';
  rx.threshold = 3;
  w.place('conveyor', 41, 40, 1);
  const sink = w.place('storage', 42, 40, 1);
  const other = w.place('radio', 40, 30, 1);
  other.mode = 'rx';
  other.threshold = 4;
  w.place('conveyor', 41, 30, 1);
  const otherSink = w.place('storage', 42, 30, 1);
  w.tick(10);
  const q = w.sim.radioQueue(3).length;
  console.log('radio: sent', tx.acc, 'received', rx.acc, 'in flight', q, 'sink', w.count(sink), 'other channel', w.count(otherSink));
  if ((rx.acc ?? 0) < 15 || w.count(sink) < (rx.acc ?? 0) - 2) throw new Error('receiver does not deliver');
  if ((tx.acc ?? 0) !== (rx.acc ?? 0) + q || q > RADIO_QUEUE) throw new Error('channel accounting off');
  if (w.count(otherSink) !== 0) throw new Error('channels leak');
}

// battery: two solars (plus the core's base power) charge it at the rate cap, then the solars go and four radios overload the grid
{
  const w = world();
  const s1 = w.place('solar', 20, 20);
  const s2 = w.place('solar', 21, 20);
  const bat = w.place('battery', 22, 20);
  w.tick(10);
  const charged = bat.value ?? 0;
  console.log('battery: charge after 10 s of surplus', charged.toFixed(1), 'supply', w.st.powerSupply, 'demand', w.st.powerDemand);
  if (Math.abs(charged - BATTERY_RATE * 10) > 1) throw new Error('battery does not charge at its rate');
  w.sim.remove(s1);
  w.sim.remove(s2);
  w.tick(1);
  const base = w.st.powerSupply;
  const before = bat.value ?? 0; // the core's base power keeps charging it meanwhile
  for (let i = 0; i < 4; i++) w.place('radio', 24 + i, 20, 1);
  w.tick(5);
  const deficit = w.st.powerDemand - base;
  console.log('battery: after 5 s on battery', (bat.value ?? 0).toFixed(1), 'base', base, 'supply', w.st.powerSupply, 'demand', w.st.powerDemand, 'deficit', deficit);
  if (deficit <= 0) throw new Error('test needs an overloaded grid');
  if (w.st.powerSupply < w.st.powerDemand) throw new Error('battery does not cover the deficit');
  if (Math.abs(before - deficit * 5 - (bat.value ?? 0)) > 1.5) throw new Error('battery discharge rate off');
  w.tick(120);
  console.log('battery: drained', (bat.value ?? 0).toFixed(1), 'supply', w.st.powerSupply);
  if ((bat.value ?? 0) !== 0 || w.st.powerSupply !== base) throw new Error('battery does not run empty');
}
console.log('parts check ok');
