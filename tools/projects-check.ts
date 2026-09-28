// Headless check for research projects: extras open after their mission and cost printed parts.
import { MISSIONS, PROJECTS } from '../src/game/data';
import { Sim } from '../src/game/sim';
import { chapterState, newGame } from '../src/game/world';

// every building is unlocked by exactly one mission or project
{
  const seen = new Map<string, string>();
  for (const m of MISSIONS) for (const u of m.unlocks) seen.set(u, seen.has(u) ? 'twice' : m.id);
  for (const p of PROJECTS) for (const u of p.unlocks) seen.set(u, seen.has(u) ? 'twice' : p.id);
  const twice = [...seen].filter(([, v]) => v === 'twice');
  if (twice.length) throw new Error(`unlocked twice: ${twice.map(([k]) => k).join(', ')}`);
}

// chapter 4 (three missions done): sensors wait for their project, robots for mission 4
{
  const st = chapterState(4, { mode: 'story', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: false });
  const sim = new Sim(st);
  console.log('ch4 unlocked', st.unlockedBuildings.length, 'sensor', st.unlockedBuildings.includes('sensor'), 'p_sensor', sim.projectState('p_sensor'), 'p_robots', sim.projectState('p_robots'), 'p_display', sim.projectState('p_display'));
  // a chapter's projects are paid with what that chapter makes
  if (st.unlockedBuildings.includes('sensor')) throw new Error('sensor unlocked without its project');
  if (sim.projectState('p_sensor') !== 'open' || sim.projectState('p_robots') !== 'mission') throw new Error('project states wrong');
  st.inventory = {};
  if (sim.research('p_sensor')) throw new Error('research without parts');
  st.inventory = { copper_wire: 16, steel_frame: 3 };
  if (!sim.research('p_sensor') || !st.unlockedBuildings.includes('sensor') || st.inventory.steel_frame !== 1) throw new Error('research did not pay / unlock');
  if (sim.projectState('p_sensor') !== 'done') throw new Error('project not done');
  // the next chapter keeps finished projects
  const st5 = chapterState(5, { mode: 'story', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: false });
  if (st5.unlockedBuildings.includes('sensor')) throw new Error('fresh chapter 5 must not have the sensor');
}

// free play with everything unlocked: all projects count as done
{
  const st = newGame(5, { mode: 'free', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false });
  const sim = new Sim(st);
  const notDone = PROJECTS.filter((p) => sim.projectState(p.id) !== 'done');
  if (notDone.length) throw new Error(`all unlocked but open: ${notDone.map((p) => p.id).join(', ')}`);
}
console.log('projects check ok');
