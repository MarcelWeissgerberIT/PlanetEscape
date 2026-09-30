// Tooltips: what a building or an item is, its recipes and its production chain.
import { buildingUrl } from '../game/assets';
import { BUILDINGS, BUILD_ORDER, MINE_SECONDS, RECIPES, SHIP_PARTS, TERRAIN_ITEM } from '../game/data';
import type { Sim } from '../game/sim';
import type { BuildingId, ItemId, TerrainId } from '../game/types';
import { t, tBuilding, tBuildingDesc, tItem } from '../i18n';
import { costHtml, itemImg } from './dom';

/** Compact production chain for a tip: every node links to its blueprint. */
export function miniTree(id: ItemId, n: number, depth: number, seen: Set<ItemId>): string {
  const r = RECIPES.find((rc) => rc.output === id);
  const terrain = (Object.keys(TERRAIN_ITEM) as TerrainId[]).some((k) => TERRAIN_ITEM[k] === id);
  const mach = r ? `<img class="icon xs mt-mach" src="${buildingUrl(r.machine)}" alt="" data-building="${r.machine}" title="${tBuilding(r.machine)}">` : terrain ? `<img class="icon xs mt-mach" src="${buildingUrl('miner')}" alt="" data-building="miner" title="${tBuilding('miner')}">` : '';
  const label = `<span class="mt-node">${n > 1 ? `<em>${n}×</em>` : ''}${itemImg(id, 'icon xs')}<span>${tItem(id)}</span>${mach ? `<small>←</small>${mach}` : ''}</span>`;
  if (!r || seen.has(id) || depth >= 5) return `<li>${label}</li>`;
  const next = new Set(seen).add(id);
  return `<li>${label}<ul>${Object.entries(r.inputs).map(([k, m]) => miniTree(k as ItemId, m!, depth + 1, next)).join('')}</ul></li>`;
}

/** An item with its amount as a small chip (the amount set off from the icon). */
function qty(id: ItemId, n: number, showOne = true): string {
  return `<span class="tq">${itemImg(id, 'icon xs')}${n > 1 || showOne ? `<b>${n}</b>` : ''}</span>`;
}

export function recipeRow(r: (typeof RECIPES)[number]): string {
  const ins = Object.entries(r.inputs).map(([k, n]) => qty(k as ItemId, n!)).join('<i class="tr-plus">+</i>');
  return `<div class="tip-recipe"><span class="tr-in">${ins}</span><i class="tr-arrow">›</i>${qty(r.output, r.outputCount, false)}<em>${r.seconds} s</em></div>`;
}

export function buildingTipHtml(sim: Sim, id: BuildingId): string {
  const def = BUILDINGS[id];
  const st = sim.state;
  const recipes = def.kind === 'machine' ? RECIPES.filter((r) => r.machine === id) : [];
  const cost = Object.keys(def.cost).length ? costHtml(def.cost, st.inventory) : '–';
  const power = def.power ? `<span class="${def.power < 0 ? 'ok' : ''}">⚡ ${def.power < 0 ? '+' : '−'}${Math.abs(def.power)}</span>` : '';
  const rate = def.kind === 'miner' ? `${Math.round((60 / MINE_SECONDS) * sim.factor('miner'))}/min` : def.kind === 'conveyor' ? `${Math.round(sim.beltCapacity())}/min` : '';
  // compact card: name and key figures, two lines of description, cost, recipes; the full chain lives in the blueprint
  return `<div class="tip-head"><span class="tip-plate"><img src="${buildingUrl(id)}" alt="" data-building="${id}"></span><div><b>${tBuilding(id)}</b><span class="tip-chips"><i>${def.size}×${def.size}</i>${power ? `<i>${power}</i>` : ''}${rate ? `<i>${rate}</i>` : ''}</span></div></div>
    <p class="tip-desc">${tBuildingDesc(id)}</p>
    <div class="tip-sec"><small>${t('cost')}</small><div class="tip-costs">${cost}</div></div>
    ${recipes.length ? `<div class="tip-sec"><small>${t('recipes')}</small>${recipes.slice(0, 3).map((r) => recipeRow(r)).join('')}${recipes.length > 3 ? `<div class="tip-more">+${recipes.length - 3}</div>` : ''}</div>` : ''}
    <button class="tip-link" data-bp-building="${id}">${t('bp_title')} ›</button>`;
}

export function itemTipHtml(id: ItemId): string {
  const made = RECIPES.filter((r) => r.output === id);
  const used = RECIPES.filter((r) => id in r.inputs);
  const terrain = (Object.keys(TERRAIN_ITEM) as TerrainId[]).find((k) => TERRAIN_ITEM[k] === id);
  const usedIn = used.map((r) => `${itemImg(r.output, 'icon xs')}`).join(' ');
  const costOf = BUILD_ORDER.filter((b) => id in BUILDINGS[b].cost).map((b) => tBuilding(b)).join(', ');
  return `<div class="tip-head"><span class="tip-plate">${itemImg(id, 'icon')}</span><div><b>${tItem(id)}</b>${SHIP_PARTS[id] ? `<span class="tip-chips"><i>🚀 ${t('ship_part')} · ${SHIP_PARTS[id]}</i></span>` : ''}</div></div>
    ${terrain ? `<p class="tip-desc">${t('tip_mined', { m: tBuilding('miner') })}</p>` : made.slice(0, 2).map((r) => `<div class="tip-sec"><small>${tBuilding(r.machine)}</small>${recipeRow(r)}</div>`).join('')}
    ${usedIn ? `<div class="tip-sec"><small>${t('tip_used_in')}</small><div class="tip-icons">${usedIn}</div></div>` : ''}
    ${costOf ? `<div class="tip-sec"><small>${t('tip_builds')}</small><span class="tip-list clamp1">${costOf}</span></div>` : ''}
    <button class="tip-link" data-chain="${id}">${t('bp_title')} ›</button>`;
}
