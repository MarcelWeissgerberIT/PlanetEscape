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
const tx = core.x + 4, ty = core.y - 18; // terminal top-left; display spans tx+3 .. tx+66, ty .. ty+31
const place = (type: Building['type'], x: number, y: number, dir: Dir): Building => {
  const b = sim.place(type, x, y, dir);
  if (!b) throw new Error(`cannot place ${type} at ${x},${y}: ${sim.placementError(type, x, y)}`);
  return b;
};
const term = place('terminal', tx, ty, 0); // the CPU chip: memory and clock come from the board around it
// ---- mainboard: two oscillators on the chip's top edge, a bus trace east along row ty-1, a 16x18 field of registers as RAM ----
const osc1 = place('oscillator', tx, ty - 1, 0), osc2 = place('oscillator', tx + 1, ty - 1, 0);
osc1.clock = 3; osc2.clock = 3; // 6 crystals = 600 Hz
const RAM_X = tx + 9, RAM_Y = ty - 20, RAM_W = 16, RAM_H = 18; // 288 cells, PONG needs 274 bytes
for (let x = tx + 2; x <= RAM_X; x++) place('bus', x, ty - 1, 0);
place('bus', RAM_X, ty - 2, 0);
for (let y = 0; y < RAM_H; y++) for (let x = 0; x < RAM_W; x++) place('register', RAM_X + x, RAM_Y + y, 1);
for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) place('lamp', tx + 3 + x, ty + y, 0);
// keys: left paddle 1 (up) / 4 (down) on the left rim, right paddle C / D on the bottom rim
const keyAt = (x: number, y: number, key: number) => {
  const s = place('switch', x, y, 0);
  s.open = false;
  s.threshold = key;
  s.mode = 'pulse'; // each control item from the side holds the key for a quarter second
  return s;
};
keyAt(tx - 1, ty, 1);
keyAt(tx - 1, ty + 1, 4);
keyAt(tx, ty + 2, 0xc);
keyAt(tx + 1, ty + 2, 0xd);
// ---- block players: each lane is a small circuit that presses a rim switch for a whole stroke ----
// miners -> splitter: every other item is STORED in a register (its count shows as a badge), the rest goes through a
// divider(k) whose k-th item pulses the register's side. The register then releases all stored items as one burst into
// the switch's side; the switch is in pulse mode, so every item of the burst holds it open for half a second: one
// burst = one long key press, and k decides how far the paddle travels.
const belt = (x: number, y: number, dir: Dir) => place('conveyor', x, y, dir);
const X0 = tx - 30, XEND = tx - 12; // a lane module spans rows r-1..r+1 and columns X0..XEND; its output leaves XEND eastwards
const lane = (r: number, k: number) => {
  for (let i = 0; i < 4; i++) {
    st.terrain[r * st.width + X0 + i] = 'iron_ore';
    st.ore[r * st.width + X0 + i] = 400;
  }
  for (let i = 0; i < 4; i++) place('miner', X0 + i, r, 1);
  for (let x = X0 + 4; x < X0 + 8; x++) belt(x, r, 1);
  place('splitter', X0 + 8, r, 1); // left output (north) has nothing -> skipped; front -> register, right -> divider
  for (let x = X0 + 9; x < XEND - 1; x++) belt(x, r, 1);
  const reg = place('register', XEND - 1, r, 1);
  reg.recipe = 'iron_plate';
  belt(XEND, r, 1);
  // divider branch one row below, ending in a belt that turns north into the register's side
  for (let x = X0 + 8; x < X0 + 12; x++) belt(x, r + 1, 1);
  const d = place('divider', X0 + 12, r + 1, 1);
  d.value = k;
  for (let x = X0 + 13; x < XEND - 1; x++) belt(x, r + 1, 1);
  belt(XEND - 1, r + 1, 0);
};
const keys = [
  { key: 1, row: ty - 6, k: 2 }, // left paddle up
  { key: 4, row: ty + 1, k: 3 }, // left paddle down
  { key: 0xc, row: ty + 5, k: 2 }, // right paddle up
  { key: 0xd, row: ty + 10, k: 3 }, // right paddle down
];
for (const l of keys) lane(l.row, l.k);
// wires from the lane outputs to the four rim switches
// key 1: along row ty-6 to column tx-2, down to row ty, east into the switch at (tx-1, ty)
for (let x = XEND + 1; x < tx - 2; x++) belt(x, ty - 6, 1);
for (let y = ty - 6; y < ty; y++) belt(tx - 2, y, 2);
belt(tx - 2, ty, 1);
// key 4: straight along row ty+1 into the switch at (tx-1, ty+1)
for (let x = XEND + 1; x <= tx - 2; x++) belt(x, ty + 1, 1);
// key C: along row ty+5 to column tx-1, up to row ty+2, east into the switch at (tx, ty+2)
for (let x = XEND + 1; x < tx - 1; x++) belt(x, ty + 5, 1);
for (let y = ty + 5; y > ty + 2; y--) belt(tx - 1, y, 0);
belt(tx - 1, ty + 2, 1);
// key D: along row ty+10 to column tx+2 (between terminal and display), up to row ty+2, west into the switch at (tx+1, ty+2)
for (let x = XEND + 1; x < tx + 2; x++) belt(x, ty + 10, 1);
for (let y = ty + 10; y > ty + 2; y--) belt(tx + 2, y, 0);
belt(tx + 2, ty + 2, 3);
// the CPU, visible: 8x22 lamps above the terminal show PC, opcode, I and V0..VF as bits while the program runs
const tr = sim.terminalTraceRect(term);
for (let y = 0; y < tr.h; y++) for (let x = 0; x < tr.w; x++) place('lamp', tr.x + x, tr.y + y, 0);
// power: terminal 6 + 16 miners x 2 = 38 (+ splitters/logic); core 10 + 12 solar x 4 = 58
for (let i = 0; i < 12; i++) place('solar', X0 + i, ty + 14, 0);
st.focus = { x: tx + 6, y: ty - 6, zoom: 0.5 };
sim.setProgram(term, CHIP8_PROGRAMS[0].source);
term.run = true;
let presses = 0, holdTicks = 0;
const rim = st.buildings.filter((b) => b.type === 'switch');
const was = new Map<number, boolean>();
for (let i = 0; i < 30 * 90; i++) {
  sim.tick(1 / 30);
  for (const s of rim) {
    const open = s.open !== false;
    if (open) holdTicks++;
    if (open && !was.get(s.id)) presses++;
    was.set(s.id, open);
  }
}
const lit = st.buildings.filter((b) => b.type === 'lamp' && sim.lampItem(b)).length;
if (lit < 10) throw new Error(`display not driven: ${lit} lit lamps`);
if (presses < 8) throw new Error(`block players idle: ${presses} presses in 90 s`);
console.log(`block players: ${presses} presses, avg hold ${(holdTicks / presses / 30).toFixed(2)} s`);
sim.resetTerminal(term);
for (let i = 0; i < 30 * 5; i++) sim.tick(1 / 30);
sim.creative = false;
st.time = 0;
st.inventory = { iron_plate: 300, copper_plate: 150, copper_wire: 100, machine_part: 40, circuit: 20, glass: 20 };
st.options.infiniteOre = true;
st.note = {
  title: 'KORA Terminal · PONG',
  de: 'Die CPU ist jetzt eine echte Platine aus Bauteilen: Der Chip in der Mitte (Terminal) trägt nur den 512-Byte-Interpreter. Sein Arbeitsspeicher ist das Feld aus 16×18 Speicherzellen oben rechts, jede Zelle ist ein Byte (0 bis 255 Teile), Adresse = Position in Lesereihenfolge ab 0x200. Die orange markierte Zelle ist der Programmzähler, die cyanfarbene das Indexregister I. Die CPU liest und schreibt die Zellen direkt. Kippe per Band ein Teil in eine Zelle, und das Programm ändert sich; ein Impuls von der Seite leert sie. Zwei Oszillatoren mit je 3 Quarzen oben am Chip geben 600 Hz, die Kupfer-Leiterbahn verbindet alles; die grüne Fläche zeigt, was verdrahtet ist.\n\nÜber dem Chip zeigen 8×22 Lampen bei jedem Takt PC, Opcode, I und die Register V0…VF als Bits. Tippe den Chip an: Im Panel stehen PC, der Befehl in Assembler und alle Register. „Trace 2 Hz“ bremst auf zwei Befehle pro Sekunde, „Schritt“ führt bei Pause einen Befehl aus, dann wandert die orange Markierung Zelle für Zelle durchs RAM.\n\nLinks: vier Bausteinspieler, je eine Schaltung pro Taste. Verteiler, Speicherzelle und Dividierer erzeugen aus Erz einen Schub Teile, der Randschalter hält die Taste pro Teil eine Viertelsekunde, der Schläger fährt eine ganze Strecke. Das Terminal führt PONG aus; KORA spielt jede Seite, die niemand drückt. Steuerung: Tastenfeld, Tastatur 1/Q und 4/R, oder die vier Randschalter (links 1 und 4, unten C und D). Die 2048 Lampen rechts sind das Display.',
  en: 'The CPU is now a real board made of parts: the chip in the middle (terminal) carries only the 512-byte interpreter. Its working memory is the 16×18 field of registers top right; every cell is one byte (0 to 255 items), address = position in reading order from 0x200. The cell outlined in orange is the program counter, the cyan one the index register I. The CPU reads and writes these cells directly. Drop an item into a cell by belt and the program changes; a pulse from the side empties it. Two oscillators with 3 crystals each on the chip’s top edge give 600 Hz, the copper trace wires everything together; the green board shows what is connected.\n\nAbove the chip 8×22 lamps show PC, opcode, I and the registers V0…VF as bits every tick. Tap the chip: the panel lists PC, the instruction in assembler and all registers. “Trace 2 Hz” slows it to two instructions per second, “Step” executes one instruction while paused, and the orange marker walks through the RAM cell by cell.\n\nLeft: four block players, one circuit per key. Splitter, register and divider turn ore into a burst of items, the rim switch holds the key a quarter second per item, and the paddle travels a whole stroke. The terminal runs PONG; KORA plays any side nobody presses. Controls: keypad, keyboard 1/Q and 4/R, or the four rim switches (left 1 and 4, bottom C and D). The 2048 lamps on the right are the display.',
};
writeFileSync('saves/kora-terminal.json', JSON.stringify(st));
const memInfo = sim.terminalMemory(term);
if (memInfo.cells !== RAM_W * RAM_H || sim.terminalHz(term) !== 600) throw new Error(`board not wired: ${JSON.stringify(memInfo)} hz ${sim.terminalHz(term)}`);
console.log('saves/kora-terminal.json written:', st.buildings.length, 'buildings, lit', lit, 'trace lamps', st.buildings.filter((b) => b.type === 'lamp' && b.y < ty).length, 'RAM cells', memInfo.cells, 'hz', sim.terminalHz(term));
