// Tutorial steps of the story (chapters 1 to 3): when is a step done? DOM-free, used by the HUD and by tutorial:check.
import type { Sim } from './sim';

export const TUTORIAL_STEPS = 7;

export function tutorialStepDone(sim: Sim, step: number): boolean {
  const st = sim.state;
  switch (step) {
    case 0: // print a miner
      return sim.countBuildings('miner') >= 1;
    case 1: // a belt from the miner into the core
      return st.buildings.some((b) => b.type === 'miner' && sim.traceFlow(b).target?.type === 'core');
    case 2: // the first order (10 ore)
      return st.missionIndex >= 1;
    case 3: // a smelter, first plate delivered
      return sim.countBuildings('smelter') >= 1 && (st.delivered.iron_plate ?? 0) >= 1;
    case 4: // order 2: plates in number and at a steady rate
      return st.missionIndex >= 2;
    case 5: // a printer, first machine part delivered
      return sim.countBuildings('printer') >= 1 && (st.delivered.machine_part ?? 0) >= 1;
    case 6: // order 3
      return st.missionIndex >= 3;
  }
  return true;
}
