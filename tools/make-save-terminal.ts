// Generates saves/kora-terminal.json: a free-play map with a KORA Terminal running PONG, a 64x32 lamp display,
// four rim switches wired as the PONG keys and solar power. Load it via Menu -> Export/Import.
import { writeFileSync } from 'node:fs';
import { CHIP8_PROGRAMS } from '../src/game/chip8programs';
import { Sim } from '../src/game/sim';
import type { Building, Dir } from '../src/game/types';
import { newGame } from '../src/game/world';

const st = newGame(80080, { mode: 'free', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 160, h: 96, blank: true });
const sim = new Sim(st);
sim.creative = true;
const core = st.buildings[0];
const tx = core.x - 30, ty = core.y - 40; // terminal top-left; display spans tx+3 .. tx+66, ty .. ty+31
const place = (type: Building['type'], x: number, y: number, dir: Dir): Building => {
  const b = sim.place(type, x, y, dir);
  if (!b) throw new Error(`cannot place ${type} at ${x},${y}: ${sim.placementError(type, x, y)}`);
  return b;
};
const term = place('terminal', tx, ty, 0);
for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) place('lamp', tx + 3 + x, ty + y, 0);
// keys: left paddle 1 (up) / 4 (down) on the left rim, right paddle C / D on the bottom rim
const keyAt = (x: number, y: number, key: number) => {
  const s = place('switch', x, y, 0);
  s.open = false;
  s.threshold = key;
  return s;
};
keyAt(tx - 1, ty, 1);
keyAt(tx - 1, ty + 1, 4);
keyAt(tx, ty + 2, 0xc);
keyAt(tx + 1, ty + 2, 0xd);
// power: the terminal needs 6, the core gives 10; add solar for headroom
for (let i = 0; i < 4; i++) place('solar', core.x - 6 + i, core.y + 5, 0);
sim.setProgram(term, CHIP8_PROGRAMS[0].source);
term.run = true;
for (let i = 0; i < 30 * 5; i++) sim.tick(1 / 30);
const lit = st.buildings.filter((b) => b.type === 'lamp' && sim.lampItem(b)).length;
if (lit < 10) throw new Error(`display not driven: ${lit} lit lamps`);
sim.creative = false;
st.time = 0;
st.inventory = { iron_plate: 300, copper_plate: 150, copper_wire: 100, machine_part: 40, circuit: 20, glass: 20 };
st.note = {
  title: 'KORA Terminal · PONG',
  de: 'Das Terminal (links vom großen Display) führt PONG aus. Tippe es an: Im Panel siehst du den Bildschirm, ein Tastenfeld, Start/Pause, Neustart und „Programm“ mit dem Assembler-Editor (PONG, BRIX, Demo eingebaut).\\nSteuerung: Tastenfeld halten, Tastatur 1/Q (links hoch/runter) und 4/R (rechts hoch/runter), oder die vier Schalter am Rand des Terminals antippen (links: 1 und 4, unten: C und D).\\nDie 2048 LED-Lampen rechts sind das Display. Der Prozessor läuft mit deinem Strom: zu wenig Energie, und das Spiel wird langsamer.',
  en: 'The terminal (left of the big display) runs PONG. Tap it: the panel shows the screen, a keypad, start/pause, restart and “Program” with the assembler editor (PONG, BRIX, demo built in).\\nControls: hold the keypad, keyboard 1/Q (left paddle up/down) and 4/R (right paddle), or tap the four switches on the terminal rim (left: 1 and 4, bottom: C and D).\\nThe 2048 LED lamps on the right are the display. The CPU runs on your power: too little energy and the game slows down.',
};
writeFileSync('saves/kora-terminal.json', JSON.stringify(st));
console.log('saves/kora-terminal.json written:', st.buildings.length, 'buildings, lit', lit);
