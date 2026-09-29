// The main menu's silent background: a playlist of short clips of the same conveyor shot, each with its own small
// event in the background, in random order. Every clip starts and ends on the same still, so the next one fades in
// over the end of the current one without a visible seam; two <video> elements take turns so the next clip is
// already loaded when it is needed (and <video loop>, which stalls briefly at the jump, is not used at all).
import { videoSources } from './intro';

/** public/video/menu/01..NN (see tools/trailer/menu.sh). */
export const MENU_CLIPS = 17;

const LEAD = 0.45; // seconds before the end when the next clip starts
const FADE_MS = 450;

export class MenuVideo {
  private vids: HTMLVideoElement[];
  private cur = 0;
  private bag: number[] = [];
  private last = -1;
  private running = false;
  private switching = false;
  private raf = 0;

  constructor(host: HTMLElement) {
    this.vids = [0, 1].map(() => {
      const v = document.createElement('video');
      v.className = 'title-video';
      // iOS only autoplays a video that is muted and inline from the start: attributes, not just properties
      for (const a of ['muted', 'playsinline', 'webkit-playsinline']) v.setAttribute(a, '');
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      v.preload = 'none';
      v.addEventListener('ended', () => {
        if (v === this.vids[this.cur]) this.next(); // in case the frame watch missed the end
      });
      host.append(v);
      return v;
    });
  }

  /** Clips in random order, all of them before any repeats, never the same one twice in a row. */
  private pick(): number {
    if (!this.bag.length) {
      this.bag = Array.from({ length: MENU_CLIPS }, (_, i) => i + 1);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag[this.bag.length - 1] === this.last) this.bag.unshift(this.bag.pop()!);
    }
    this.last = this.bag.pop()!;
    return this.last;
  }

  private load(v: HTMLVideoElement) {
    v.innerHTML = videoSources(`menu/${String(this.pick()).padStart(2, '0')}`);
    v.preload = 'auto';
    v.load();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const a = this.vids[this.cur];
    if (!a.querySelector('source')) {
      this.load(a);
      a.style.zIndex = '1';
      a.addEventListener('playing', () => a.classList.add('on'), { once: true });
    }
    this.kick(a);
    const watch = () => {
      if (!this.running) return;
      const v = this.vids[this.cur];
      if (!this.switching && v.duration && v.currentTime >= v.duration - LEAD) this.next();
      this.raf = requestAnimationFrame(watch);
    };
    this.raf = requestAnimationFrame(watch);
    // the second player loads its clip once the first one runs
    setTimeout(() => {
      const b = this.vids[1 - this.cur];
      if (this.running && !b.querySelector('source')) this.load(b);
    }, 1500);
  }

  /** Start playing; where autoplay is refused (iOS in low power mode) the first touch or click starts it. */
  private kick(v: HTMLVideoElement) {
    void v.play().catch(() => {
      // events that count as a user gesture for media (on touch that is the lift of the finger, not the press)
      const events = ['touchend', 'click', 'keydown'];
      const retry = () => {
        for (const e of events) window.removeEventListener(e, retry, true);
        if (this.running && v.paused) void v.play().catch(() => undefined);
      };
      for (const e of events) window.addEventListener(e, retry, true);
    });
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const v of this.vids) v.pause();
  }

  /** Fade the other player in over the current one; the current one holds its last frame (the shared still). */
  private next() {
    if (this.switching) return;
    this.switching = true;
    const a = this.vids[this.cur];
    const b = this.vids[1 - this.cur];
    if (!b.querySelector('source')) this.load(b);
    b.currentTime = 0;
    b.classList.remove('on');
    b.style.zIndex = '2';
    a.style.zIndex = '1';
    b.addEventListener(
      'playing',
      () => {
        requestAnimationFrame(() => b.classList.add('on'));
        setTimeout(() => {
          a.pause();
          a.classList.remove('on');
          this.cur = 1 - this.cur;
          this.switching = false;
          if (this.running) this.load(a); // the next clip loads while this one plays
        }, FADE_MS + 50);
      },
      { once: true },
    );
    if (this.running) this.kick(b);
  }
}
