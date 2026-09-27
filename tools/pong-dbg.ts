import { Chip8, assemble, CHIP8_W } from '../src/game/chip8';
import { CHIP8_PROGRAMS } from '../src/game/chip8programs';
const asm = assemble(CHIP8_PROGRAMS[0].source);
console.log('errors', asm.errors, 'labels', Object.entries(asm.labels).map(([k, v]) => `${k}=${v.toString(16)}`).join(' '));
const c = new Chip8(asm.rom);
for (let f = 0; f < 40; f++) {
  c.run(10); c.tickTimers();
  if (f % 4 === 0) console.log(`f${f} pc=${c.pc.toString(16)} ball=(${c.v[4]},${c.v[5]}) dx=${c.v[6]} L=${c.v[2]} R=${c.v[3]} VB=${c.v[11]} VC=${c.v[12]} score=${c.v[8]}:${c.v[9]} lit=${c.display.reduce((a, b) => a + b, 0)}`);
}
