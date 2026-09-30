// The core printer window (queue and kit stock) and the status line of a building site.
import { buildingUrl } from '../game/assets';
import { BUILDINGS, BUILD_GROUPS, printSeconds } from '../game/data';
import type { Sim } from '../game/sim';
import type { Building, BuildingId } from '../game/types';
import { t, tBuilding } from '../i18n';
import { costHtml } from './dom';
import { icon } from './icons';

export function siteLine(sim: Sim, b: Building): string {
  const s = sim.siteInfo(b);
  const txt = b.deliver ? t(b.enroute === 'drone' ? 'site_drone' : b.enroute === 'item' ? 'site_item' : 'site_deliver') : s.pos === 0 ? t('site_printing', { p: Math.round(s.progress * 100) }) : t('site_waiting', { n: s.pos + 1 });
  return `<div class="site-line">${icon('print', 'sm')} ${txt}</div>`;
}

/** The live part of the printer page (queue, stock); re-rendered while the page is open. */
export function printerHtml(sim: Sim): string {
  const st = sim.state;
  const q = sim.printQueue();
  const auto = st.autoPrint !== false;
  const inv = st.inventory;
  const [now, ...rest] = q;
  const pct = now ? Math.round((1 - now.left / now.total) * 100) : 0;
  const head = now
    ? `<div class="pr-now"><img src="${buildingUrl(now.type)}" alt=""><span class="pr-now-body"><small>${now.site ? t('print_site') : t('print_stock')}</small><b>${tBuilding(now.type)}</b><span class="pr-bar"><i style="width:${pct}%"></i></span><em>${pct}% · ${now.left.toFixed(1)} s</em></span>${now.site ? '' : `<button class="iconbtn" data-cancel="0" title="${t('cancel')}">${icon('close', 'sm')}</button>`}</div>`
    : `<div class="pr-idle">${icon('print')}<span>${t('printer_empty')}</span></div>`;
  const queue = rest.map((j, k) => `<div class="pr-q"><img src="${buildingUrl(j.type)}" alt=""><span>${tBuilding(j.type)}<small>${j.site ? t('print_site') : t('print_stock')}</small></span><em>${j.left.toFixed(1)} s</em>${j.site ? '' : `<button class="iconbtn" data-cancel="${k + 1}" title="${t('cancel')}">${icon('close', 'sm')}</button>`}</div>`).join('');
  const kits = Object.values(st.kits ?? {}).reduce((a, n) => a + (n ?? 0), 0);
  const card = (id: BuildingId) => {
    const have = st.kits?.[id] ?? 0;
    const locked = sim.printLocked(id);
    const can = sim.canAfford(id) && !locked;
    return `<div class="pr-card ${have ? 'have' : ''} ${locked ? 'quota' : ''}">
      <img src="${buildingUrl(id)}" alt="" data-building="${id}">
      <span class="pr-body"><b>${tBuilding(id)}</b><small class="pr-cost">${costHtml(BUILDINGS[id].cost, inv)}</small><small class="pr-time">⏱ ${printSeconds(id)} s</small></span>
      <span class="pr-have"><b>${have}</b><small>${t('pr_stock')}</small></span>
      <span class="pr-btns"><button class="iconbtn" data-bp-building="${id}" title="${t('bp_title')}">${icon('research', 'sm')}</button>${locked ? `<span class="pr-lock">${icon('lock')} ${t('ch_quota')}</span>` : `<button class="pr-add" data-print="${id}" data-n="1" ${can ? '' : 'disabled'}>+1</button><button class="pr-add" data-print="${id}" data-n="5" ${can ? '' : 'disabled'}>+5</button>`}</span>
    </div>`;
  };
  const groups = BUILD_GROUPS.map((g) => ({ id: g.id, items: g.items.filter((id) => st.unlockedBuildings.includes(id)) })).filter((g) => g.items.length);
  return `<div class="story-split pr-split">
      <div class="pr-kits">${groups.map((g) => `<h3>${t(`group_${g.id}` as 'group_storage')}</h3><div class="pr-grid">${g.items.map(card).join('')}</div>`).join('')}</div>
      <aside class="story-goals pr-side">
        ${sim.challenge() ? `<p class="pr-note">🏁 ${t('ch_printer')}</p>` : `<div class="pr-auto"><span>${t('printer_auto')}</span><span class="pr-switch"><button class="${auto ? 'on' : ''}" data-act="auto-on">${t('on')}</button><button class="${auto ? '' : 'on'}" data-act="auto-off">${t('off')}</button></span></div>`}
        <h3>${t('printer_queue')}${q.length ? ` <i class="pr-count">${q.length}</i>` : ''}</h3>
        ${head}${queue ? `<div class="pr-queue">${queue}</div>` : ''}
        <div class="pr-total"><small>${t('printer_kits')}</small><b>${kits}</b></div>
      </aside>
    </div>`;
}

/** The whole printer page: title, a folded explanation, the live part. */
export function printerPage(sim: Sim): string {
  return `<h2>${t('printer_title')}</h2>
    <details class="pr-help"><summary>${icon('help', 'sm')} ${t('pr_how')}</summary><p>${t('printer_hint')}</p><p>${t('printer_reach')}</p></details>
    <div class="pr-live">${printerHtml(sim)}</div>
    <button class="btn primary" data-act="close">${t('close')}</button>`;
}
