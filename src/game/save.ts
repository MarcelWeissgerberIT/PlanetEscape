import type { GameState } from './types';
import { SAVE_VERSION } from './world';
import { kv } from './storage';
import { BUILDINGS, MATRIX_SAVE_MAX, UPGRADE_DEFAULTS } from './data';

const KEY = 'pe_save_v1';
/** buildings the last load had to drop because this build does not know them (save from a newer version) */
export let lastDropped = 0;

/** JSON for storage: LED matrix pixels travel as base64 (3 bytes per pixel) instead of number arrays. */
export function serialize(state: GameState): string {
  return JSON.stringify(state, (key, value) => (key === 'px' && Array.isArray(value) ? (value.length > MATRIX_SAVE_MAX * MATRIX_SAVE_MAX ? undefined : packPixels(value as number[])) : value));
}

function packPixels(px: number[]): string {
  let bin = '';
  for (const v of px) bin += String.fromCharCode((v >> 16) & 255, (v >> 8) & 255, v & 255);
  return 'b64:' + btoa(bin);
}

function unpackPixels(s: string): number[] {
  const bin = atob(s.slice(4));
  const out: number[] = [];
  for (let i = 0; i + 2 < bin.length; i += 3) out.push((bin.charCodeAt(i) << 16) | (bin.charCodeAt(i + 1) << 8) | bin.charCodeAt(i + 2));
  return out;
}

export function save(state: GameState) {
  kv.set(KEY, serialize(state));
}

export function load(): GameState | null {
  try {
    const raw = kv.get(KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Bring a parsed save of any older version up to date (null when it cannot be read). Also used by the import. */
export function migrate(parsed: unknown): GameState | null {
  try {
    const st = parsed as GameState;
    if (!st || !Array.isArray(st.buildings) || !Array.isArray(st.terrain)) return null;
    st.robots ??= [];
    st.forklifts ??= [];
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
    const before = st.buildings.length;
    st.buildings = st.buildings.filter((b) => b && b.type in BUILDINGS);
    lastDropped = before - st.buildings.length;
    if (!st.buildings.length || st.buildings[0].type !== 'core') return null;
    for (const b of st.buildings) {
      const px = (b as { px?: unknown }).px;
      if (typeof px === 'string') b.px = px.startsWith('b64:') ? unpackPixels(px) : undefined;
    }
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
  kv.remove(KEY);
}

export function hasSave(): boolean {
  return !!kv.get(KEY);
}
