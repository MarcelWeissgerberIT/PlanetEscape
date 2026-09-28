// Small DOM and HTML helpers shared by the HUD modules.
import { itemUrl } from '../game/assets';
import type { ItemId } from '../game/types';
import { tItem } from '../i18n';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function itemImg(id: ItemId, cls = 'icon'): string {
  return `<img class="${cls}" src="${itemUrl(id)}" alt="${tItem(id)}" data-item="${id}" draggable="false">`;
}

export function costHtml(cost: Partial<Record<ItemId, number>>, inv: Partial<Record<ItemId, number>>): string {
  return Object.entries(cost)
    .map(([k, n]) => {
      const have = inv[k as ItemId] ?? 0;
      return `<span class="cost ${have < n! ? 'short' : ''}">${itemImg(k as ItemId, 'icon xs')}${n}</span>`;
    })
    .join('');
}

export function fmtTime(sec: number): string {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}:${String(s).padStart(2, '0')}`;
}

export const DIR_ARROWS = ['▲', '▶', '▼', '◀'];
