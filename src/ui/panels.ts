// Small pieces of the building panel: wear gauge, unlock note, terminal CPU state.
import { BUILDINGS, MISSIONS, PROJECTS, REPAIR_COST } from '../game/data';
import type { Sim } from '../game/sim';
import type { Building, BuildingId } from '../game/types';
import { disasm } from '../game/chip8';
import { t } from '../i18n';
import { costHtml } from './dom';

/** Wear gauge with the repair button for machines and miners. */
export function wearHtml(sim: Sim, b: Building): string {
  const def = BUILDINGS[b.type];
  if ((def.kind !== 'machine' && def.kind !== 'miner') || !sim.wearOn()) return '';
  const w = b.wear ?? 0;
  const st = sim.state;
  const reach = sim.inReach(b.x, b.y, def.size);
  const auto = st.autoRepair !== false;
  const pct = Math.round(w * 100);
  return `<div class="wear-card ${w >= 1 ? 'worn' : w >= 0.7 ? 'warn' : ''}">
    <div class="wear-top"><small>${t('wear')}</small><b>${pct}<span> %</span></b>
      <button class="sw-row wear-auto" data-act="auto-repair"><span>${t('wear_drones')}</span><span class="sw-mini ${auto ? 'on' : ''}"><i></i></span></button></div>
    <span class="wear-bar"><i style="width:${pct}%"></i></span>
    <div class="wear-foot"><em class="clamp2" data-more>${w >= 1 ? t('wear_worn') + ' ' : ''}${reach ? (auto ? t('wear_auto') : t('wear_auto_off')) : t('wear_far')}</em>
      <button class="wear-fix ${w >= 1 ? 'hot' : ''}" data-act="repair" ${sim.canRepair(b) ? '' : 'disabled'}><b>${t('repair')}</b><span>${costHtml(REPAIR_COST, st.inventory)}</span></button></div>
  </div>`;
}

/** Where something gets unlocked: "from the start" or the mission that unlocks it. */
export function unlockNote(sim: Sim, kind: 'recipe' | 'building', id: string): string {
  const st = sim.state;
  const have = kind === 'recipe' ? st.unlockedRecipes.includes(id) : st.unlockedBuildings.includes(id as BuildingId);
  if (have) return '';
  const idx = MISSIONS.findIndex((m) => (kind === 'recipe' ? m.unlockRecipes.includes(id) : m.unlocks.includes(id as BuildingId)));
  const proj = kind === 'building' ? PROJECTS.find((p) => p.unlocks.includes(id as BuildingId)) : undefined;
  if (proj) return `<span class="bp-lock">🔒 ${t('bp_unlock_project', { p: t(`proj_${proj.id}` as 'proj_p_sensor'), n: proj.after })}</span>`;
  return idx >= 0 ? `<span class="bp-lock">🔒 ${t('bp_unlock_after', { n: idx + 1 })}</span>` : `<span class="bp-lock">🔒</span>`;
}

/** PC, current instruction and registers of a terminal's CPU. */
export function cpuStateHtml(sim: Sim, b: Building): string {
  const cpu = sim.cpu(b);
  if (!cpu) return '';
  const op = (cpu.mem[cpu.pc] << 8) | cpu.mem[cpu.pc + 1];
  const hx = (v: number, w: number) => v.toString(16).toUpperCase().padStart(w, '0');
  const regs = Array.from(cpu.v).map((v, i) => `<span><small>V${i.toString(16).toUpperCase()}</small>${hx(v, 2)}</span>`).join('');
  return `<div class="cpu-line"><span><small>PC</small>${hx(cpu.pc, 3)}</span><span><small>OP</small>${hx(op, 4)}</span><span class="mn">${disasm(op)}</span><span><small>I</small>${hx(cpu.i, 3)}</span><span><small>DT</small>${cpu.dt}</span><span><small>${t('term_cycles')}</small>${cpu.cycles}</span></div><div class="cpu-regs">${regs}</div>`;
}
