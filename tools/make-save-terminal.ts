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
sim.installAll(term); // 16 circuits and 6 crystals already delivered
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
// ---- block players: miners feed dividers, every k-th item pulses a rim switch (a pulse from the side flips the key) ----
// each lane: 4 chained miners on painted iron -> belt -> divider(k) -> belt -> into the switch's side
const belt = (x: number, y: number, dir: Dir) => place('conveyor', x, y, dir);
const lane = (row: number, endX: number, k: number) => {
  const x0 = tx - 30;
  for (let i = 0; i < 4; i++) {
    st.terrain[row * st.width + x0 + i] = 'iron_ore';
    st.ore[row * st.width + x0 + i] = 400;
  }
  for (let i = 0; i < 4; i++) place('miner', x0 + i, row, 1);
  for (let x = x0 + 4; x < tx - 9; x++) belt(x, row, 1);
  const d = place('divider', tx - 9, row, 1);
  d.value = k;
  for (let x = tx - 8; x <= endX; x++) belt(x, row, 1);
};
// key 1 (left up) and key 4 (left down): switches at (tx-1, ty) / (tx-1, ty+1), fed from the west
lane(ty, tx - 2, 3);
lane(ty + 1, tx - 2, 4);
// key C (right up): switch at (tx, ty+2), fed from the west through the rim corner tile
lane(ty + 2, tx - 1, 4);
// key D (right down): switch at (tx+1, ty+2) takes its pulse from the east: lane along row ty+8, then up column tx+2
lane(ty + 8, tx + 1, 5);
belt(tx + 2, ty + 8, 0);
for (let y = ty + 7; y >= ty + 3; y--) belt(tx + 2, y, 0);
belt(tx + 2, ty + 2, 3);
// power: terminal 6 + 16 miners x 2 = 38; core 10 + 8 solar x 4 = 42
for (let i = 0; i < 8; i++) place('solar', tx - 30 + i, ty + 11, 0);
st.focus = { x: tx - 8, y: ty + 4, zoom: 0.75 };
sim.setProgram(term, CHIP8_PROGRAMS[0].source);
term.run = true;
for (let i = 0; i < 30 * 5; i++) sim.tick(1 / 30);
const lit = st.buildings.filter((b) => b.type === 'lamp' && sim.lampItem(b)).length;
if (lit < 10) throw new Error(`display not driven: ${lit} lit lamps`);
sim.creative = false;
st.time = 0;
st.inventory = { iron_plate: 300, copper_plate: 150, copper_wire: 100, machine_part: 40, circuit: 20, glass: 20 };
st.options.infiniteOre = true;
st.note = {
  title: 'KORA Terminal · PONG',
  de: 'Links unten siehst du vier Bausteinspieler: Bohrer fördern Platten, ein Dividierer lässt jedes k-te Teil durch, und dieser Impuls schaltet einen Randschalter des Terminals um, also eine Taste. Zwei Bahnen drücken die linken Tasten 1/4, zwei die rechten C/D, jede in ihrem eigenen Rhythmus. Sie spielen blind, aber sie spielen.\n\nDas Terminal ist eine 8-Bit-Hauptplatine: 16 Schaltkreise sind als Speicherbänke eingebaut, 6 Quarze als Takt (600 Hz). Ohne diese Teile läuft nichts, neue Terminals bekommen sie per Band.\nEs führt PONG aus: KORA spielt beide Schläger, solange du keine Taste drückst. Übernimm eine Seite, wann du willst. Tippe es an: Im Panel siehst du den Bildschirm, ein Tastenfeld, Start/Pause, Neustart und „Programm“ mit dem Assembler-Editor (PONG, BRIX, Demo eingebaut).\\nSteuerung: Tastenfeld halten, Tastatur 1/Q (links hoch/runter) und 4/R (rechts hoch/runter), oder die vier Schalter am Rand des Terminals antippen (links: 1 und 4, unten: C und D).\\nDie 2048 LED-Lampen rechts sind das Display. Der Prozessor läuft mit deinem Strom: zu wenig Energie, und das Spiel wird langsamer.',
  en: 'Bottom left you see four block players: miners produce plates, a divider lets every k-th item through, and that pulse flips a rim switch of the terminal, i.e. a key. Two lanes press the left keys 1/4, two the right keys C/D, each in its own rhythm. They play blind, but they play.\n\nThe terminal is an 8-bit mainboard: 16 circuits are installed as memory banks, 6 crystals as the clock (600 Hz). Nothing runs without these parts; new terminals get them by belt.\nIt runs PONG: KORA plays both paddles while you press nothing. Take over a side whenever you like. Tap it: the panel shows the screen, a keypad, start/pause, restart and “Program” with the assembler editor (PONG, BRIX, demo built in).\\nControls: hold the keypad, keyboard 1/Q (left paddle up/down) and 4/R (right paddle), or tap the four switches on the terminal rim (left: 1 and 4, bottom: C and D).\\nThe 2048 LED lamps on the right are the display. The CPU runs on your power: too little energy and the game slows down.',
};
writeFileSync('saves/kora-terminal.json', JSON.stringify(st));
console.log('saves/kora-terminal.json written:', st.buildings.length, 'buildings, lit', lit);
