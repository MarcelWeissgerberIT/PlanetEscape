// Persistent player progress across games: chapter stars, best times and best scores.
import { LEVELS } from './data';

export interface Progress {
  stars: Record<number, number>; // chapter index (0-based) -> 1..3
  best: Record<number, number>; // chapter index -> best seconds
  bestScore: { normal: number; hard: number };
}

const KEY = 'pe_progress_v1';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      return { stars: p.stars ?? {}, best: p.best ?? {}, bestScore: { normal: p.bestScore?.normal ?? 0, hard: p.bestScore?.hard ?? 0 } };
    }
  } catch {
    /* ignore */
  }
  return { stars: {}, best: {}, bestScore: { normal: 0, hard: 0 } };
}

function store(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Stars for finishing chapter `index` in `seconds`: 3 within par, 2 within 1.75× par, else 1. */
export function starsFor(index: number, seconds: number): number {
  const par = LEVELS[Math.min(index, LEVELS.length - 1)].par;
  return seconds <= par ? 3 : seconds <= par * 1.75 ? 2 : 1;
}

export function recordChapter(index: number, seconds: number): { stars: number; best: number; improved: boolean } {
  const p = loadProgress();
  const stars = starsFor(index, seconds);
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

export function starString(n: number): string {
  return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n);
}
