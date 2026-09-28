// Headless run of KORA TRAILER: assembles, runs 35 s at 6 kHz without halting, scenes change, loops.
import { Chip8, assemble } from '../src/game/chip8';
import { CHIP8_PROGRAMS } from '../src/game/chip8programs';

const prog = CHIP8_PROGRAMS.find((p) => p.id === 'trailer')!;
const asm = assemble(prog.source);
if (asm.errors.length) throw new Error('asm: ' + asm.errors.slice(0, 5).join('; '));
console.log('rom', asm.rom.length, 'bytes');
const cpu = new Chip8(asm.rom);
const HZ = 6000;
const shot = () => {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) rows.push(Array.from({ length: 64 }, (_, x) => { const v = cpu.display[y * 64 + x]; return v ? v.toString(16) : '.'; }).join(''));
  return rows.join('\n');
};
let restarts = 0;
const snaps: string[] = [];
for (let sec = 0; sec < 35; sec++) {
  for (let f = 0; f < 60; f++) {
    for (let i = 0; i < HZ / 60; i++) {
      const pcBefore = cpu.pc;
      cpu.step();
      if (cpu.halted) throw new Error(`halted at ${sec}s: ${cpu.halted}`);
      if (cpu.pc === 0x200 && pcBefore !== 0x1fe) restarts++;
    }
    cpu.tickTimers();
  }
  if ([1, 7, 15, 22, 27, 31].includes(sec)) snaps.push(`--- ${sec + 1} s ---\n${shot()}`);
}
console.log(snaps.join('\n'));
const lit = (s: string) => (s.match(/[0-9a-f]/g) ?? []).length;
const counts = snaps.map(lit);
console.log('lit pixels per snapshot', counts.join(' '), 'restarts', restarts);
if (counts.some((c) => c < 20) || new Set(snaps.map((s) => s.slice(12))).size < snaps.length) throw new Error('scenes missing or identical');
if (restarts < 1) throw new Error('demo did not loop within 35 s');
console.log('trailer-check OK');
