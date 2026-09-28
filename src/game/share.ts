// Challenge share codes: a finish time packed into a short text code (and a link) that others can paste to compare.
// No server: the code carries challenge, time and name plus a checksum against typos (not against cheating).
import { CHALLENGE_BY_ID, challengeMedal } from './data';

export interface ChallengeResult {
  id: string; // challenge id
  time: number; // seconds
  name: string; // who played it (may be empty)
}

const PREFIX = 'PE-C1-';

/** FNV-1a, 32 bit: a checksum over the payload (catches typos and truncated codes). */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** Name as it goes into a code: trimmed, at most 20 characters, no separators. */
export function cleanName(name: string): string {
  return name.replace(/[|\n\r]/g, ' ').trim().slice(0, 20);
}

export function encodeResult(r: ChallengeResult): string {
  const payload = `${r.id}|${Math.round(r.time)}|${cleanName(r.name)}`;
  return PREFIX + b64url(payload) + '.' + fnv(payload).toString(36);
}

/** Reads a code (or a link that contains one); null when it is not a valid code of a known challenge. */
export function decodeResult(input: string): ChallengeResult | null {
  const m = /PE-C1-([A-Za-z0-9_-]+)\.([0-9a-z]+)/.exec(input.trim());
  if (!m) return null;
  try {
    const payload = unb64url(m[1]);
    if (fnv(payload).toString(36) !== m[2]) return null;
    const [id, t, name = ''] = payload.split('|');
    const time = Number(t);
    if (!CHALLENGE_BY_ID[id] || !Number.isFinite(time) || time <= 0 || time > 1e6) return null;
    return { id, time, name };
  } catch {
    return null;
  }
}

export function resultMedal(r: ChallengeResult): number {
  return challengeMedal(r.id, r.time);
}

/** Link to the game that opens the comparison for this result. */
export function shareLink(r: ChallengeResult, base: string): string {
  return `${base.replace(/[?#].*$/, '')}?ch=${encodeResult(r)}`;
}
