// The interface sounds for the whole UI, wired once through delegated listeners: a soft tick when the pointer
// reaches a control, a press on menu buttons, a whoosh when a page or the info panel opens and closes.
import { sfx } from '../game/sfx';

/** Controls that tick on hover (the menu entries have their own tick in the title and pause screens). */
const HOVER = 'button:not(:disabled), .tc, input[type="range"], a.ai-link';
const OWN_HOVER = '.aaa-item, .aaa-alt';
/** Where a press gets the click sound; in-game panels and the build bar confirm with their own sounds. */
const CLICK_AREAS = '.title-screen, .modal, .pause-screen, .hud-top';

let lastHover: Element | null = null;
let lastHoverAt = 0;

export function wireUiSounds() {
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const b = (e.target as HTMLElement).closest?.(HOVER);
    if (!b || b === lastHover) return;
    lastHover = b;
    if (b.closest(OWN_HOVER)) return;
    const now = performance.now();
    if (now - lastHoverAt < 45) return;
    lastHoverAt = now;
    sfx.hover();
  });
  document.addEventListener('pointerout', (e) => {
    if (lastHover && !lastHover.contains(e.relatedTarget as Node)) lastHover = null;
  });
  document.addEventListener(
    'click',
    (e) => {
      const b = (e.target as HTMLElement).closest?.('button');
      if (!b || !b.closest(CLICK_AREAS) || b.closest('.seg')) return;
      if (b.dataset.act === 'close' || b.classList.contains('page-back') || b.dataset.act === 'back') return; // the page closing speaks for itself
      sfx.click();
    },
    true,
  );
  // pages, the pause screen and the info panel: a whoosh in, a whoosh out
  const watch = (sel: string, open: () => void, close: () => void) => {
    const hook = (node: Element) => {
      let was = !node.classList.contains('hidden');
      new MutationObserver(() => {
        const now = !node.classList.contains('hidden');
        if (now === was) return;
        was = now;
        (now ? open : close)();
      }).observe(node, { attributes: true, attributeFilter: ['class'] });
    };
    const found = document.querySelector(sel);
    if (found) return hook(found);
    // created later (the pause screen appears on first use)
    const mo = new MutationObserver(() => {
      const n = document.querySelector(sel);
      if (!n) return;
      mo.disconnect();
      hook(n);
      if (!n.classList.contains('hidden')) open();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  };
  watch('.modal', sfx.pageOpen, sfx.pageClose);
  watch('.pause-screen', sfx.pageOpen, sfx.pageClose);
  watch('#ui > .info-panel, .info-panel', sfx.panelOpen, () => {});
}
