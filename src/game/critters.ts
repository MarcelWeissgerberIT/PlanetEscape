// Little alien critters that wander the map: they walk over open ground, belts and roads, stop to look around,
// avoid machines and rock, scurry away from robots and from a tap. Purely visual (not saved, no effect on the game).
import { TILE } from './camera';
import type { Sim } from './sim';
import type { GameState } from './types';

interface Critter {
  x: number; // tiles
  y: number;
  dir: number; // radians
  speed: number; // tiles per second
  mode: 'walk' | 'idle' | 'flee';
  t: number; // seconds left in this mode
  size: number; // body radius in tiles
  phase: number; // leg animation
  shell: string;
  blink: number;
}

const SHELLS = ['#6b4f7a', '#4f6b5e', '#7a5a45', '#4d5b78', '#6e4a52'];

export class Critters {
  private list: Critter[] = [];
  private state: GameState | null = null;

  /** (Re)populate when the game changed: a few per area, away from the start and never inside anything. */
  sync(sim: Sim) {
    const s = sim.state;
    if (this.state === s) return;
    this.state = s;
    this.list = [];
    if (s.options.mode === 'playground') return;
    const want = Math.min(28, Math.round((s.width * s.height) / 380));
    for (let tries = 0; this.list.length < want && tries < want * 40; tries++) {
      const x = Math.floor(Math.random() * s.width), y = Math.floor(Math.random() * s.height);
      if (Math.hypot(x - s.width / 2, y - s.height / 2) < 7 || !this.open(sim, x, y)) continue;
      this.list.push({ x: x + 0.5, y: y + 0.5, dir: Math.random() * Math.PI * 2, speed: 0.35 + Math.random() * 0.35, mode: 'idle', t: Math.random() * 3, size: 0.17 + Math.random() * 0.08, phase: Math.random() * 10, shell: SHELLS[Math.floor(Math.random() * SHELLS.length)], blink: Math.random() * 4 });
    }
  }

  /** Walkable: open ground, deposits, belts and roads (they hop over those), not rock or machines. */
  private open(sim: Sim, tx: number, ty: number): boolean {
    if (!sim.inBounds(tx, ty)) return false;
    if (sim.state.terrain[ty * sim.state.width + tx] === 'rock') return false;
    const b = sim.at(tx, ty);
    return !b || b.type === 'conveyor' || b.type === 'road' || b.type === 'bus';
  }

  update(dt: number, sim: Sim) {
    if (!dt) return;
    const robots = sim.robots();
    for (const c of this.list) {
      c.t -= dt;
      c.blink -= dt;
      if (c.blink < -0.15) c.blink = 2 + Math.random() * 4;
      // a robot rolling close makes it run
      if (c.mode !== 'flee') for (const r of robots) if (Math.abs(r.x - c.x) < 1.4 && Math.abs(r.y - c.y) < 1.4) this.scare(c, r.x, r.y);
      if (c.mode === 'idle') {
        if (c.t <= 0) {
          c.mode = 'walk';
          c.t = 1.5 + Math.random() * 4;
          c.dir += (Math.random() - 0.5) * 2.4;
        }
        continue;
      }
      if (c.t <= 0) {
        c.mode = 'idle';
        c.t = 0.8 + Math.random() * 3;
        continue;
      }
      if (c.mode === 'walk') c.dir += (Math.random() - 0.5) * dt * 1.6; // a little wobble
      const sp = c.speed * (c.mode === 'flee' ? 4.5 : 1);
      const nx = c.x + Math.cos(c.dir) * sp * dt, ny = c.y + Math.sin(c.dir) * sp * dt;
      const ahead = { x: Math.floor(nx + Math.cos(c.dir) * c.size), y: Math.floor(ny + Math.sin(c.dir) * c.size) };
      if (!this.open(sim, ahead.x, ahead.y)) {
        c.dir += Math.PI * (0.6 + Math.random() * 0.8); // bump: turn around
        if (c.mode === 'walk' && Math.random() < 0.4) { c.mode = 'idle'; c.t = 0.5 + Math.random(); }
        continue;
      }
      c.x = nx;
      c.y = ny;
      c.phase += sp * dt * 22;
    }
  }

  private scare(c: Critter, fx: number, fy: number) {
    c.mode = 'flee';
    c.t = 0.9 + Math.random() * 0.5;
    c.dir = Math.atan2(c.y - fy, c.x - fx) + (Math.random() - 0.5) * 0.6;
  }

  /** A tap near a critter sends it running. Returns the critter's position (for a little effect) or null. */
  poke(wx: number, wy: number): { x: number; y: number } | null {
    const tx = wx / TILE, ty = wy / TILE;
    let hit: Critter | null = null;
    for (const c of this.list) if (Math.hypot(c.x - tx, c.y - ty) < 0.55) hit = c;
    if (!hit) return null;
    this.scare(hit, tx, ty);
    hit.t = 1.6;
    return { x: hit.x * TILE, y: hit.y * TILE };
  }

  draw(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, glow: string, time: number) {
    for (const c of this.list) {
      if (c.x < x0 - 1 || c.x > x1 + 2 || c.y < y0 - 1 || c.y > y1 + 2) continue;
      const px = c.x * TILE, py = c.y * TILE, r = c.size * TILE;
      const moving = c.mode !== 'idle';
      const hop = c.mode === 'flee' ? Math.abs(Math.sin(c.phase * 0.5)) * r * 0.5 : 0;
      ctx.save();
      ctx.translate(px, py);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.35, r * 1.05, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(0, -hop);
      ctx.rotate(c.dir);
      // six little legs
      ctx.strokeStyle = '#1f1b24';
      ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const ax = (i - 1) * r * 0.55;
        const swing = moving ? Math.sin(c.phase + i * 2.1) * r * 0.35 : 0;
        for (const side of [-1, 1]) {
          const sw = side < 0 ? swing : -swing;
          ctx.moveTo(ax, side * r * 0.5);
          ctx.lineTo(ax + sw, side * r * 1.25);
        }
      }
      ctx.stroke();
      // body: a round shell with spots
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.1);
      grad.addColorStop(0, '#cbd5e1');
      grad.addColorStop(0.25, c.shell);
      grad.addColorStop(1, '#15121a');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.05, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (const [sx, sy, sr] of [[-0.35, 0.3, 0.18], [-0.05, -0.35, 0.14], [-0.5, -0.1, 0.12]]) {
        ctx.beginPath();
        ctx.arc(sx * r, sy * r, sr * r, 0, Math.PI * 2);
        ctx.fill();
      }
      // two glowing eyes at the front (blinking now and then); idle ones look around
      const look = moving ? 0 : Math.sin(time * 1.3 + c.phase) * 0.25;
      if (c.blink > 0) {
        ctx.fillStyle = glow;
        ctx.shadowColor = glow;
        ctx.shadowBlur = r * 1.2;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(r * 0.72, side * r * 0.32 + look * r, r * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
  }
}
