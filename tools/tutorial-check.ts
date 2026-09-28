// The story tutorial can be played through: the solver plays chapters 1 to 3 like a player following the steps,
// the steps advance with the same conditions the HUD uses, and every step is reached in its chapter.
import { MISSIONS } from '../src/game/data';
import { Sim } from '../src/game/sim';
import { solveOrder } from '../src/game/solver';
import { TUTORIAL_STEPS, tutorialStepDone } from '../src/game/tutorial';
import type { GameState } from '../src/game/types';
import { tTutorial } from '../src/i18n';
import { levelState } from '../src/game/world';

if (tTutorial().length !== TUTORIAL_STEPS) throw new Error(`tutorial texts ${tTutorial().length} vs steps ${TUTORIAL_STEPS}`);
const options = { mode: 'story', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: false } as const;
let st: GameState = levelState(null, 0, options);
if (st.tutorialStep !== 0) throw new Error('a new story does not start the tutorial');
const reached: string[] = [];
for (let ch = 1; ch <= 3; ch++) {
  const sim = new Sim(st);
  let log = solveOrder(sim, 6);
  let secs = 0;
  while (secs < 900 && st.missionIndex < ch) {
    sim.tick(1 / 30);
    secs += 1 / 30;
    while (st.tutorialStep >= 0 && st.tutorialStep < TUTORIAL_STEPS && tutorialStepDone(sim, st.tutorialStep)) {
      reached.push(`step ${st.tutorialStep + 1} in chapter ${ch} at ${Math.round(secs)} s`);
      st.tutorialStep++;
    }
    if (!log.ok && Math.round(secs * 30) % (120 * 30) === 0) log = solveOrder(sim, 6);
  }
  if (st.missionIndex < ch) throw new Error(`chapter ${ch} not finished`);
  // the HUD checks once more after the mission switch, then the next chapter map loads
  while (st.tutorialStep >= 0 && st.tutorialStep < TUTORIAL_STEPS && tutorialStepDone(sim, st.tutorialStep)) {
    reached.push(`step ${st.tutorialStep + 1} at the end of chapter ${ch}`);
    st.tutorialStep++;
  }
  if (ch < 3) st = levelState(st, ch, options);
}
console.log(reached.join('\n'));
if (st.tutorialStep < TUTORIAL_STEPS) throw new Error(`tutorial stuck at step ${st.tutorialStep + 1}: ${tTutorial()[st.tutorialStep].title}`);
// the texts name the numbers the orders really ask for
const text = tTutorial().map((s) => s.text).join(' ');
for (const m of MISSIONS.slice(1, 3)) for (const [, n] of Object.entries(m.rate ?? {})) if (!text.includes(`${n}`)) throw new Error(`tutorial does not mention the rate ${n} of ${m.id}`);
console.log('tutorial check ok');
