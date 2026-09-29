// Atmosphere, purely visual: weather that fits the planet (snow, ash and embers, glowing spores, dust, motes), the
// day and night cycle with lights that shine through the dark, and the living liquids (oil sheen, ice glints,
// lava that flows). Nothing here touches the game rules; solar power does not depend on the time of day.
import type { Biome } from './scenery';

// ---------- day and night ----------

/** One day in seconds of play. */
export const DAY_SECONDS = 480;

/** Darkness 0 (day) .. 1 (deep night) and the warm dusk/dawn tint strength, for a time of play. */
export function daylight(time: number): { dark: number; dusk: number } {
  const p = ((time / DAY_SECONDS + 0.05) % 1 + 1) % 1; // a game starts in the morning
  const smooth = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  let dark = 0;
  if (p >= 0.5 && p < 0.62) dark = smooth(0.5, 0.62, p); // dusk
  else if (p >= 0.62 && p < 0.88) dark = 1; // night
  else if (p >= 0.88) dark = 1 - smooth(0.88, 1, p); // dawn
  const dusk = Math.max(0, 1 - Math.abs(p - 0.56) / 0.07) + Math.max(0, 1 - Math.abs(p - 0.94) / 0.06);
  return { dark, dusk: Math.min(1, dusk) };
}

export interface Light {
  x: number; // screen pixels
  y: number;
  r: number; // screen pixels
  color: string; // rgb triple "r,g,b"
  strength: number; // 0..1
}

