// Does the KORA-vs-KORA match actually happen? Run PONG with no keys and count rallies / points.
import { Chip8, assemble } from '../src/game/chip8';
import { CHIP8_PROGRAMS } from '../src/game/chip8programs';
const c = new Chip8(assemble(CHIP8_PROGRAMS[0].source).rom);
let flips = 0, lastDx = 1;
for (let f = 0; f < 60 * 120; f++) {
  c.run(40);
  c.tickTimers();
  if (c.v[6] !== lastDx) { flips++; lastDx = c.v[6]; }
  if (c.halted) break;
}
console.log(`2 minutes KORA vs KORA: score ${c.v[8]}:${c.v[9]}, ball direction changes ${flips}, halted=${c.halted ?? 'no'}`);
