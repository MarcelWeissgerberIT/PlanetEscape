// Achievements: checked from the game state and the saved progress; unlocked ones are stored in the progress and,
// in the desktop app, reported to Steam (the ids are the Steam API names).
import { CHALLENGES, challengeMedal } from './data';
import { desktop } from './desktop';
import { loadProgress, type Progress } from './progress';
import type { Sim } from './sim';
import { kv } from './storage';

export interface AchievementDef {
  id: string;
  /** true when earned; `sim` is the running game, `p` the saved progress */
  check?: (sim: Sim, p: Progress) => boolean;
}

const real = (sim: Sim) => sim.state.options.mode !== 'playground' && !sim.creative;
const sumAcc = (sim: Sim, type: string) => sim.state.buildings.filter((b) => b.type === type).reduce((a, b) => a + (b.acc ?? 0), 0);
const gold = (id: string, p: Progress) => p.challenges?.[id] !== undefined && challengeMedal(id, p.challenges[id]) === 3;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'FIRST_PLATE', check: (s) => real(s) && (s.state.stats.delivered.iron_plate ?? 0) >= 1 },
  { id: 'FIRST_PART', check: (s) => real(s) && (s.state.stats.delivered.machine_part ?? 0) >= 1 },
  { id: 'CHAPTER_3', check: (_s, p) => !!p.stars[2] },
  { id: 'CHAPTER_6', check: (_s, p) => !!p.stars[5] },
  { id: 'THREE_STARS', check: (_s, p) => Object.values(p.stars).some((n) => n >= 3) },
  { id: 'LAUNCH', check: (s) => real(s) && s.state.launched },
  { id: 'FLIGHTS_5', check: (s) => real(s) && (s.state.flights ?? 0) >= 5 },
  { id: 'CONTRACTS_10', check: (s) => real(s) && s.state.contractsDone >= 10 },
  { id: 'AUTOMATION', check: (s) => real(s) && (s.state.autoContractsDone ?? 0) >= 1 },
  { id: 'RESEARCH_5', check: (s) => real(s) && (s.state.projects?.length ?? 0) >= 5 },
  { id: 'ROBOT_FLEET', check: (s) => real(s) && s.robots().length >= 3 },
  { id: 'SERVICE_50', check: (s) => real(s) && sumAcc(s, 'service') >= 50 },
  { id: 'RECYCLE_100', check: (s) => real(s) && sumAcc(s, 'recycler') >= 100 },
  { id: 'BIG_FACTORY', check: (s) => real(s) && s.state.buildings.length >= 500 },
  { id: 'GOLD_ANY', check: (_s, p) => CHALLENGES.some((c) => gold(c.id, p)) },
  { id: 'GOLD_ALL', check: (_s, p) => CHALLENGES.every((c) => gold(c.id, p)) },
  { id: 'SHARE' }, // unlocked when a challenge time is shared
];

const KEY = 'pe_progress_v1';

/** Earned achievements (id -> time). */
export function earned(): Record<string, number> {
  return loadProgress().achievements ?? {};
}

/** Store an achievement once; returns true when it is new. Reports it to Steam in the desktop app. */
export function unlock(id: string): boolean {
  const p = loadProgress();
  const map = (p.achievements ??= {});
  if (map[id]) {
    desktop()?.steam.activate(id); // Steam may have missed it (played offline or without Steam)
    return false;
  }
  map[id] = Date.now();
  kv.set(KEY, JSON.stringify(p));
  desktop()?.steam.activate(id);
  return true;
}

/** Check every achievement against the running game; returns the ids earned just now. */
export function checkAchievements(sim: Sim): string[] {
  const p = loadProgress();
  const have = p.achievements ?? {};
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) if (!have[a.id] && a.check?.(sim, p) && unlock(a.id)) fresh.push(a.id);
  return fresh;
}

/** On start: hand every stored achievement to Steam again (it keeps them; this only fills gaps). */
export function syncAchievementsToSteam() {
  const d = desktop();
  if (!d?.steam.available()) return;
  for (const id of Object.keys(earned())) d.steam.activate(id);
}
