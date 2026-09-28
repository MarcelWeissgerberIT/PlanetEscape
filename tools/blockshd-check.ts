// Headless check of KORA BLOCKS HD: hi-res mode, textured blocks over a sky, RAM rows mirror the map, walk, dig, place.
import { Chip8, assemble, HIRES_W } from '../src/game/chip8';
import { CHIP8_PROGRAMS } from '../src/game/chip8programs';

const prog = CHIP8_PROGRAMS.find((p) => p.id === 'blockshd')!;
const asm = assemble(prog.source);
if (asm.errors.length) throw new Error('asm: ' + asm.errors.slice(0, 5).join('; '));
console.log('rom', asm.rom.length, 'bytes; world at 0x' + asm.labels.band0.toString(16));
if (asm.labels.band0 !== 0x240) throw new Error('world must start at RAM row 1');
const cpu = new Chip8(asm.rom);
const step = (n: number) => {
  for (let i = 0; i < n; i++) {
    cpu.step();
    if (cpu.halted) throw new Error('halted: ' + cpu.halted);
    if (cpu.cycles % 400 === 0) cpu.tickTimers();
  }
};
let gen = 0;
while (cpu.pc !== asm.labels.loop) {
  step(1);
  if (++gen > 900000) throw new Error('generation never finished');
}
console.log('hires', cpu.hires, 'generated in', gen, 'instructions (', (gen / 24000).toFixed(1), 's at 24 kHz )');
if (!cpu.hires) throw new Error('not in hi-res mode');
const count = (v: number) => cpu.fb.reduce((a, b) => a + (b === v ? 1 : 0), 0);
console.log('hi-res pixels: sky', count(7), 'grass', count(4), 'dirt', count(2), 'stone', count(3), 'ore', count(9), 'white', count(8), 'dark', count(15), 'stone specks', count(8));
if (count(7) < 3000 || count(4) < 150 || count(2) < 500 || count(3) < 800 || count(9) < 20) throw new Error('world looks wrong');
// a block cell: 3 base pixels + 1 detail pixel; sky cells: 4 sky pixels; map mirrors memory
let bad = 0;
for (let y = 0; y < 32; y++)
  for (let x = 0; x < 64; x++) {
    const m = cpu.mem[0x240 + y * 64 + x];
    const tl = cpu.fb[(2 * y) * HIRES_W + 2 * x];
    if (y < 6 && x < 4) continue; // counter digit
    if ((m === 0 && tl !== 7 && tl !== 8 && tl !== 0) || (m !== 0 && tl !== m)) bad++;
  }
console.log('cells whose top-left pixel disagrees with memory:', bad);
if (bad > 8) throw new Error('map and picture disagree');
const shot = () => {
  const rows: string[] = [];
  for (let y = 0; y < 64; y++) rows.push(Array.from({ length: 128 }, (_, x) => { const v = cpu.fb[y * 128 + x]; return v ? v.toString(16) : '.'; }).join(''));
  return rows.join('\n');
};
step(24000 * 3);
const x0 = cpu.v[0xd], y0 = cpu.v[0xe];
if (cpu.mem[0x240 + (y0 + 2) * 64 + x0] === 0 && y0 < 30) throw new Error('player floating');
console.log(shot().split('\n').slice(20, 44).join('\n'));
cpu.keyDown(9);
step(24000);
cpu.keyUp(9);
console.log('walked', x0, '->', cpu.v[0xd], 'y', cpu.v[0xe]);
const bx = cpu.v[0xd] + 1, by = cpu.v[0xe] + 1;
const was = cpu.mem[0x240 + by * 64 + bx];
cpu.keyDown(6);
step(6000);
cpu.keyUp(6);
if (!was || cpu.mem[0x240 + by * 64 + bx] !== 0 || cpu.v[6] < 1) throw new Error(`dig failed: was ${was}, now ${cpu.mem[0x240 + by * 64 + bx]}, carried ${cpu.v[6]}`);
if (cpu.fb[(2 * by) * HIRES_W + 2 * bx] !== 7) throw new Error('dug cell is not sky: ' + cpu.fb[(2 * by) * HIRES_W + 2 * bx]);
console.log('dug', was, 'ahead, sky shows through; carried', cpu.v[6]);
cpu.keyDown(4);
step(6000);
cpu.keyUp(4);
if (cpu.v[6] !== 0 || cpu.mem[0x240 + by * 64 + bx] !== was || cpu.fb[(2 * by) * HIRES_W + 2 * bx] !== was) throw new Error('place failed');
console.log('placed it back; player pixel', cpu.fb[(2 * cpu.v[0xe]) * HIRES_W + 2 * cpu.v[0xd] + 1], '(8 = white)');
console.log('blockshd-check OK');
