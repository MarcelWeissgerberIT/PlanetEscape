// Generates saves/tic-tac-toe.json: a free-play save with a playable 3x3 tic-tac-toe board built from
// LED lamps, switches, overflow modules, tunnels and depots. Load it in the game via Menu -> Export/Import.
import { writeFileSync } from 'node:fs';
import { Sim } from '../src/game/sim';
import type { Building, Dir, ItemId } from '../src/game/types';
import { newGame } from '../src/game/world';

const st = newGame(20260927, { mode: 'free', mapSize: 'small', infiniteOre: true, allUnlocked: true, storms: false });
const sim = new Sim(st);
const core = st.buildings[0];
const ox = core.x + 6, oy = core.y - 5; // board origin (block grid), to the right of the core
const P = 4; // block pitch

// clear the whole area (deposits, rocks) so every element fits
for (let y = oy - 3; y < oy + 3 * P + 1; y++)
  for (let x = ox - 3; x < ox + 3 * P + 1; x++) {
    st.terrain[y * st.width + x] = 'ground';
    st.ore[y * st.width + x] = 0;
  }

const place = (type: Building['type'], x: number, y: number, dir: Dir): Building => {
  const b = sim.place(type, x, y, dir);
  if (!b) throw new Error(`cannot place ${type} at ${x},${y}: ${sim.placementError(type, x, y)}`);
  return b;
};

for (let r = 0; r < 3; r++) {
  // X row (iron plates): depot -> belt -> [tunnel under the O column -> overflow -> belt] x3
  const dx = place('storage', ox - 2, oy + r * P + 1, 1);
  dx.store = { iron_plate: 120 };
  place('conveyor', ox - 1, oy + r * P + 1, 1);
  for (let c = 0; c < 3; c++) {
    const bx = ox + c * P, by = oy + r * P;
    place('tunnel', bx, by + 1, 1); // entrance
    place('tunnel', bx + 2, by + 1, 1); // exit (auto-paired)
    place('overflow', bx + 3, by + 1, 1); // faces east: forward along the row, right (south) into the cell when the row is backed up
    place('switch', bx + 3, by + 2, 2).open = false; // X switch above the cell
    place('lamp', bx + 3, by + 3, 2); // the pixel (front = down, nothing there)
  }
}
for (let c = 0; c < 3; c++) {
  // O column (copper plates): depot -> belt -> [belt, belt (over the X tunnel), belt, overflow -> switch -> lamp] x3
  const dO = place('storage', ox + c * P + 1, oy - 2, 2);
  dO.store = { copper_plate: 120 };
  place('conveyor', ox + c * P + 1, oy - 1, 2);
  for (let r = 0; r < 3; r++) {
    const bx = ox + c * P, by = oy + r * P;
    place('conveyor', bx + 1, by + 0, 2);
    place('conveyor', bx + 1, by + 1, 2); // crosses above the X tunnel
    place('conveyor', bx + 1, by + 2, 2);
    place('overflow', bx + 1, by + 3, 2); // faces south: forward down the column, left (east) into the cell when the column is backed up
    place('switch', bx + 2, by + 3, 1).open = false; // O switch left of the cell (the next block's first belt continues the column)
  }
}

// let the rows and columns fill up so the first move is instant
for (let i = 0; i < 30 * 90; i++) sim.tick(1 / 30);
// nothing may have leaked into a lamp
const leaked = st.buildings.filter((b) => b.type === 'lamp' && sim.lampItem(b));
if (leaked.length) throw new Error(`lamps lit before any move: ${leaked.length}`);
// sanity: one move
const sw = st.buildings.find((b) => b.type === 'switch' && b.dir === 2)!;
sw.open = true;
for (let i = 0; i < 30 * 10; i++) sim.tick(1 / 30);
const lamp = sim.at(sw.x, sw.y + 1)!;
if (sim.lampItem(lamp) !== 'iron_plate') {
  const row = st.buildings.filter((b) => b.y === sw.y - 1 && b.type !== 'lamp').map((b) => `${b.type}@${b.x}:${b.status ?? ''}${b.items ? ' items=' + b.items.length : ''}${b.output && Object.keys(b.output).length ? ' out=' + Object.keys(b.output)[0] : ''}${b.pair !== undefined ? ' pair=' + b.pair : ''}`);
  console.error('row 0:', row.join(' | '));
  console.error('switch:', JSON.stringify(sw), 'lamp:', JSON.stringify(lamp));
  throw new Error('test move failed');
}
sw.open = false;
sim.clearLamp(lamp);
for (const b of st.buildings) if (b.type === 'switch') b.open = false;
// the switch still holds the next plate: give it back so the board starts clean
for (const b of st.buildings) if (b.type === 'switch') b.output = {};
st.time = 0;
st.inventory = { iron_plate: 200, copper_plate: 100, copper_wire: 40, machine_part: 20 };

writeFileSync('saves/tic-tac-toe.json', JSON.stringify(st));
console.log('saves/tic-tac-toe.json written:', st.buildings.length, 'buildings, board at', ox, oy);
