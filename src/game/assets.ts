import type { BuildingId, ItemId, TerrainId } from './types';

const cache = new Map<string, HTMLImageElement>();

function load(key: string, url: string): HTMLImageElement {
  let img = cache.get(key);
  if (img) return img;
  img = new Image();
  img.decoding = 'async';
  img.src = url;
  cache.set(key, img);
  return img;
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function buildingSprite(id: BuildingId | 'core_0' | 'core_1' | 'core_2'): HTMLImageElement {
  return load(`b:${id}`, `${base}/assets/buildings/${id}.webp`);
}

export function terrainSprite(id: TerrainId): HTMLImageElement {
  return load(`t:${id}`, `${base}/assets/terrain/${id}.webp`);
}

export function itemSprite(id: ItemId): HTMLImageElement {
  return load(`i:${id}`, `${base}/assets/items/${id}.webp`);
}

export function terrainUrl(id: TerrainId): string {
  return `${base}/assets/terrain/${id}.webp`;
}

export function itemUrl(id: ItemId): string {
  return `${base}/assets/items/${id}.webp`;
}

export function buildingUrl(id: BuildingId): string {
  return `${base}/assets/buildings/${id}.webp`;
}

export function uiUrl(name: string): string {
  return `${base}/assets/ui/${name}`;
}

export function ready(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Preload everything so the first frame is not full of placeholders. */
export function preloadAll(buildings: BuildingId[], terrain: TerrainId[], items: ItemId[]): Promise<void> {
  const imgs = [
    ...buildings.map(buildingSprite),
    ...terrain.map(terrainSprite),
    ...items.map(itemSprite),
  ];
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((res) => {
          if (ready(img)) return res();
          img.onload = () => res();
          img.onerror = () => res();
        }),
    ),
  ).then(() => undefined);
}
