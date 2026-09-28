// Writes saves/tic-tac-toe.json from the playground example (see src/game/examples.ts).
import { writeFileSync } from 'node:fs';
import { buildTicTacToe } from '../src/game/examples';
const st = buildTicTacToe();
writeFileSync('saves/tic-tac-toe.json', JSON.stringify(st));
console.log('saves/tic-tac-toe.json written:', st.buildings.length, 'buildings');
