// Challenge texts: the rule line (kit quota, locked parts, gold time) and the medal count.
import { CHALLENGE_BY_ID, CHALLENGES, challengeMedal } from '../game/data';
import { challengeBest } from '../game/progress';
import { t, tBuilding } from '../i18n';
import { fmtTime } from './dom';

/** Short rule line of a challenge: the kit quota and the parts that must not be printed. */
export function challengeRules(id: string): string {
  const c = CHALLENGE_BY_ID[id];
  const kits = Object.entries(c.kits).map(([k, n]) => `${n}× ${tBuilding(k)}`).join(', ');
  const locked = c.noPrint.map((k) => tBuilding(k)).join(', ');
  return `${kits ? `${t('ch_kits')}: ${kits}` : t('ch_no_kits')}${locked ? ` · ${t('ch_no_print', { p: locked })}` : ''} · 🥇 ${fmtTime(c.medals[0])}`;
}

export function medalSummary(): string {
  const n = CHALLENGES.filter((c) => {
    const b = challengeBest(c.id);
    return b !== undefined && challengeMedal(c.id, b) === 3;
  }).length;
  return n ? `· 🥇 ${n}/${CHALLENGES.length}` : '';
}
