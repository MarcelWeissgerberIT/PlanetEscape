// Headless check for the merger: three belts in, one out, fair turns, a sorter splits the mix again.
import { Sim } from '../src/game/sim';
import type { Building, Dir, ItemId } from '../src/game/types';
import { newGame } from '../src/game/world';

const st = newGame(3, { mode: 'playground', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 40, h: 40, blank: true });
const sim = new Sim(st);
sim.creative = true;
const place = (type: Building['type'], x: number, y: number, dir: Dir = 0) => {
  const b = sim.place(type, x, y, dir);
  if (!b) throw new Error(`cannot place ${type}: ${sim.placementError(type, x, y)}`);
  return b;
};
// merger facing east at (10,10): belt out to a sorter that sends iron to the side, the rest on to a hall
const m = place('merger', 10, 10, 1);
for (let x = 11; x < 15; x++) place('conveyor', x, 10, 1);
const sorter = place('sorter', 15, 10, 1);
sorter.recipe = 'iron_plate';
place('conveyor', 15, 9, 0); // sorter's left side (north) for the filtered item
const ironBox = place('storage', 15, 8, 0);
for (let x = 16; x < 18; x++) place('conveyor', x, 10, 1);
const rest = place('hall4', 18, 9, 1);
if (sim.accept(m, 'iron_plate', 3)) throw new Error('merger took an item from the front');
const fed: Partial<Record<ItemId, number>> = {};
const feed = (item: ItemId, d: Dir) => { if (sim.accept(m, item, d)) fed[item] = (fed[item] ?? 0) + 1; };
for (let i = 0; i < 30 * 40; i++) {
  feed('iron_plate', 1); // from behind (travelling east)
  feed('copper_plate', 2); // from the north side (travelling south)
  feed('circuit', 0); // from the south side (travelling north)
  sim.tick(1 / 30);
}
const iron = ironBox.store?.iron_plate ?? 0, copper = rest.store?.copper_plate ?? 0, circ = rest.store?.circuit ?? 0;
console.log('fed', JSON.stringify(fed), 'iron sorted out', iron, 'copper', copper, 'circuit', circ, 'iron in hall', rest.store?.iron_plate ?? 0);
if (!iron || !copper || !circ) throw new Error('an input starved');
const n = [fed.iron_plate!, fed.copper_plate!, fed.circuit!];
if (Math.max(...n) - Math.min(...n) > 2) throw new Error('merger turns not fair');
if (rest.store?.iron_plate) throw new Error('sorter did not split the mix');
console.log('merger check ok');
