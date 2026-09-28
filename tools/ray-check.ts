// Headless check of KORA RAY: it assembles, the maze is solvable, walls are drawn, turning changes the view, the door wins.
import { Chip8, assemble } from '../src/game/chip8';
import { CHIP8_PROGRAMS, RAY_MAP } from '../src/game/chip8programs';

const prog = CHIP8_PROGRAMS.find((p) => p.id === 'ray')!;
const asm = assemble(prog.source);
if (asm.errors.length) throw new Error('asm: ' + asm.errors.join('; '));
console.log('rom', asm.rom.length, 'bytes; labels', Object.keys(asm.labels).length);
// maze solvable from (1,1) to the door
const q = [[1, 1]];
const seen = new Set(['1,1']);
let door = false;
while (q.length && !door) {
  const [x, y] = q.shift()!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy, c = RAY_MAP[ny]?.[nx];
    if (!c || c === '#' || seen.has(`${nx},${ny}`)) continue;
    if (c === 'D') door = true;
    seen.add(`${nx},${ny}`);
    q.push([nx, ny]);
  }
}
if (!door) throw new Error('door not reachable');
const cpu = new Chip8(asm.rom);
const shot = () => {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) rows.push(Array.from({ length: 64 }, (_, x) => (cpu.display[y * 64 + x] ? '#' : '.')).join(''));
  return rows;
};
const lit = () => cpu.display.reduce((a, b) => a + b, 0);
const runFrames = (n: number) => {
  for (let f = 0; f < n; f++) {
    for (let i = 0; i < 2000 && !cpu.halted; i++) cpu.step();
    cpu.tickTimers();
    if (cpu.halted) throw new Error('halted: ' + cpu.halted);
  }
};
runFrames(20);
// real frame cost: instructions between two passes of the loop label
let frames = 0, c0 = -1;
while (frames < 12) {
  cpu.step();
  if (cpu.pc === asm.labels.loop) {
    if (c0 < 0) c0 = cpu.cycles;
    frames++;
  }
  if (cpu.cycles % 2000 === 0) cpu.tickTimers();
}
const perFrame = Math.round((cpu.cycles - c0) / (frames - 1));
console.log('instructions per frame', perFrame, '-> at 60 kHz', (60000 / perFrame).toFixed(1), 'fps');
const a = shot();
console.log(a.join('\n'));
if (lit() < 60) throw new Error(`too few pixels: ${lit()}`);
cpu.keyDown(7);
runFrames(30);
cpu.keyUp(7);
runFrames(10);
const b = shot();
if (a.join() === b.join()) throw new Error('turning left changed nothing');
console.log('turned:');
console.log(b.join('\n'));
// win: stand west of the door facing east, walk in
cpu.v[2] = 0xd8;
cpu.v[3] = 0xd8;
cpu.v[4] = 0;
runFrames(5);
const before = shot();
console.log('at the door:');
console.log(before.join('\n'));
cpu.keyDown(5);
runFrames(4);
cpu.keyUp(5);
if (cpu.mem[asm.labels.lvl] !== 1) throw new Error(`level counter ${cpu.mem[asm.labels.lvl]}`);
runFrames(70);
if (cpu.v[2] !== 0x18 || cpu.v[3] !== 0x18) throw new Error(`not back at start: ${cpu.v[2].toString(16)},${cpu.v[3].toString(16)}`);
console.log('door reached, level 1, cycles', cpu.cycles, 'ray-check OK');
