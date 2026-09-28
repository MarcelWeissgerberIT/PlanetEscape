// The core printer window (queue and kit stock) and the status line of a building site.
import { buildingUrl } from '../game/assets';
import { BUILDINGS, BUILD_GROUPS, printSeconds } from '../game/data';
import type { Sim } from '../game/sim';
import type { Building } from '../game/types';
import { t, tBuilding } from '../i18n';
import { costHtml } from './dom';
import { icon } from './icons';

export function siteLine(sim: Sim, b: Building): string {
  const s = sim.siteInfo(b);
  const txt = b.deliver ? t(b.enroute === 'drone' ? 'site_drone' : b.enroute === 'item' ? 'site_item' : 'site_deliver') : s.pos === 0 ? t('site_printing', { p: Math.round(s.progress * 100) }) : t('site_waiting', { n: s.pos + 1 });
  return `<div class="site-line">${icon('print', 'sm')} ${txt}</div>`;
}

export function printerHtml(sim: Sim): string {
  const st = sim.state;
  const q = sim.printQueue();
  const auto = st.autoPrint !== false;
  const inv = st.inventory;
  const queue = q.length
    ? q.map((j, i) => `<div class="pq-row ${i === 0 ? 'now' : ''}"><img class="icon" src="${buildingUrl(j.type)}" alt=""><span class="pq-name">${tBuilding(j.type)}<small>${j.site ? t('print_site') : t('print_stock')}</small></span>${i === 0 ? `<span class="pbar"><span class="pfill" style="width:${Math.round((1 - j.left / j.total) * 100)}%"></span></span>` : `<span class="pq-time">${j.left.toFixed(1)} s</span>`}${j.site ? '' : `<button class="iconbtn" data-cancel="${i}" title="${t('cancel')}">${icon('close', 'sm')}</button>`}</div>`).join('')
    : `<p class="save-hint">${t('printer_empty')}</p>`;
  const ids = BUILD_GROUPS.flatMap((g) => g.items).filter((id) => st.unlockedBuildings.includes(id));
  const list = ids.map((id) => {
    const have = st.kits?.[id] ?? 0;
    const can = sim.canAfford(id) && !sim.printLocked(id);
    return `<div class="kit-row ${sim.printLocked(id) ? 'quota' : ''}"><img class="icon" src="${buildingUrl(id)}" alt="" data-building="${id}"><span class="kit-name">${tBuilding(id)}<small>${printSeconds(id)} s · ${costHtml(BUILDINGS[id].cost, inv)}</small></span><b class="kit-have ${have ? '' : 'none'}">×${have}</b><button class="iconbtn" data-bp-building="${id}" title="${t('bp_title')}">${icon('research', 'sm')}</button>${sim.printLocked(id) ? `<span class="chip quota-chip">🔒 ${t('ch_quota')}</span>` : `<button class="chip" data-print="${id}" data-n="1" ${can ? '' : 'disabled'}>+1</button><button class="chip" data-print="${id}" data-n="5" ${can ? '' : 'disabled'}>+5</button>`}</div>`;
  }).join('');
  return `<h2>${icon('print')} ${t('printer_title')}</h2>
    <p class="save-hint">${t('printer_hint')} ${t('printer_reach')}</p>
    ${sim.challenge() ? `<p class="save-hint">🏁 ${t('ch_printer')}</p>` : `<div class="dirs"><span class="lbl">${t('printer_auto')}</span><button class="chip ${auto ? 'active' : ''}" data-act="auto-on">${t('on')}</button><button class="chip ${auto ? '' : 'active'}" data-act="auto-off">${t('off')}</button></div>`}
    <h3>${t('printer_queue')}</h3><div class="pq">${queue}</div>
    <h3>${t('printer_kits')}</h3><div class="kit-list">${list}</div>
    <button class="btn primary" data-act="close">${t('close')}</button>`;
}
