// Writes saves/kora-blocks.json from the playground example (see src/game/examples.ts).
import { writeFileSync } from 'node:fs';
import { buildBlocks } from '../src/game/examples';
import { Sim } from '../src/game/sim';
const st = buildBlocks();
const sim = new Sim(st);
const term = st.buildings.find((b) => b.type === 'terminal')!;
for (let i = 0; i < 30 * 4; i++) sim.tick(1 / 30);
const lit = st.buildings.filter((b) => b.type === 'lamp' && b.y >= term.y && sim.lampItem(b)).length;
const mem = sim.terminalMemory(term);
if (sim.terminalHz(term) !== 24000 || mem.have < mem.need || lit < 300) throw new Error(`board: hz ${sim.terminalHz(term)} mem ${JSON.stringify(mem)} lit ${lit} ${term.status} ${sim.cpu(term)?.halted}`);
sim.resetTerminal(term);
st.time = 0;
writeFileSync('saves/kora-blocks.json', JSON.stringify(st));
console.log('saves/kora-blocks.json written:', st.buildings.length, 'buildings, lit', lit, 'hz', sim.terminalHz(term), 'cells', mem.cells);
