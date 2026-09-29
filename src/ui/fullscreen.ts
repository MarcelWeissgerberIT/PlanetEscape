// Full screen: the desktop app switches its window, the browser uses the Fullscreen API and draws the game's own
// frame around the screen while full (iPhone Safari has no full screen for pages: there "Add to Home Screen" is it).
import { desktop } from '../game/desktop';

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

export function fullscreenAvailable(): boolean {
  const d = document as FsDoc;
  return !!desktop() || !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return desktop()?.isFullscreen() ?? !!(d.fullscreenElement || d.webkitFullscreenElement);
}

export function toggleFullscreen() {
  const app = desktop();
  if (app) {
    app.toggleFullscreen();
    return;
  }
  const d = document as FsDoc;
  const el = document.documentElement as FsEl;
  if (d.fullscreenElement || d.webkitFullscreenElement) {
    if (d.exitFullscreen) void d.exitFullscreen().catch(() => undefined);
    else d.webkitExitFullscreen?.();
  } else if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  else el.webkitRequestFullscreen?.();
}

/** The frame shown while the browser is full screen: glowing edge, corner brackets and the name plate. */
export function installFrame() {
  if (desktop()) return; // the app window is the frame
  const frame = document.createElement('div');
  frame.className = 'fs-frame';
  frame.innerHTML = '<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><span class="plate">PLANET <b>ESCAPE</b></span><span class="ticks"></span>';
  document.body.appendChild(frame);
  const sync = () => document.documentElement.classList.toggle('is-fs', isFullscreen());
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
}
