// Headless check of the mainboard: registers wired to a terminal are its RAM, oscillators its clock.
import { CHIP8_PROGRAMS } from '../src/game/chip8programs';
import { assemble } from '../src/game/chip8';
import { Sim } from '../src/game/sim';
import type { Building, Dir } from '../src/game/types';
import { newGame } from '../src/game/world';

const st = newGame(7, { mode: 'free', mapSize: 'small', infiniteOre: true, allUnlocked: true, storms: false }, { w: 80, h: 60, blank: true });
const sim = new Sim(st);
sim.creative = true;
const core = st.buildings[0];
const tx = core.x - 20, ty = core.y - 20;
const place = (type: Building['type'], x: number, y: number, dir: Dir = 0): Building => {
  const b = sim.place(type, x, y, dir);
  if (!b) throw new Error(`cannot place ${type} at ${x},${y}: ${sim.placementError(type, x, y)}`);
  return b;
};
const term = place('terminal', tx, ty);
for (let i = 0; i < 6; i++) place('solar', tx - 8 + i, ty + 6);
const rom = assemble(CHIP8_PROGRAMS[0].source).rom;
const tick = (n: number) => { for (let i = 0; i < n; i++) sim.tick(1 / 30); };
tick(2);
if (term.status !== 'starved') throw new Error(`bare chip should be starved, is ${term.status}`);
// clock: two oscillators on a bus trace above the chip
place('bus', tx, ty - 1);
place('bus', tx + 2, ty - 1);
const o1 = place('oscillator', tx + 1, ty - 1), o2 = place('oscillator', tx + 3, ty - 1);
o1.clock = 3; o2.clock = 3;
tick(2);
if (sim.terminalHz(term) !== 600) throw new Error(`hz ${sim.terminalHz(term)}`);
if (term.status !== 'starved' || !term.missing?.includes('circuit')) throw new Error(`no RAM yet, status ${term.status} ${term.missing}`);
// RAM: a 16 x 18 field of registers right of the chip, joined by one trace
place('bus', tx + 2, ty);
const cells: Building[] = [];
for (let y = 0; y < 18; y++) for (let x = 0; x < 16; x++) cells.push(place('register', tx + 3 + x, ty + y, 1));
tick(3);
const mem = sim.terminalMemory(term);
if (mem.cells !== 288 || mem.have < mem.need) throw new Error(`memory ${JSON.stringify(mem)}`);
if (term.status !== 'ok' && term.status !== 'idle') throw new Error(`status ${term.status} ${term.missing}`);
// flashed: cell i shows rom byte i
const first = sim.board(term).cells;
for (let i = 0; i < rom.length; i++) if (first[i].value !== rom[i]) throw new Error(`cell ${i} = ${first[i].value}, rom ${rom[i]}`);
console.log('flashed', rom.length, 'bytes into', first.length, 'cells; pc cell', sim.cellAt(term, sim.cpu(term)!.pc)?.x);
// run: the CPU executes, register lamps and display follow
term.run = true;
tick(60);
const cpu = sim.cpu(term)!;
if (!cpu.cycles) throw new Error('cpu did not run');
console.log('cycles after 2 s:', cpu.cycles, 'halted:', cpu.halted);
// player writes a cell: memory changes next tick (self-modifying by conveyor)
const target = first[rom.length - 2];
target.value = 0x12; // JP 0x??? high byte -> whatever, the byte must reach memory
tick(1);
if (cpu.mem[0x200 + rom.length - 2] !== 0x12) throw new Error('player write did not reach memory');
console.log('player write reached memory');
// removing a cell shrinks memory: program no longer fits
sim.remove(cells[cells.length - 1]);
tick(2);
if (sim.terminalMemory(term).cells !== 287) throw new Error('cell count');
// reset re-flashes
place('register', cells[cells.length - 1].x, cells[cells.length - 1].y, 1);
sim.resetTerminal(term);
tick(1);
if (sim.board(term).cells[rom.length - 2].value !== rom[rom.length - 2]) throw new Error('reset did not re-flash');
console.log('board-check OK');
