// Blueprint window content: the production tree down to the deposits (rates for items, amounts for building kits).
import { buildingUrl } from '../game/assets';
import { BUILDINGS, BUILD_ORDER, MINE_SECONDS, RECIPES, RECIPE_BY_ID, TERRAIN_ITEM, printSeconds } from '../game/data';
import type { Sim } from '../game/sim';
import type { BuildingId, ItemId, TerrainId } from '../game/types';
import { t, tBuilding, tBuildingDesc, tItem } from '../i18n';
import { itemImg } from './dom';
import { icon } from './icons';
import { unlockNote } from './panels';

export type BlueprintTarget = { kind: 'item'; id: ItemId } | { kind: 'building'; id: BuildingId };

/** Head (title, rate chips or building card) and tree of the blueprint for `what` at `rate` items per minute. */
export function blueprintContent(sim: Sim, what: BlueprintTarget, rate: number): { head: string; tree: string } {
  const st = sim.state;
  const minerPerMin = (60 / MINE_SECONDS) * sim.factor('miner') * sim.factor('yield');
  const beltPerMin = sim.beltCapacity();
  void beltPerMin;
  const deposits = (id: ItemId) => (Object.keys(TERRAIN_ITEM) as TerrainId[]).find((k) => TERRAIN_ITEM[k] === id);
  // qty mode (buildings): amounts instead of rates
  const node = (id: ItemId, amount: number, qty: boolean, depth: number, seen: Set<ItemId>, per: number | null): string => {
    const r = RECIPES.find((rc) => rc.output === id);
    const terrain = deposits(id);
    const have = st.inventory[id] ?? 0;
    const amountTxt = qty ? `${Math.ceil(amount)}×` : `${amount.toFixed(amount < 10 ? 1 : 0)}/min`;
    let body = `<div class="bp-node ${r ? 'made' : terrain ? 'raw' : 'plain'}" data-bp-item="${id}">
      ${per ? `<span class="bp-per">${per}×</span>` : ''}
      <div class="bp-top">${itemImg(id, 'icon')}<div><b>${tItem(id)}</b><small>${amountTxt} · ${t('bp_stock')} ${have}</small></div></div>`;
    if (r) {
      const crafts = qty ? Math.ceil(amount / r.outputCount) : 0;
      const perMachine = ((r.outputCount * 60) / r.seconds) * sim.factor('machine');
      const machines = qty ? 0 : amount / perMachine;
      const built = st.buildings.filter((b) => !b.site && b.recipe && RECIPE_BY_ID[b.recipe]?.output === id).length;
      body += `<div class="bp-mach ${!qty && built >= Math.ceil(machines) ? 'ok' : ''}"><img class="icon xs" src="${buildingUrl(r.machine)}" alt="" data-building="${r.machine}">
        <span>${tBuilding(r.machine)} · ${r.seconds}s${r.outputCount > 1 ? ` → ${r.outputCount}×` : ''}</span>
        <em>${qty ? t('bp_runs', { n: crafts, s: Math.round((crafts * r.seconds) / sim.factor('machine')) }) : `${Math.ceil(machines)}× (${machines.toFixed(2)}) · ${built} ${t('built')}`}</em>
        ${unlockNote(sim, 'recipe', r.id)}</div>`;
    } else if (terrain) {
      const miners = qty ? 0 : amount / minerPerMin;
      const built = st.buildings.filter((b) => !b.site && b.type === 'miner' && b.mineItem === id).length;
      body += `<div class="bp-mach raw ${!qty && built >= Math.ceil(miners) ? 'ok' : ''}"><img class="icon xs" src="${buildingUrl('miner')}" alt="" data-building="miner">
        <span>${t('bp_mine', { m: tBuilding('miner') })}</span>
        <em>${qty ? t('bp_mine_qty', { s: Math.round((amount * MINE_SECONDS) / sim.factor('miner')) }) : `${Math.ceil(miners)}× (${miners.toFixed(2)}) · ${built} ${t('built')}`}</em></div>`;
    }
    if (!qty && amount > sim.beltCapacity(id)) body += `<div class="bp-warn">⚠ ${t('belt_limit', { n: sim.beltCapacity(id).toFixed(0) })}</div>`;
    body += `</div>`;
    let kids = '';
    if (r && !seen.has(id) && depth < 7) {
      const next = new Set(seen).add(id);
      const crafts = qty ? Math.ceil(amount / r.outputCount) : amount / r.outputCount;
      kids = Object.entries(r.inputs).map(([k, n]) => `<li>${node(k as ItemId, crafts * n!, qty, depth + 1, next, n!)}</li>`).join('');
    }
    return kids ? `${body}<ul>${kids}</ul>` : body;
  };
  let head = '';
  let tree = '';
  if (what.kind === 'item') {
    const id = what.id;
    const usedIn = RECIPES.filter((r) => r.inputs[id] !== undefined);
    const buildsWith = BUILD_ORDER.filter((b) => BUILDINGS[b].cost[id] !== undefined);
    head = `<h2>${icon('research')} ${t('bp_title')} · ${tItem(id)}</h2>
      <div class="dirs"><span class="lbl">${t('target_rate')}</span>${[5, 10, 20, 30, 60].map((r) => `<button class="chip ${r === rate ? 'active' : ''}" data-rate="${r}">${r}/min</button>`).join('')}</div>`;
    tree = `<ul class="bp-tree"><li>${node(id, rate, false, 0, new Set(), null)}</li></ul>`;
    const uses = [...usedIn.map((r) => `<button class="chip" data-bp-item="${r.output}">${itemImg(r.output, 'icon xs')} ${tItem(r.output)}</button>`), ...buildsWith.map((b) => `<button class="chip" data-bp-building="${b}"><img class="icon xs" src="${buildingUrl(b)}" alt=""> ${tBuilding(b)}</button>`)];
    tree += uses.length ? `<h3>${t('bp_used_in')}</h3><div class="chain-grid">${uses.join('')}</div>` : '';
  } else {
    const id = what.id;
    const def = BUILDINGS[id];
    const kits = st.kits?.[id] ?? 0;
    head = `<h2>${icon('research')} ${t('bp_title')} · ${tBuilding(id)}</h2>
      <div class="bp-building"><img src="${buildingUrl(id)}" alt=""><div><b>${tBuilding(id)}</b><small>${def.size}×${def.size}${def.power ? ` · ⚡ ${def.power < 0 ? '+' : '−'}${Math.abs(def.power)}` : ''} · ${t('bp_print', { s: printSeconds(id) })} · ${t('printer_kits')}: ${kits}</small><small>${tBuildingDesc(id)}</small>${unlockNote(sim, 'building', id)}</div></div>`;
    const mats = Object.entries(def.cost);
    tree = mats.length
      ? `<ul class="bp-tree"><li><div class="bp-node kit"><div class="bp-top"><img class="icon" src="${buildingUrl(id)}" alt=""><div><b>${t('kit_of', { b: tBuilding(id) })}</b><small>${t('bp_print', { s: printSeconds(id) })}</small></div></div></div><ul>${mats.map(([k, n]) => `<li>${node(k as ItemId, n!, true, 1, new Set(), n!)}</li>`).join('')}</ul></li></ul>`
      : '';
    const recipes = RECIPES.filter((r) => r.machine === id);
    if (recipes.length) tree += `<h3>${t('recipes')}</h3><div class="chain-grid">${recipes.map((r) => `<button class="chip" data-bp-item="${r.output}">${itemImg(r.output, 'icon xs')} ${tItem(r.output)}</button>`).join('')}</div>`;
  }
  return { head, tree };
}
