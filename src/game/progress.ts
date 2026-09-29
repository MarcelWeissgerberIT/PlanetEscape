// Persistent player progress across games: chapter stars, best times and best scores.
import { STAR_EFFICIENCY, LEVELS, challengeMedal } from './data';
import { kv } from './storage';

export interface Progress {
  stars: Record<number, number>; // chapter index (0-based) -> 1..3
  best: Record<number, number>; // chapter index -> best seconds
  bestScore: { normal: number; hard: number };
  lastChapter?: number; // 1-based chapter the player was in most recently
  challenges?: Record<string, number>; // challenge id -> best seconds
  rivals?: Record<string, { name: string; time: number }>; // challenge id -> best time from a pasted share code
  playerName?: string; // name that goes into share codes
  achievements?: Record<string, number>; // achievement id -> time it was earned (ms)
}

const KEY = 'pe_progress_v1';

export function loadProgress(): Progress {
  try {
    const raw = kv.get(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      return { stars: p.stars ?? {}, best: p.best ?? {}, bestScore: { normal: p.bestScore?.normal ?? 0, hard: p.bestScore?.hard ?? 0 }, lastChapter: p.lastChapter, challenges: p.challenges ?? {}, rivals: p.rivals ?? {}, playerName: p.playerName, achievements: p.achievements ?? {} };
    }
  } catch {
    /* ignore */
  }
  return { stars: {}, best: {}, bestScore: { normal: 0, hard: 0 } };
}

function store(p: Progress) {
  kv.set(KEY, JSON.stringify(p));
}

/** Stars for finishing chapter `index` in `seconds`: 3 within par, 2 within 1.75× par, else 1.
 *  The third star also needs the machines to have been busy (utilisation at least STAR_EFFICIENCY). */
export function starsFor(index: number, seconds: number, efficiency = 1): number {
  const par = LEVELS[Math.min(index, LEVELS.length - 1)].par;
  const byTime = seconds <= par ? 3 : seconds <= par * 1.75 ? 2 : 1;
  return efficiency < STAR_EFFICIENCY ? Math.min(2, byTime) : byTime;
}

export function recordChapter(index: number, seconds: number, efficiency = 1): { stars: number; best: number; improved: boolean } {
  const p = loadProgress();
  const stars = starsFor(index, seconds, efficiency);
  const prevBest = p.best[index];
  const improved = prevBest === undefined || seconds < prevBest;
  p.stars[index] = Math.max(p.stars[index] ?? 0, stars);
  p.best[index] = improved ? Math.round(seconds) : prevBest;
  store(p);
  return { stars, best: p.best[index], improved };
}

/** Highest chapter (1-based) the player may start: one past the last completed chapter. */
export function chaptersUnlocked(): number {
  const p = loadProgress();
  let n = 0;
  for (let i = 0; i < LEVELS.length; i++) if (p.stars[i]) n = i + 1;
  return Math.min(LEVELS.length, n + 1);
}

export function recordScore(score: number, hard: boolean): boolean {
  const p = loadProgress();
  const k = hard ? 'hard' : 'normal';
  if (score > p.bestScore[k]) {
    p.bestScore[k] = score;
    store(p);
    return true;
  }
  return false;
}

export function setLastChapter(chapter: number) {
  const p = loadProgress();
  if (p.lastChapter === chapter) return;
  p.lastChapter = chapter;
  store(p);
}

/** Where a returning player should resume the story: the furthest chapter reached or last played. */
export function resumeChapter(): number {
  const p = loadProgress();
  return Math.max(1, Math.min(LEVELS.length, Math.max(chaptersUnlocked(), p.lastChapter ?? 1)));
}

export function starString(n: number): string {
  return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n);
}

/** Store a challenge finish; returns the medal of this run and the best time. */
export function recordChallenge(id: string, seconds: number): { medal: number; best: number; improved: boolean } {
  const p = loadProgress();
  const map = (p.challenges ??= {});
  const prev = map[id];
  const improved = prev === undefined || seconds < prev;
  if (improved) map[id] = Math.round(seconds);
  store(p);
  return { medal: challengeMedal(id, seconds), best: map[id], improved };
}

export function challengeBest(id: string): number | undefined {
  return loadProgress().challenges?.[id];
}

export const MEDALS = ['', '🥉', '🥈', '🥇'];

/** Keep the best time someone else shared for a challenge (from a pasted code). Returns true when it is new or better. */
export function recordRival(id: string, name: string, time: number): boolean {
  const p = loadProgress();
  const map = (p.rivals ??= {});
  const prev = map[id];
  if (prev && prev.time <= time) return false;
  map[id] = { name, time: Math.round(time) };
  store(p);
  return true;
}

export function challengeRival(id: string): { name: string; time: number } | undefined {
  return loadProgress().rivals?.[id];
}

export function playerName(): string {
  return loadProgress().playerName ?? '';
}

export function setPlayerName(name: string) {
  const p = loadProgress();
  p.playerName = name;
  store(p);
}

/** The whole progress as a text code ("PEP1.…"), to carry it from the web demo into the full game. */
export function exportProgress(): string {
  return 'PEP1.' + btoa(unescape(encodeURIComponent(JSON.stringify(loadProgress()))));
}

/** Merge a progress code into the stored progress (the better of both everywhere); false when the code is not valid. */
export function importProgress(code: string): boolean {
  let q: Partial<Progress>;
  try {
    const raw = code.trim();
    if (!raw.startsWith('PEP1.')) return false;
    q = JSON.parse(decodeURIComponent(escape(atob(raw.slice(5)))));
    if (!q || typeof q !== 'object' || typeof q.stars !== 'object') return false;
  } catch {
    return false;
  }
  const p = loadProgress();
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const merge = (to: Record<string | number, number>, from: unknown, better: (a: number, b: number) => number) => {
    if (!from || typeof from !== 'object') return;
    for (const [k, v] of Object.entries(from)) {
      const n = num(v);
      if (n !== undefined) to[k] = to[k] === undefined ? n : better(to[k], n);
    }
  };
  merge(p.stars, q.stars, Math.max);
  merge(p.best, q.best, Math.min);
  merge((p.challenges ??= {}), q.challenges, Math.min);
  merge((p.achievements ??= {}), q.achievements, Math.min);
  p.bestScore.normal = Math.max(p.bestScore.normal, num(q.bestScore?.normal) ?? 0);
  p.bestScore.hard = Math.max(p.bestScore.hard, num(q.bestScore?.hard) ?? 0);
  const last = num(q.lastChapter);
  if (last !== undefined) p.lastChapter = Math.max(p.lastChapter ?? 1, last);
  for (const [id, r] of Object.entries(q.rivals ?? {})) if (r && num(r.time) !== undefined && (!p.rivals?.[id] || r.time < p.rivals[id].time)) (p.rivals ??= {})[id] = { name: String(r.name ?? '').slice(0, 24), time: r.time };
  if (!p.playerName && typeof q.playerName === 'string') p.playerName = q.playerName.slice(0, 24);
  store(p);
  return true;
}
