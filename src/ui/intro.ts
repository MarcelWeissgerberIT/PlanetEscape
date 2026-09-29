// Cinematic intro: plays on every start (page load on the web, launch of the app) and can always be skipped
// (button, Esc, Enter, Space). Browsers only start a video with sound after a click, so the web version first
// shows a "click to start" screen when autoplay is refused; the desktop app starts right away.
import { videoUrl } from '../game/assets';
import { IS_DESKTOP } from '../game/desktop';
import { t } from '../i18n';

/** 1080p for the app and large screens, 720p for phones and small windows (half the download). */
export function videoHeight(): 1080 | 720 {
  const px = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1);
  return IS_DESKTOP || px >= 1700 ? 1080 : 720;
}

/** Safari (every browser on iPhone/iPad included): H.264 is decoded in hardware there, WebM is patchy. */
const APPLE = /Apple/.test(navigator.vendor) || /iPad|iPhone|iPod/.test(navigator.userAgent);

/** <source> tags for a video: VP9/WebM first (Chromium, Firefox), H.264/MP4 first on Apple devices. */
export function videoSources(name: string, h: number = videoHeight()): string {
  const webm = `<source src="${videoUrl(`${name}_${h}.webm`)}" type="video/webm">`;
  const mp4 = `<source src="${videoUrl(`${name}_${h}.mp4`)}" type="video/mp4">`;
  return APPLE ? mp4 + webm : webm + mp4;
}

/** Automated browsers (the screenshot and check tools) and ?nointro go straight to the menu; ?intro forces it. */
export function introWanted(): boolean {
  const q = new URLSearchParams(location.search);
  return q.has('intro') || (!navigator.webdriver && !q.has('nointro'));
}

export function playIntro(): Promise<void> {
  return new Promise((done) => {
    const el = document.createElement('div');
    el.className = 'intro-overlay';
    el.innerHTML = `<video class="intro-video" playsinline webkit-playsinline preload="auto">${videoSources('intro')}</video>
      <button class="intro-start hidden"><span class="intro-play">▶</span><b>PLANET <span class="accent">ESCAPE</span></b><small>${t('intro_start')}</small></button>
      <button class="btn ghost intro-skip">${t('intro_skip')} ›</button>`;
    document.body.appendChild(el);
    const video = el.querySelector('video') as HTMLVideoElement;
    const gate = el.querySelector('.intro-start') as HTMLButtonElement;
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      window.removeEventListener('keydown', onKey, true);
      video.pause();
      el.classList.add('out');
      setTimeout(() => {
        video.querySelectorAll('source').forEach((s) => s.remove());
        video.load(); // stop the download
        el.remove();
        done();
      }, 700);
    };
    const onKey = (e: KeyboardEvent) => {
      const confirm = e.key === 'Enter' || e.key === ' ';
      if (!confirm && e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (confirm && !gate.classList.contains('hidden')) start(); // on the start screen Enter/Space start, Esc skips
      else finish();
    };
    const start = () => {
      gate.classList.add('hidden');
      video.muted = false;
      void video.play().catch(finish); // still refused (or no video): straight to the menu
    };
    window.addEventListener('keydown', onKey, true);
    (el.querySelector('.intro-skip') as HTMLButtonElement).addEventListener('click', finish);
    gate.addEventListener('click', start);
    video.addEventListener('ended', finish);
    video.querySelector('source:last-child')?.addEventListener('error', finish); // no source playable: menu
    // try with sound; a browser without a click so far says no: show the start screen
    video.play().catch(() => {
      if (!over) gate.classList.remove('hidden');
    });
  });
}
