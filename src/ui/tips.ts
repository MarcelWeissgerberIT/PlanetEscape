// Tooltips: what a building or an item is, its recipes and its production chain.
import { buildingUrl } from '../game/assets';
import { BUILDINGS, BUILD_ORDER, MINE_SECONDS, RECIPES, SHIP_PARTS, TERRAIN_ITEM } from '../game/data';
import type { Sim } from '../game/sim';
import type { BuildingId, ItemId, TerrainId } from '../game/types';
import { t, tBuilding, tBuildingDesc, tItem } from '../i18n';
import { costHtml, itemImg } from './dom';
import { icon } from './icons';

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

export function recipeRow(r: (typeof RECIPES)[number]): string {
  const ins = Object.entries(r.inputs).map(([k, n]) => `${itemImg(k as ItemId, 'icon xs')}${n}`).join(' + ');
  return `<div class="tip-recipe">${ins} → ${itemImg(r.output, 'icon xs')}${r.outputCount > 1 ? r.outputCount : ''} <small>${r.seconds}s</small></div>`;
}

export function buildingTipHtml(sim: Sim, id: BuildingId): string {
  const def = BUILDINGS[id];
  const st = sim.state;
  const recipes = def.kind === 'machine' ? RECIPES.filter((r) => r.machine === id) : [];
  const cost = Object.keys(def.cost).length ? costHtml(def.cost, st.inventory) : '–';
  const power = def.power ? `<span class="${def.power < 0 ? 'ok' : ''}">⚡ ${def.power < 0 ? '+' : '−'}${Math.abs(def.power)}</span>` : '';
  const rate = def.kind === 'miner' ? `${Math.round((60 / MINE_SECONDS) * sim.factor('miner'))}/min` : def.kind === 'conveyor' ? `${Math.round(sim.beltCapacity())}/min` : '';
  return `<div class="tip-head"><img src="${buildingUrl(id)}" alt="" data-building="${id}"><div><b>${tBuilding(id)}</b><small>${def.size}×${def.size} ${power} ${rate ? '· ' + rate : ''}</small></div></div>
    <p>${tBuildingDesc(id)}</p>
    <div class="tip-line"><span>${t('cost')}</span>${cost}</div>
    ${recipes.length ? `<div class="tip-line"><span>${t('recipes')}</span></div>${recipes.map((r) => recipeRow(r)).join('')}` : ''}
    ${Object.keys(def.cost).length ? `<div class="tip-line"><span>${t('tip_chain_kit')}</span></div><ul class="mini-tree">${Object.entries(def.cost).map(([k, n]) => miniTree(k as ItemId, n!, 0, new Set())).join('')}</ul>` : ''}
    <button class="btn small" data-bp-building="${id}">${icon('research', 'sm')} ${t('bp_title')}</button>
    <small class="dim">${t('tip_hint')}</small>`;
}

export function itemTipHtml(id: ItemId): string {
  const made = RECIPES.filter((r) => r.output === id);
  const used = RECIPES.filter((r) => id in r.inputs);
  const terrain = (Object.keys(TERRAIN_ITEM) as TerrainId[]).find((k) => TERRAIN_ITEM[k] === id);
  const usedIn = used.map((r) => `${itemImg(r.output, 'icon xs')}`).join(' ');
  const costOf = BUILD_ORDER.filter((b) => id in BUILDINGS[b].cost).map((b) => tBuilding(b)).join(', ');
  return `<div class="tip-head">${itemImg(id, 'icon')}<div><b>${tItem(id)}</b><small>${SHIP_PARTS[id] ? `🚀 ${t('ship_part')} · ${SHIP_PARTS[id]}` : ''}</small></div></div>
    ${terrain ? `<p>${t('tip_mined', { m: tBuilding('miner') })}</p>` : made.map((r) => `<div class="tip-line"><span>${tBuilding(r.machine)}</span></div>${recipeRow(r)}`).join('')}
    ${usedIn ? `<div class="tip-line"><span>${t('tip_used_in')}</span><span>${usedIn}</span></div>` : ''}
    ${costOf ? `<div class="tip-line"><span>${t('tip_builds')}</span><span class="wrap">${costOf}</span></div>` : ''}
    ${made.length ? `<div class="tip-line"><span>${t('tip_chain')}</span></div><ul class="mini-tree">${miniTree(id, 1, 0, new Set())}</ul>` : ''}
    <button class="btn small" data-chain="${id}">${icon('research', 'sm')} ${t('bp_title')}</button>`;
}
