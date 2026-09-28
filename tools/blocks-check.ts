// Headless check of KORA BLOCKS: assembles, generates a world whose RAM rows mirror the display, the player falls,
// walks, digs a block (carried count 1) and places it again.
import { Chip8, assemble } from '../src/game/chip8';
import { CHIP8_PROGRAMS } from '../src/game/chip8programs';

const prog = CHIP8_PROGRAMS.find((p) => p.id === 'blocks')!;
const asm = assemble(prog.source);
if (asm.errors.length) throw new Error('asm: ' + asm.errors.join('; '));
console.log('rom', asm.rom.length, 'bytes; world at 0x' + asm.labels.band0.toString(16), 'main at 0x' + asm.labels.main.toString(16));
if (asm.labels.band0 !== 0x240) throw new Error('world must start at RAM row 1');
const cpu = new Chip8(asm.rom);
const step = (n: number) => {
  for (let i = 0; i < n; i++) {
    cpu.step();
    if (cpu.halted) throw new Error('halted: ' + cpu.halted);
    if (cpu.cycles % 400 === 0) cpu.tickTimers(); // 24 kHz / 60
  }
};
// generation until the main loop
let gen = 0;
while (cpu.pc !== asm.labels.loop) {
  step(1);
  if (++gen > 400000) throw new Error('generation never finished');
}
console.log('world generated in', gen, 'instructions (', (gen / 24000).toFixed(1), 's at 24 kHz )');
const count = (v: number) => cpu.display.reduce((a, b) => a + (b === v ? 1 : 0), 0);
console.log('pixels: grass', count(4), 'dirt', count(2), 'stone', count(3), 'ore', count(9), 'wood', count(5), 'leaves', count(6), 'player', count(8));
if (count(4) < 60 || count(2) < 150 || count(3) < 200 || count(9) < 5) throw new Error('world looks wrong');
// RAM rows 1..32 mirror the display (ignoring the player plane and the counter digit)
for (let y = 0; y < 32; y++)
  for (let x = 0; x < 64; x++) {
    const m = cpu.mem[0x240 + y * 64 + x], d = cpu.display[y * 64 + x] & 7;
    if (m !== d && !(y < 5 && x < 8) && (m & 7) !== d) throw new Error(`mismatch at ${x},${y}: mem ${m} display ${d}`);
  }
const shot = () => {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) rows.push(Array.from({ length: 64 }, (_, x) => { const v = cpu.display[y * 64 + x]; return v ? v.toString(16) : '.'; }).join(''));
  return rows.join('\n');
};
step(24000 * 3); // 3 s: the player falls onto the ground (1 px per frame at 15 fps)
const y0 = cpu.v[3];
if (cpu.mem[0x240 + (y0 + 2) * 64 + cpu.v[2]] === 0 && y0 < 30) throw new Error('player floating at y ' + y0);
console.log(shot());
const x0 = cpu.v[2];
cpu.keyDown(9);
step(24000);
cpu.keyUp(9);
if (cpu.v[2] <= x0) throw new Error(`did not walk right: ${x0} -> ${cpu.v[2]}`);
console.log('walked', x0, '->', cpu.v[2], 'y', cpu.v[3]);
// dig the block ahead at feet level (facing right after walking), then put it back
const bx = cpu.v[2] + 1, by = cpu.v[3] + 1;
const was = cpu.mem[0x240 + by * 64 + bx];
cpu.keyDown(6);
step(6000);
cpu.keyUp(6);
if (!was || cpu.mem[0x240 + by * 64 + bx] !== 0 || cpu.v[6] < 1) throw new Error(`dig failed: was ${was}, now ${cpu.mem[0x240 + by * 64 + bx]}, carried ${cpu.v[6]}`);
if (cpu.display[by * 64 + bx] & 7) throw new Error('dug block still lit');
console.log('dug block', was, 'ahead; carried', cpu.v[6], 'type', cpu.v[7]);
cpu.keyDown(4);
step(6000);
cpu.keyUp(4);
if (cpu.v[6] !== 0 || cpu.mem[0x240 + by * 64 + bx] !== was || (cpu.display[by * 64 + bx] & 7) !== was) throw new Error(`place failed: carried ${cpu.v[6]}, cell ${cpu.mem[0x240 + by * 64 + bx]}`);
console.log('placed it back; carried', cpu.v[6]);
// dig below and fall into the hole
const fy = cpu.v[3];
cpu.keyDown(8);
step(6000);
cpu.keyUp(8);
step(12000);
if (cpu.v[3] !== fy + 1) throw new Error(`did not fall into the hole: ${fy} -> ${cpu.v[3]}`);
console.log('fell into the dug hole, y', fy, '->', cpu.v[3], 'carried', cpu.v[6]);
console.log(shot());
console.log('blocks-check OK');