/** The dark of the night on its own canvas, with holes where lights shine, plus their coloured glow. */
export class NightPass {
  private canvas = document.createElement('canvas');

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, dark: number, dusk: number, lights: Light[]) {
    if (dusk > 0.01) {
      ctx.fillStyle = `rgba(255,120,60,${0.1 * dusk})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (dark < 0.01) return;
    const c = this.canvas;
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.fillStyle = `rgba(6,10,28,${0.54 * dark})`;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      if (l.x < -l.r || l.y < -l.r || l.x > w + l.r || l.y > h + l.r) continue;
      const grad = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grad.addColorStop(0, `rgba(0,0,0,${0.95 * l.strength})`);
      grad.addColorStop(0.55, `rgba(0,0,0,${0.45 * l.strength})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c, 0, 0);
    ctx.restore();
    // the coloured halo of each light, stronger the darker it is
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (l.x < -l.r || l.y < -l.r || l.x > w + l.r || l.y > h + l.r) continue;
      const r = l.r * 0.7;
      const grad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      grad.addColorStop(0, `rgba(${l.color},${0.22 * dark * l.strength})`);
      grad.addColorStop(1, `rgba(${l.color},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------- weather ----------

interface Flake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number; // size
  p: number; // phase
  kind: number; // 0 main, 1 secondary (embers in ash, violet spores, ...)
}

const COUNT: Record<Biome['id'], number> = { ice: 110, volcanic: 80, moss: 46, rust: 40, basalt: 30 };

/** Screen-space weather particles for the planet's biome; they wrap around the edges of the screen. */
export class Weather {
  private flakes: Flake[] = [];
  private biome: Biome['id'] | null = null;

  private make(b: Biome['id'], w: number, h: number, anywhere: boolean): Flake {
    const x = Math.random() * w, y = anywhere ? Math.random() * h : -10;
    const r = Math.random();
    switch (b) {
      case 'ice':
        return { x, y, vx: -6 + Math.random() * 12, vy: 18 + Math.random() * 30, s: 0.8 + Math.random() * 2, p: Math.random() * 6, kind: 0 };
      case 'volcanic':
        return r < 0.15
          ? { x, y: anywhere ? y : h + 10, vx: -8 + Math.random() * 16, vy: -(18 + Math.random() * 26), s: 1 + Math.random() * 1.5, p: Math.random() * 6, kind: 1 }
          : { x, y, vx: 4 + Math.random() * 10, vy: 12 + Math.random() * 18, s: 1 + Math.random() * 1.8, p: Math.random() * 6, kind: 0 };
      case 'moss':
        return { x, y: anywhere ? y : h + 10, vx: -4 + Math.random() * 8, vy: -(5 + Math.random() * 10), s: 1.2 + Math.random() * 1.6, p: Math.random() * 6, kind: r < 0.4 ? 1 : 0 };
      case 'rust':
        return { x: anywhere ? x : -60, y: Math.random() * h, vx: 60 + Math.random() * 90, vy: -4 + Math.random() * 8, s: 18 + Math.random() * 40, p: Math.random() * 6, kind: 0 };
      default:
        return { x, y, vx: -5 + Math.random() * 10, vy: -3 + Math.random() * 6, s: 0.8 + Math.random() * 1.2, p: Math.random() * 6, kind: 0 };
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number, b: Biome['id'], dark: number, time: number) {
    const want = Math.round(COUNT[b] * Math.min(1.6, (w * h) / (1600 * 900)));
    if (this.biome !== b) {
      this.biome = b;
      this.flakes = [];
    }
    while (this.flakes.length < want) this.flakes.push(this.make(b, w, h, true));
    if (this.flakes.length > want) this.flakes.length = want;
    const dim = 1 - 0.5 * dark; // plain flakes fade a little at night, glowing ones do not
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      f.p += dt;
      f.x += (f.vx + Math.sin(f.p * 1.3) * (b === 'rust' ? 0 : 10)) * dt;
      f.y += f.vy * dt;
      if (f.x < -80 || f.x > w + 80 || f.y < -20 || f.y > h + 20) {
        this.flakes[i] = this.make(b, w, h, false);
        if (b === 'rust') this.flakes[i].x = -60;
        continue;
      }
      switch (b) {
        case 'ice':
          ctx.fillStyle = `rgba(240,248,255,${0.75 * dim})`;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'volcanic':
          if (f.kind === 1) {
            const fl = 0.55 + 0.45 * Math.sin(f.p * 9 + i);
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(251,146,60,${0.85 * fl})`;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(251,146,60,${0.18 * fl})`;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.s * 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          } else {
            ctx.fillStyle = `rgba(120,116,120,${0.55 * dim})`;
            ctx.fillRect(f.x, f.y, f.s * 1.6, f.s);
          }
          break;
        case 'moss': {
          const pulse = 0.5 + 0.5 * Math.sin(f.p * 2 + i);
          const col = f.kind ? '192,132,252' : '94,234,212';
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(${col},${0.25 * pulse + 0.1})`;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.s * 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(${col},${0.6 * pulse + 0.3})`;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'rust':
          ctx.strokeStyle = `rgba(214,170,130,${0.13 * dim})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x - f.s, f.y - f.vy * 0.1);
          ctx.stroke();
          break;
        default: {
          const tw = 0.5 + 0.5 * Math.sin(time * 1.5 + i);
          ctx.fillStyle = `rgba(200,230,255,${0.22 * tw * dim + 0.05})`;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

// ---------- flowing lava ----------

const masks = new Map<HTMLImageElement, HTMLCanvasElement>();
const flowCanvas = document.createElement('canvas');
const FLOW_PX = 96;

/** The glowing parts of a sprite (bright orange pixels) as an alpha mask, made once per image. */
function glowMask(img: HTMLImageElement): HTMLCanvasElement {
  let m = masks.get(img);
  if (m) return m;
  m = document.createElement('canvas');
  m.width = m.height = FLOW_PX;
  const g = m.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, FLOW_PX, FLOW_PX);
  const d = g.getImageData(0, 0, FLOW_PX, FLOW_PX);
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i], gg = d.data[i + 1], b = d.data[i + 2], a = d.data[i + 3];
    const hot = r > 190 && gg > 70 && b < 140 && r - b > 90;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
    d.data[i + 3] = hot ? a : 0;
  }
  g.putImageData(d, 0, 0);
  masks.set(img, m);
  return m;
}

/** Bright bands running through the glowing parts of a lava sprite: the lava seems to flow. */
export function drawLavaFlow(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number, time: number, seed: number) {
  const mask = glowMask(img);
  flowCanvas.width = flowCanvas.height = FLOW_PX;
  const g = flowCanvas.getContext('2d')!;
  const off = ((time * 26 + seed * 17) % 48) - 48;
  const grad = g.createLinearGradient(off, off, off + 48, off + 48);
  grad.addColorStop(0, 'rgba(255,240,160,0)');
  grad.addColorStop(0.5, 'rgba(255,240,160,1)');
  grad.addColorStop(1, 'rgba(255,240,160,0)');
  g.fillStyle = grad;
  // repeat the band across the square
  for (let k = -2; k < 4; k++) {
    g.save();
    g.translate(k * 48, k * 48);
    g.fillRect(-FLOW_PX, -FLOW_PX, FLOW_PX * 3, FLOW_PX * 3);
    g.restore();
  }
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-over';
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.55;
  ctx.drawImage(flowCanvas, x, y, size, size);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
