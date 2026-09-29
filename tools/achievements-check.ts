// Achievements: the checks fire from the game state and the saved progress, each one only once, and every id has texts.
import { ACHIEVEMENTS, checkAchievements, earned, unlock } from '../src/game/achievements';
import { exportProgress, importProgress, loadProgress, recordChallenge, recordChapter } from '../src/game/progress';
import { Sim } from '../src/game/sim';
import { t } from '../src/i18n';
import { newGame } from '../src/game/world';

// browser storage stand-in (the node checks have no localStorage)
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };

for (const a of ACHIEVEMENTS) {
  if (!/^[A-Z0-9_]+$/.test(a.id)) throw new Error(`${a.id}: not a Steam API name`);
  if (t(`ach_${a.id}` as 'ach_FIRST_PLATE') === `ach_${a.id}` || t(`ach_${a.id}_desc` as 'ach_FIRST_PLATE_desc') === `ach_${a.id}_desc`) throw new Error(`${a.id}: texts missing`);
}
const st = newGame(3, { mode: 'free', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 48, h: 48, blank: true });
const sim = new Sim(st);
if (checkAchievements(sim).length) throw new Error('achievements at the start of a game');
st.stats.delivered.iron_plate = 1;
const a = checkAchievements(sim);
console.log('after the first plate:', a);
if (a.join() !== 'FIRST_PLATE') throw new Error('FIRST_PLATE did not fire alone');
if (checkAchievements(sim).length) throw new Error('an achievement fired twice');
recordChapter(2, 500, 1);
recordChallenge('c_drills', 100);
const b = checkAchievements(sim);
console.log('after chapter 3 and a gold medal:', b);
if (!b.includes('CHAPTER_3') || !b.includes('GOLD_ANY') || b.includes('GOLD_ALL')) throw new Error('progress achievements wrong');
if (!unlock('SHARE') || unlock('SHARE')) throw new Error('manual unlock not once');
// the playground earns nothing
const pg = new Sim(newGame(4, { mode: 'playground', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w: 40, h: 40, blank: true }));
pg.state.stats.delivered.machine_part = 5;
if (checkAchievements(pg).includes('FIRST_PART')) throw new Error('the playground earned an achievement');
console.log('earned', Object.keys(earned()).length, 'of', ACHIEVEMENTS.length);

// demo progress goes into the full game as a code: merged, the better value wins, nothing is lost
const demoCode = exportProgress();
mem.clear();
recordChapter(0, 900, 1);
recordChapter(2, 9999, 1);
recordChallenge('c_drills', 300);
if (importProgress('PE1.xyz') || importProgress('PEP1.%%%') || importProgress('hello')) throw new Error('an invalid code was taken');
if (!importProgress(demoCode)) throw new Error('the demo code was refused');
const merged = loadProgress();
console.log('merged progress:', JSON.stringify({ stars: merged.stars, best: merged.best, challenges: merged.challenges, ach: Object.keys(merged.achievements ?? {}).length }));
if (merged.stars[0] === undefined || merged.best[2] !== 500 || merged.challenges?.c_drills !== 100) throw new Error('progress merge wrong');
if (!merged.achievements?.CHAPTER_3 || !merged.achievements.SHARE) throw new Error('achievements not carried over');
console.log('achievements check ok');
