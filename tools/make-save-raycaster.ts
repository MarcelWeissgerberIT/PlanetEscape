// Writes saves/kora-ray.json from the playground example (see src/game/examples.ts).
import { writeFileSync } from 'node:fs';
import { buildRay } from '../src/game/examples';
import { Sim } from '../src/game/sim';
const st = buildRay();
const sim = new Sim(st);
const term = st.buildings.find((b) => b.type === 'terminal')!;
for (let i = 0; i < 90; i++) sim.tick(1 / 30);
const lit = st.buildings.filter((b) => b.type === 'lamp' && b.y >= term.y && sim.lampItem(b)).length;
if (sim.terminalHz(term) !== 60000 || lit < 60) throw new Error(`board: hz ${sim.terminalHz(term)} lit ${lit} ${term.status} ${sim.cpu(term)?.halted}`);
sim.resetTerminal(term);
st.time = 0;
writeFileSync('saves/kora-ray.json', JSON.stringify(st));
console.log('saves/kora-ray.json written:', st.buildings.length, 'buildings, lit', lit, 'hz', sim.terminalHz(term));
