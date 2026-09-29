// Bridge to the desktop app (Electron, see desktop/): files for saves, window control, Steam.
// In the browser none of this exists and every helper falls back to the web behaviour.

export interface DesktopBridge {
  platform: string;
  version: string;
  store: { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void };
  quit(): void;
  toggleFullscreen(): boolean; // returns the new state
  isFullscreen(): boolean;
  openExternal(url: string): void;
  steam: { available(): boolean; activate(achievement: string): void };
}

export function desktop(): DesktopBridge | null {
  return (globalThis as { peDesktop?: DesktopBridge }).peDesktop ?? null;
}

/** Built for the desktop app (vite --mode desktop) or running inside it. */
// (the constants are set by vite; the node check scripts run without them)
export const IS_DESKTOP = (typeof __DESKTOP__ !== 'undefined' && __DESKTOP__) || !!desktop();

/** 'full' or 'demo' (set with PE_EDITION at build time). */
export const EDITION: 'full' | 'demo' = typeof __EDITION__ !== 'undefined' && __EDITION__ === 'demo' ? 'demo' : 'full';
export const DEMO_CHAPTERS = 3; // story chapters in the demo
export const DEMO_CHALLENGES = ['c_drills', 'c_belts'];

/** Where the full game can be bought (shown at the end of the demo); set PE_STORE_URL at build time. */
export const STORE_URL = typeof __STORE_URL__ !== 'undefined' ? __STORE_URL__ : '';

/** Public address of the web game (share links from the desktop app point here). */
export const WEB_URL = 'https://planet-escape.dev/';
