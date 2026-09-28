// Generates saves/kora-ray.json: a mainboard built from parts running KORA RAY, the first-person maze.
// Chip + 10 turbo oscillators (30 glass crystals = 60 kHz) + a 32x32 field of registers as RAM + 64x32 lamp display.
import { writeFileSync } from 'node:fs';
import { CHIP8_PROGRAMS } from '../src/game/chip8programs';
import { Sim } from '../src/game/sim';
import type { Building, Dir } from '../src/game/types';
import { newGame } from '../src/game/world';

const st = newGame(80081, { mode: 'free', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 160, h: 128, blank: true });
const sim = new Sim(st);
sim.creative = true;
const core = st.buildings[0];
const tx = core.x + 4, ty = core.y - 18;
const place = (type: Building['type'], x: number, y: number, dir: Dir = 0): Building => {
  const b = sim.place(type, x, y, dir);
  if (!b) throw new Error(`cannot place ${type} at ${x},${y}: ${sim.placementError(type, x, y)}`);
  return b;
};
const term = place('terminal', tx, ty);
// display and register lamps
for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) place('lamp', tx + 3 + x, ty + y);
const tr = sim.terminalTraceRect(term);
for (let y = 0; y < tr.h; y++) for (let x = 0; x < tr.w; x++) place('lamp', tr.x + x, tr.y + y);
// turbo bank: 10 oscillators in a row on the chip's top edge, 3 glass crystals each
const OSC = 10;
for (let i = 0; i < OSC; i++) {
  const o = place('oscillator', tx + i, ty - 1);
  o.turbo = 3;
}
// bus to the RAM field: 32x32 registers = 1024 bytes
const RAM_X = tx + OSC + 1, RAM_Y = ty - 34, RAM_W = 32, RAM_H = 32;
place('bus', tx + OSC, ty - 1);
place('bus', tx + OSC, ty - 2);
place('bus', tx + OSC, ty - 3); // touches the bottom-left RAM cell
for (let y = 0; y < RAM_H; y++) for (let x = 0; x < RAM_W; x++) place('register', RAM_X + x, RAM_Y + y, 1);
// keys on the rim: W A on the left, S D below, E on the right
const keyAt = (x: number, y: number, key: number) => {
  const s = place('switch', x, y);
  s.open = false;
  s.threshold = key;
  return s;
};
keyAt(tx - 1, ty, 5); // W forward
keyAt(tx - 1, ty + 1, 7); // A turn left
keyAt(tx, ty + 2, 8); // S back
keyAt(tx + 1, ty + 2, 9); // D turn right
keyAt(tx + 2, ty, 6); // E fire
// power: chip 6 + 10 oscillators = 16, core 10 + 2 solar
for (let i = 0; i < 3; i++) place('solar', tx - 6 + i, ty + 6);
sim.setProgram(term, CHIP8_PROGRAMS.find((p) => p.id === 'ray')!.source);
term.run = true;
for (let i = 0; i < 30 * 4; i++) sim.tick(1 / 30);
const lit = st.buildings.filter((b) => b.type === 'lamp' && b.y >= ty && sim.lampItem(b)).length;
const mem = sim.terminalMemory(term);
if (sim.terminalHz(term) !== 60000 || mem.cells !== RAM_W * RAM_H || mem.have < mem.need) throw new Error(`board: hz ${sim.terminalHz(term)} mem ${JSON.stringify(mem)}`);
if (lit < 60) throw new Error(`display not driven: ${lit} lit lamps, status ${term.status} ${sim.cpu(term)?.halted}`);
sim.resetTerminal(term);
sim.creative = false;
st.time = 0;
st.inventory = { iron_plate: 300, copper_plate: 150, copper_wire: 100, machine_part: 40, circuit: 20, glass: 30, quartz: 12 };
st.options.infiniteOre = true;
st.focus = { x: tx + 20, y: ty - 3, zoom: 0.4 };
st.note = {
  title: 'KORA RAY · Ego-Labyrinth',
  de: 'Ein Doom-artiger Gang in 64×32, gerechnet von der Platine aus Bauteilen: Der Chip wirft pro Bild 32 Strahlen durch ein 16×16-Labyrinth und zeichnet die Wände als Streifen, nahe Wände voll, ferne gepunktet, die Ausgangstür gestrichelt. Das kostet rund 4500 Befehle pro Bild, deshalb der Turbo: Die zehn Oszillatoren oben am Chip tragen je drei Glaskristalle, jeder 2 kHz, zusammen 60 kHz, also etwa 10 Bilder pro Sekunde. Der Speicher ist das 32×32-Feld aus Speicherzellen rechts oben (1024 Byte, das Programm braucht 1008): Code, Richtungstabelle, Sprites und das Labyrinth selbst liegen dort als Zahlen. Orange = Programmzähler, cyan = Indexregister.\n\nSteuerung: Chip antippen, dann Tastatur W (vor), S (zurück), A/D (drehen), E (feuern), oder die fünf Randschalter antippen (links W und A, unten S und D, rechts E). Ein Schalter bleibt gedrückt, bis du ihn wieder antippst. Lauf in die gestrichelte Tür, dann piept es, die Levelzahl erscheint und du startest neu.\n\nProbier: Zelle des Labyrinths per Band ändern (1 = Wand, 0 = frei, 2 = Tür), oder „Trace 2 Hz“ drücken und zusehen, wie der Programmzähler durch die Strahlenschleife läuft.',
  en: 'A Doom-style corridor in 64×32, computed by the board built from parts: each frame the chip casts 32 rays through a 16×16 maze and draws the walls as stripes, near walls solid, far walls dotted, the exit door dashed. That costs about 4500 instructions per frame, hence the turbo: the ten oscillators on the chip’s top edge hold three glass crystals each, 2 kHz apiece, 60 kHz in total, roughly 10 frames per second. The memory is the 32×32 field of registers top right (1024 bytes, the program needs 1008): code, direction table, sprites and the maze itself sit there as numbers. Orange = program counter, cyan = index register.\n\nControls: tap the chip, then keyboard W (forward), S (back), A/D (turn), E (fire), or tap the five rim switches (left W and A, bottom S and D, right E). A switch stays pressed until you tap it again. Walk into the dashed door: a beep, the level number, and you start again.\n\nTry: change a maze cell by belt (1 = wall, 0 = free, 2 = door), or press “Trace 2 Hz” and watch the program counter run through the ray loop.',
};
writeFileSync('saves/kora-ray.json', JSON.stringify(st));
console.log('saves/kora-ray.json written:', st.buildings.length, 'buildings, lit', lit, 'hz', sim.terminalHz(term), 'cells', mem.cells, 'rom', mem.need);
