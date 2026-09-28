// Headless check of KDOS: boots, echoes typed text, executes commands, scrolls, and RUN PONG raises EXEC 1.
import { Chip8, assemble, HIRES_W } from '../src/game/chip8';
import { CHIP8_PROGRAMS } from '../src/game/chip8programs';

const prog = CHIP8_PROGRAMS.find((p) => p.id === 'kdos')!;
const asm = assemble(prog.source);
if (asm.errors.length) throw new Error('asm: ' + asm.errors.slice(0, 5).join('; '));
console.log('rom', asm.rom.length, 'bytes');
const cpu = new Chip8(asm.rom);
const run = (frames: number) => {
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < 100; i++) { cpu.step(); if (cpu.halted) throw new Error('halted: ' + cpu.halted); }
    cpu.tickTimers();
  }
};
const type = (s: string) => { for (const ch of s) cpu.kbuf.push(ch === '\n' ? 13 : ch.charCodeAt(0)); };
const shot = () => { const rows: string[] = []; for (let y = 0; y < 64; y++) rows.push(Array.from({ length: 128 }, (_, x) => (cpu.fb[y * HIRES_W + x] ? '#' : '.')).join('')); return rows.join('\n'); };
const lit = () => cpu.fb.reduce((a, b) => a + (b ? 1 : 0), 0);
run(30);
if (!cpu.hires) throw new Error('not hi-res');
const boot = lit();
console.log('boot screen lit pixels', boot);
if (boot < 150) throw new Error('boot text missing');
type('HELP\n');
run(120);
const help = lit();
console.log('after HELP', help);
if (help <= boot) throw new Error('HELP printed nothing');
console.log(shot().split('\n').slice(0, 30).join('\n'));
type('ECHO HI\n');
run(60);
type('COLOR 9\n');
run(60);
if (cpu.v[5] !== 9) throw new Error('COLOR did not set the colour: ' + cpu.v[5]);
type('XYZ\n');
run(60);
for (let i = 0; i < 8; i++) { type('DIR\n'); run(200); }
console.log('after scrolling: cursor y', cpu.v[3], 'lit', lit());
if (cpu.v[3] !== 54) throw new Error('screen did not scroll to the last line');
type('RUN PONG\n');
run(60);
console.log('exec request', cpu.exec);
if (cpu.exec !== 1) throw new Error('RUN PONG did not request program 1');
console.log('kdos-check OK');
