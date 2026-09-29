// Unlock code for the web demo: a 5-character code turns it into the full game on this device.
// Only hashes of the valid codes are in the game (tools/unlock-codes.mjs makes new ones). The web version has no server,
// so this is a hurdle, not copy protection; the Steam demo is not unlocked this way.
import codes from './unlock-codes.json';

export const UNLOCK_KEY = 'pe_unlock';
/** Letters and digits without the easily confused ones (0/O, 1/I). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

/** Upper case, without spaces or dashes. */
export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export async function codeHash(code: string): Promise<string> {
  const data = new TextEncoder().encode(`planet-escape:${normalizeCode(code)}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A valid code was entered on this device before. */
export function unlockedHere(): boolean {
  try {
    const h = localStorage.getItem(UNLOCK_KEY);
    return !!h && (codes.hashes as string[]).includes(h);
  } catch {
    return false;
  }
}

/** Check a code; a valid one is remembered on this device. */
export async function tryUnlock(code: string): Promise<boolean> {
  if (normalizeCode(code).length !== CODE_LENGTH) return false;
  const h = await codeHash(code);
  if (!(codes.hashes as string[]).includes(h)) return false;
  try {
    localStorage.setItem(UNLOCK_KEY, h);
  } catch {
    return false;
  }
  return true;
}
