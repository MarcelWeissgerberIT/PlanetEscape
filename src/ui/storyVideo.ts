// Short story clips (8 s, with sound): one explains a chapter when it starts, one rewards finishing it. They play
// inside the chapter cards; sound follows the game's sound switch, and a click on the picture plays the clip again.
import { soundEnabled } from '../game/sfx';
import { videoSources } from './intro';

export type StoryClip = 'intro' | 'done';

/** The clip for chapter `ch` (1-based); only 720p, the card is never larger. */
export function storyVideoHtml(ch: number, kind: StoryClip): string {
  return `<div class="story-video" data-clip="${kind}">
    <video playsinline webkit-playsinline preload="auto">${videoSources(`story/ch${ch}_${kind}`, 720)}</video>
    <span class="sv-replay" aria-hidden="true">↻</span>
  </div>`;
}

/** Start the clips in `root` (the first one right away, the others on click). */
export function wireStoryVideos(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.story-video').forEach((box, i) => {
    const v = box.querySelector('video') as HTMLVideoElement;
    const play = () => {
      box.classList.remove('ended');
      v.muted = !soundEnabled();
      v.currentTime = 0;
      // a browser that refuses sound without a click still plays it silently
      void v.play().catch(() => {
        v.muted = true;
        void v.play().catch(() => box.classList.add('ended'));
      });
    };
    v.addEventListener('ended', () => box.classList.add('ended'));
    v.querySelector('source:last-child')?.addEventListener('error', () => box.remove()); // clip missing: no empty frame
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      play();
    });
    if (i === 0) play();
    else box.classList.add('ended');
  });
}
