import type { GameState } from './types';
import { SAVE_VERSION } from './world';
import { BUILDINGS, UPGRADE_DEFAULTS } from './data';

const KEY = 'pe_save_v1';

export function save(state: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode – ignore */
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const st = JSON.parse(raw) as GameState;
    if (!Array.isArray(st.buildings)) return null;
    if (st.version === 1) {
      st.ship = {};
      st.version = 2;
    }
    if (st.version === 2) {
      const r = () => 300 + Math.random() * 100;
      st.ore = st.terrain.map((t) => (t === 'ground' ? 0 : Math.round(r())));
      st.upgrades = UPGRADE_DEFAULTS();
      st.contracts = [];
      st.contractsDone = 0;
      st.nextContractAt = st.time + 120;
      st.storm = 0;
      st.nextStormAt = st.time + 600;
      st.tutorialStep = -1;
      st.introSeen = true;
      st.stats = { produced: {}, delivered: {} };
      st.version = 3;
    }
    if (st.version === 3) {
      st.options = { mode: 'story', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: true };
      st.version = 4;
    }
    if (st.version !== SAVE_VERSION) return null;
    // saves from a newer or older build may contain building types this build does not know: drop them
    st.buildings = st.buildings.filter((b) => b && b.type in BUILDINGS);
    if (!st.buildings.length || st.buildings[0].type !== 'core') return null;
    // additive fields (no version bump needed)
    st.upgrades = { ...UPGRADE_DEFAULTS(), ...st.upgrades };
    st.event ??= null;
    st.nextEventAt ??= st.time + 400;
    st.boostUntil ??= 0;
    st.eventsSeen ??= 0;
    st.chapterStart ??= 0;
    return st;
  } catch {
    return null;
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}
