// Persistent player progress across games: chapter stars, best times and best scores.
import { STAR_EFFICIENCY, LEVELS, challengeMedal } from './data';

export interface Progress {
  stars: Record<number, number>; // chapter index (0-based) -> 1..3
  best: Record<number, number>; // chapter index -> best seconds
  bestScore: { normal: number; hard: number };
  lastChapter?: number; // 1-based chapter the player was in most recently
  challenges?: Record<string, number>; // challenge id -> best seconds
  rivals?: Record<string, { name: string; time: number }>; // challenge id -> best time from a pasted share code
  playerName?: string; // name that goes into share codes
}

const KEY = 'pe_progress_v1';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      return { stars: p.stars ?? {}, best: p.best ?? {}, bestScore: { normal: p.bestScore?.normal ?? 0, hard: p.bestScore?.hard ?? 0 }, lastChapter: p.lastChapter, challenges: p.challenges ?? {}, rivals: p.rivals ?? {}, playerName: p.playerName };
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
