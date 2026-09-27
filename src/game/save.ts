import type { GameState } from './types';
import { SAVE_VERSION } from './world';

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
      st.upgrades = { belt: 0, miner: 0, machine: 0, power: 0 };
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
    if (st.version !== SAVE_VERSION) return null;
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
