// Contract texts and progress lines (plain amounts and automation contracts).
import type { Sim } from '../game/sim';
import type { Contract } from '../game/types';
import { t, tItem } from '../i18n';
import { fmtTime } from './dom';

/** One-line text of a contract (all kinds). */
export function contractText(sim: Sim, c: Contract): string {
  const time = fmtTime(c.deadline - sim.state.time);
  const item = tItem(c.item);
  if (c.kind === 'steady') return t('contract_steady', { lo: c.lo!, hi: c.hi!, item, s: c.hold!, time });
  if (c.kind === 'batch') return t('contract_batch', { n: c.n!, item, w: c.window!, k: c.rounds!, time });
  if (c.kind === 'level') return t('contract_level', { lo: c.lo!, hi: c.hi!, item, s: c.hold!, time });
  return t('contract_text', { n: c.amount, item, time });
}

/** Progress bar and line of an accepted contract. */
export function contractProgress(sim: Sim, c: Contract): string {
  const st = sim.state;
  const left = `${t('time_left')} ${fmtTime(c.deadline - st.time)}`;
  if (!c.kind || c.kind === 'amount') return `<div class="pbar big"><div class="pfill" style="width:${(c.delivered / c.amount) * 100}%"></div></div><div class="cmeta">${c.delivered}/${c.amount} · ${left}</div>`;
  if (c.kind === 'batch') {
    const inWin = Math.max(0, Math.ceil((c.winStart ?? st.time) + c.window! - st.time));
    return `<div class="pbar big"><div class="pfill" style="width:${((c.done ?? 0) / c.rounds!) * 100}%"></div></div><div class="cmeta">${t('contract_batch_now', { d: c.done ?? 0, k: c.rounds!, c: c.winCount ?? 0, n: c.n!, s: inWin })} · ${left}</div>`;
  }
  const v = sim.automationValue(c);
  const ok = v >= c.lo! && v <= c.hi!;
  return `<div class="pbar big"><div class="pfill" style="width:${((c.held ?? 0) / c.hold!) * 100}%"></div></div><div class="cmeta"><span class="${ok ? 'okline' : 'badline'}">${t(c.kind === 'steady' ? 'contract_rate_now' : 'contract_level_now', { v })}</span> · ${Math.floor(c.held ?? 0)}/${c.hold} s · ${left}</div>`;
}
