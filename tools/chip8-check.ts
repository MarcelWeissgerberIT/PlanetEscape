import { Chip8, assemble, CHIP8_W } from '../src/game/chip8';
import { CHIP8_PROGRAMS } from '../src/game/chip8programs';

function lit(c: Chip8) {
  let n = 0;
  for (const p of c.display) n += p;
  return n;
}
function show(c: Chip8) {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    let r = '';
    for (let x = 0; x < CHIP8_W; x++) r += c.display[y * CHIP8_W + x] ? '#' : '.';
    rows.push(r);
  }
  return rows.join('\n');
}
/** frames at 60 Hz with ~10 instructions per frame tick (600 Hz) */
function frames(c: Chip8, n: number, keys: number[] = []) {
  for (const k of keys) c.keyDown(k);
  for (let f = 0; f < n; f++) {
    c.run(10);
    c.tickTimers();
    if (c.halted) break;
  }
  for (const k of keys) c.keyUp(k);
}
let failed = false;
for (const p of CHIP8_PROGRAMS) {
  const asm = assemble(p.source);
  if (asm.errors.length) {
    console.log(p.id, 'ASSEMBLE ERRORS:', asm.errors.slice(0, 5));
    failed = true;
    continue;
  }
  const c = new Chip8(asm.rom);
  frames(c, 120);
  const l0 = lit(c);
  const beforeKeys = show(c);
  frames(c, 60, p.id === 'pong' ? [1, 0xd] : [4]);
  frames(c, 600);
  const l1 = lit(c);
  console.log(`${p.id}: rom ${asm.rom.length} B, cycles ${c.cycles}, lit ${l0} -> ${l1}, halted=${c.halted ?? 'no'}, waiting=${c.waitingKey}`);
  if (c.halted) failed = true;
  if (process.env.SHOW === p.id) console.log(beforeKeys + '\n---\n' + show(c));
}
// paddle movement in pong: left paddle up must change the picture
{
  const c = new Chip8(assemble(CHIP8_PROGRAMS[0].source).rom);
  frames(c, 30);
  const a = show(c);
  frames(c, 30, [1]);
  const b = show(c);
  console.log('pong paddle moved:', a !== b);
}
// brix: bricks vanish over time
{
  const c = new Chip8(assemble(CHIP8_PROGRAMS[1].source).rom);
  frames(c, 10);
  const l0 = lit(c);
  // hold the paddle under the ball: simple bot, move toward ball x (V4) each frame
  for (let f = 0; f < 60 * 60; f++) {
    const bx = c.v[4], px = c.v[2];
    c.keys.fill(0);
    if (bx < px + 2) c.keys[4] = 1;
    else if (bx > px + 4) c.keys[6] = 1;
    c.run(10);
    c.tickTimers();
    if (c.halted) break;
  }
  console.log('brix: lit', l0, '->', lit(c), 'score', c.v[8], 'lives', c.v[9], 'halted', c.halted ?? 'no');
  if (process.env.SHOW === 'brix2') console.log(show(c));
}
if (failed) process.exit(1);
