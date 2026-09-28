// Builds every playground example headlessly and checks the circuits do what their notes promise.
import { EXAMPLES, buildAdder, buildBinaryCounter, buildPongMatrix, buildRunningLight, buildVideoWall } from '../src/game/examples';
import { Sim } from '../src/game/sim';

for (const ex of EXAMPLES) {
  const st = ex.build();
  const sim = new Sim(st);
  for (let i = 0; i < 60; i++) sim.tick(1 / 30);
  console.log(`${ex.id.padEnd(8)} ${String(st.buildings.length).padStart(5)} buildings, ${st.width}x${st.height}, note ${st.note ? 'ok' : 'MISSING'}, creative ${sim.creative}`);
  if (!st.note || st.options.mode !== 'playground' || !sim.creative) throw new Error(`${ex.id}: bad state`);
}
// adder: 3 + 2 = 5 on the lamps
{
  const st = buildAdder();
  const sim = new Sim(st);
  const tick = (s: number) => { for (let i = 0; i < s * 30; i++) sim.tick(1 / 30); };
  const sw = st.buildings.filter((b) => b.type === 'switch').sort((a, b) => a.y - b.y);
  const tap = (s: typeof sw[0], n: number) => { for (let i = 0; i < n; i++) { s.open = true; tick(1.5); } };
  tap(sw[0], 3);
  tap(sw[2], 2);
  tick(3);
  const regs = st.buildings.filter((b) => b.type === 'register').sort((a, b) => a.y - b.y || a.x - b.x);
  console.log('registers before =:', regs.map((r) => r.value));
  if (regs[0].value !== 3 || regs[2].value !== 2) throw new Error('operands not stored');
  tap(sw[1], 1);
  tick(12);
  const sum = regs.find((r) => r.x === Math.max(...regs.map((q) => q.x)))!;
  const lamps = st.buildings.filter((b) => b.type === 'lamp').sort((a, b) => a.x - b.x).map((l) => (sim.lampItem(l) ? '1' : '0')).join('');
  console.log('sum register', sum.value, 'lamps', lamps);
  if (sum.value !== 5 || lamps !== '00000101') throw new Error('adder wrong');
}
// counter: the first lamp blinks far more often than the fourth
{
  const st = buildBinaryCounter();
  const sim = new Sim(st);
  const lamps = st.buildings.filter((b) => b.type === 'lamp').sort((a, b) => a.y - b.y);
  const on = lamps.map(() => 0);
  for (let i = 0; i < 30 * 120; i++) {
    sim.tick(1 / 30);
    lamps.forEach((l, k) => { if (sim.lampItem(l)) on[k]++; });
  }
  console.log('counter lamp lit ticks per stage:', on.join(' '));
  if (!(on[0] > on[1] && on[1] > on[2] && on[2] > on[3] && on[3] > 0)) throw new Error('counter stages do not halve');
}
// running light: items keep circling
{
  const st = buildRunningLight();
  const sim = new Sim(st);
  let lit = 0;
  for (let i = 0; i < 30 * 30; i++) {
    sim.tick(1 / 30);
    if (i % 30 === 0) lit += st.buildings.filter((b) => b.type === 'lamp' && sim.lampItem(b)).length;
  }
  const items = st.buildings.filter((b) => b.type === 'conveyor').reduce((a, b) => a + (b.items?.length ?? 0), 0);
  console.log('running light: items on the ring', items, 'lamp-lit samples', lit);
  if (items < 3 || lit < 5) throw new Error('ring not running');
}
// PONG on LED matrices: the 8x4 matrices show the screen (some pixels lit), keys reach the CPU
{
  const st = buildPongMatrix();
  const sim = new Sim(st);
  for (let i = 0; i < 90; i++) sim.tick(1 / 30);
  const mats = st.buildings.filter((b) => b.type === 'matrix');
  const lit = mats.reduce((a, m) => a + (m.px ?? []).filter((v) => v).length, 0);
  console.log('pong matrix: matrices', mats.length, 'lit pixels', lit);
  if (mats.length !== 32 || lit < 20) throw new Error('matrix display not driven');
}
// video wall: a synthetic frame lands on the matrices, the receiver reports live
{
  const st = buildVideoWall();
  const sim = new Sim(st);
  const rx = st.buildings.find((b) => b.type === 'screen')!;
  const r = sim.screenRect(rx);
  if (r.w !== 256 || r.h !== 128) throw new Error(`wall size ${r.w}x${r.h}`);
  const frame = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const i = (y * r.w + x) * 4; frame[i] = Math.min(255, x); frame[i + 1] = Math.min(255, y * 2 + 1); frame[i + 2] = 200; frame[i + 3] = 255; }
  sim.tick(1 / 30);
  sim.pushFrame(rx, frame, r.w, r.h);
  sim.tick(1 / 30);
  const m = st.buildings.find((b) => b.type === 'matrix' && b.x === r.x + 15 && b.y === r.y + 7)!;
  const v = m.px![255];
  console.log('video wall: last matrix pixel', '#' + v.toString(16).padStart(6, '0'), 'receiver', rx.status);
  if (v !== 0xffe199 || rx.status !== 'ok') throw new Error('frame not applied: ' + v.toString(16)); // white-yellow pixel tinted by copper wire phosphor
  // speakers wired, colour samples leave on the belt
  const spk = sim.speakersOf(rx);
  for (let i = 0; i < 30; i++) { sim.pushFrame(rx, frame, r.w, r.h); sim.tick(1 / 30); }
  const belt = st.buildings.find((b) => b.type === 'conveyor' && b.x === rx.x - 1 && b.y === rx.y)!;
  const onBelts = st.buildings.filter((b) => b.type === 'conveyor').reduce((a, b) => a + (b.items?.length ?? 0), 0);
  console.log('speakers', spk.length, 'gain', sim.receiverGain(rx), 'samples on belts after 1 s', onBelts, 'scan pos', JSON.stringify(sim.scanPos(rx)));
  if (spk.length !== 2 || sim.receiverGain(rx) !== 0.7 || onBelts < 2 || !belt) throw new Error('sampling or speakers broken');
  const stats = sim.screenStats(rx);
  console.log('wall stats: lanes', stats.lanes, 'hz', stats.hz, 'cap', Math.round(stats.capPx), 'need', Math.round(stats.needPx), 'buffer rows', stats.rows, '/', stats.h, 'budget', stats.budget);
  if (stats.lanes !== 8 || stats.hz !== 6100 || stats.capPx < stats.needPx || stats.rows !== 128) throw new Error('wall wiring wrong');
  if (stats.budget >= 40e6) throw new Error('phosphor not consumed');
  // supply arrives: the miners' ore reaches the receiver and refills phosphor
  const before = rx.budget!;
  rx.budget = 1;
  for (let i = 0; i < 30 * 40; i++) sim.tick(1 / 30);
  console.log('phosphor after 40 s of supply:', rx.budget, 'tint item', rx.recipe, '(was', before, ')');
  if ((rx.budget ?? 0) < 2e6 || rx.recipe !== 'copper_ore') throw new Error('supply chain broken');
  // auto-wiring: switch the wall to 32x32 (512x256 px) and let the game place what is missing
  {
    const st2 = buildVideoWall();
    const sim2 = new Sim(st2);
    const rx2 = st2.buildings.find((b) => b.type === 'screen')!;
    for (const m of st2.buildings) if (m.type === 'matrix') { m.value = 32; m.px = undefined; }
    const missBefore = sim2.screenMissing(rx2);
    const res = sim2.autoWireScreen(rx2);
    const after = sim2.screenStats(rx2);
    console.log('auto-wire at 32x32: missing', JSON.stringify(missBefore), '-> placed', JSON.stringify(res), 'rows', after.rows, '/', after.h, 'cap', Math.round(after.capPx), 'need', Math.round(after.needPx));
    if (res.incomplete || after.rows < after.h || after.capPx < after.needPx) throw new Error('auto-wire did not complete the wall');
  }
  // an unwired matrix stays dark: cut the lanes and push a frame
  const lanes = st.buildings.filter((b) => b.type === 'bus');
  for (const l of lanes) sim.remove(l);
  for (const m of st.buildings) if (m.type === 'matrix') { m.px = undefined; }
  rx.budget = 40e6;
  for (let i = 0; i < 5; i++) { sim.pushFrame(rx, frame, r.w, r.h); sim.tick(1 / 30); }
  const litCut = st.buildings.filter((b) => b.type === 'matrix').reduce((a, m) => a + (m.px ?? []).filter((v) => v).length, 0);
  console.log('lit pixels with the lanes cut:', litCut);
  if (litCut !== 0) throw new Error('unwired matrices still lit');
}
console.log('examples-check OK');
