// Writes saves/kora-terminal.json from the playground example (see src/game/examples.ts) and checks the block players press keys.
import { writeFileSync } from 'node:fs';
import { buildPongBoard } from '../src/game/examples';
import { Sim } from '../src/game/sim';
const st = buildPongBoard();
const sim = new Sim(st);
const rim = st.buildings.filter((b) => b.type === 'switch');
const was = new Map<number, boolean>();
let presses = 0;
for (let i = 0; i < 30 * 60; i++) {
  sim.tick(1 / 30);
  for (const s of rim) {
    const open = s.open !== false;
    if (open && !was.get(s.id)) presses++;
    was.set(s.id, open);
  }
}
if (presses < 8) throw new Error(`block players idle: ${presses} presses in 60 s`);
const term = st.buildings.find((b) => b.type === 'terminal')!;
sim.resetTerminal(term);
st.time = 0;
writeFileSync('saves/kora-terminal.json', JSON.stringify(st));
console.log('saves/kora-terminal.json written:', st.buildings.length, 'buildings,', presses, 'key presses in 60 s, hz', sim.terminalHz(term), 'cells', sim.terminalMemory(term).cells);
