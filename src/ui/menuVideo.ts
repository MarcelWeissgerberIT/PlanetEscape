// The main menu's silent background video, looped without the hitch of <video loop>: just before the end the
// current frame is copied onto a canvas on top, the video jumps back to the start underneath, and the canvas fades
// out once the video runs again. The clip starts and ends on the same picture, so the seam is a soft dissolve.
import { videoSources } from './intro';

const FADE_MS = 600;
const LEAD = 0.15; // seconds before the end when the seam starts

export class MenuVideo {
  private video: HTMLVideoElement;
  private cover: HTMLCanvasElement;
  private running = false;
  private seaming = false;
  private raf = 0;

  constructor(host: HTMLElement) {
    this.video = document.createElement('video');
    this.video.className = 'title-video';
    // iOS only autoplays a video that is muted and inline from the start: attributes, not just properties
    for (const a of ['muted', 'playsinline', 'webkit-playsinline', 'autoplay']) this.video.setAttribute(a, '');
    this.video.muted = true;
    this.video.defaultMuted = true;
    this.video.playsInline = true;
    this.video.preload = 'none';
    this.cover = document.createElement('canvas');
    this.cover.className = 'title-video-cover';
    host.append(this.video, this.cover);
    this.video.addEventListener('playing', () => this.video.classList.add('on'), { once: true });
    this.video.addEventListener('ended', () => this.seam()); // in case the frame watch missed the end
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (!this.video.querySelector('source')) {
      this.video.innerHTML = videoSources('menu');
      this.video.load();
    }
    this.kick();
    const watch = () => {
      if (!this.running) return;
      const v = this.video;
      if (!this.seaming && v.duration && v.currentTime >= v.duration - LEAD) this.seam();
      this.raf = requestAnimationFrame(watch);
    };
    this.raf = requestAnimationFrame(watch);
  }

  /** Start playing; where autoplay is refused (iOS in low power mode) the first touch or click starts it. */
  private kick() {
    void this.video.play().catch(() => {
      // events that count as a user gesture for media (on touch that is the lift of the finger, not the press)
      const events = ['touchend', 'click', 'keydown'];
      const retry = () => {
        for (const e of events) window.removeEventListener(e, retry, true);
        if (this.running && this.video.paused) void this.video.play().catch(() => undefined);
      };
      for (const e of events) window.addEventListener(e, retry, true);
    });
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.video.pause();
  }

  private seam() {
    if (this.seaming) return;
    this.seaming = true;
    const v = this.video;
    const c = this.cover;
    try {
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
      c.classList.remove('fade');
      c.classList.add('show');
    } catch {
      /* no frame to hold: the jump shows, nothing breaks */
    }
    const resume = () => {
      c.classList.add('fade'); // fade the held frame out over the running video
      setTimeout(() => {
        c.classList.remove('show', 'fade');
        this.seaming = false;
      }, FADE_MS);
    };
    v.addEventListener('seeked', () => requestAnimationFrame(resume), { once: true });
    v.currentTime = 0;
    if (v.paused && this.running) this.kick();
  }
}
