import { buildingSprite, itemSprite, ready, terrainSprite } from './assets';
import { Camera, TILE } from './camera';
import { BELT_SPACING, BUILDINGS, ITEMS, MIXER_RATIOS, ORE_PER_TILE, RECIPE_BY_ID, TERRAIN_ITEM } from './data';
import type { Sim } from './sim';
import type { Blueprint, Building, BuildingId, Dir, ItemId } from './types';
import { DX, DY } from './types';

export interface Ghost {
  type: BuildingId;
  x: number;
  y: number;
  dir: Dir;
  valid: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color?: string;
  item?: ItemId;
  grav?: number;
}

const BELT_STRIP = 0.26; // fraction of the tile width that is moving belt surface in the texture
const BELT_TRIM = 0.085; // rail end caps in the texture, trimmed so consecutive tiles join

export class Renderer {
  ctx: CanvasRenderingContext2D;
  cam = new Camera();
  ground: CanvasPattern | null = null;
  time = 0;
  ghost: Ghost | null = null;
  selected: Building | null = null;
  selectedTile: { x: number; y: number } | null = null;
  selectRect: { x0: number; y0: number; x1: number; y1: number } | null = null;
  pasteGhost: { bp: Blueprint; x: number; y: number; bad: Set<number> } | null = null;
  beltPreview: { x: number; y: number; dir: Dir; ok: boolean }[] | null = null;
  paused = false;
  deleteMode = false;
  overlay = false;
  ping: { x: number; y: number; w: number; h: number } | null = null;
  private panTarget: { x: number; y: number } | null = null;
  dpr = 1;
  private particles: Particle[] = [];
  private spawn = new Map<number, number>();
  private flows: { path: { x: number; y: number }[]; target: Building | null; from: Building }[] = [];
  private flowT = 0;
  private stormDust: { x: number; y: number; l: number; s: number }[] = [];
  private mini: HTMLCanvasElement | null = null;
  private miniT = 0;
  /** Low-resolution pre-rendered terrain used when zoomed out (large maps: one drawImage instead of thousands). */
  private terrainCache: HTMLCanvasElement | null = null;
  private cacheComplete = false;
  private cacheT = 0;
  private dirtyTiles: { x: number; y: number }[] = [];
  lowDetail = false;
  static readonly CACHE_PX = 12;
  static readonly CACHE_ZOOM = 0.45;
  static readonly LOW_ZOOM = 0.3;

  constructor(public canvas: HTMLCanvasElement, public sim: Sim) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.makeGround();
  }

  private makeGround() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#373d45';
    g.fillRect(0, 0, 256, 256);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * 256, y = rnd() * 256, r = rnd() * 1.6 + 0.3;
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.22)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(120,140,160,0.08)';
    for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 16) {
      g.beginPath();
      g.arc(x + ((y / 16) % 2) * 8, y, 1.1, 0, Math.PI * 2);
      g.fill();
    }
    this.ground = this.ctx.createPattern(c, 'repeat');
  }

  resize(w = window.innerWidth, h = window.innerHeight) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.cam.resize(w, h);
  }

  centerOnCore() {
    const s = this.sim.state;
    this.cam.x = (s.width / 2) * TILE;
    this.cam.y = (s.height / 2) * TILE;
    const minDim = Math.min(this.cam.width, this.cam.height);
    this.cam.zoom = Math.max(0.3, Math.min(1.0, minDim / (TILE * 17)));
  }

  /** Smoothly pan the camera so world point (px,py) lands at screen point (sx,sy). */
  panTo(px: number, py: number, sx: number, sy: number) {
    const z = this.cam.zoom;
    this.panTarget = { x: px - (sx - this.cam.width / 2) / z, y: py - (sy - this.cam.height / 2) / z };
  }

  cancelPan() {
    this.panTarget = null;
  }

  centerOn(tx: number, ty: number, zoom?: number) {
    this.cam.x = (tx + 0.5) * TILE;
    this.cam.y = (ty + 0.5) * TILE;
    if (zoom) this.cam.zoom = zoom;
  }

  // ---------- Effects ----------

  fxCraft(b: Building) {
    const sz = BUILDINGS[b.type].size * TILE;
    const cx = b.x * TILE + sz / 2, cy = b.y * TILE + sz / 2;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 60;
      this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.5, max: 0.5, size: 2 + Math.random() * 2, color: Math.random() < 0.5 ? '#fbbf24' : '#22d3ee', grav: 120 });
    }
  }

  fxDelivered(item: ItemId) {
    const core = this.sim.state.buildings[0];
    const sz = 3 * TILE;
    this.particles.push({ x: core.x * TILE + sz / 2 + (Math.random() - 0.5) * 60, y: core.y * TILE + sz / 2, vx: 0, vy: -40, life: 1.1, max: 1.1, size: 22, item });
  }

  /** Repaint one tile of the terrain cache (deposit alpha changes as it empties, meteorites add deposits). */
  private paintCacheTile(cc: CanvasRenderingContext2D, x: number, y: number): boolean {
    const s = this.sim.state;
    const P = Renderer.CACHE_PX;
    const i = y * s.width + x;
    const t = s.terrain[i];
    cc.save();
    cc.beginPath();
    cc.rect(x * P, y * P, P, P);
    cc.clip();
    cc.fillStyle = '#373d45';
    cc.fillRect(x * P, y * P, P, P);
    if (this.ground) {
      // draw the ground pattern at the cache scale so it matches the live rendering
      cc.save();
      cc.scale(P / TILE, P / TILE);
      cc.fillStyle = this.ground;
      cc.fillRect(x * TILE, y * TILE, TILE, TILE);
      cc.restore();
    }
    let complete = true;
    if (t !== 'ground') {
      const img = terrainSprite(t);
      if (t === 'rock') {
        if (ready(img)) cc.drawImage(img, x * P, y * P, P, P);
        else {
          complete = false;
          cc.fillStyle = '#2a2d33';
          cc.fillRect(x * P + 1, y * P + 1, P - 2, P - 2);
        }
      } else {
        const frac = Math.min(1, (s.ore[i] ?? ORE_PER_TILE[1]) / ORE_PER_TILE[1]);
        cc.globalAlpha = 0.4 + 0.6 * frac;
        if (ready(img)) cc.drawImage(img, x * P, y * P, P, P);
        else {
          complete = false;
          cc.fillStyle = ITEMS[TERRAIN_ITEM[t]!].color;
          cc.fillRect(x * P + 2, y * P + 2, P - 4, P - 4);
        }
        cc.globalAlpha = 1;
      }
    }
    cc.restore();
    return complete;
  }

  private buildTerrainCache() {
    const s = this.sim.state;
    const P = Renderer.CACHE_PX;
    const c = this.terrainCache ?? document.createElement('canvas');
    c.width = s.width * P;
    c.height = s.height * P;
    const cc = c.getContext('2d')!;
    let complete = true;
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (!this.paintCacheTile(cc, x, y)) complete = false;
    this.terrainCache = c;
    this.cacheComplete = complete;
    this.dirtyTiles = [];
  }

  private flushDirtyTiles() {
    if (!this.terrainCache || !this.dirtyTiles.length) return;
    const cc = this.terrainCache.getContext('2d')!;
    for (const d of this.dirtyTiles) if (this.sim.inBounds(d.x, d.y)) this.paintCacheTile(cc, d.x, d.y);
    this.dirtyTiles = [];
  }

  /** Mark terrain tiles as changed (depletion, meteorite). */
  terrainChanged(x: number, y: number, r = 0) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) this.dirtyTiles.push({ x: x + dx, y: y + dy });
  }

  fxDepleted(x: number, y: number) {
    this.terrainChanged(x, y);
    for (let i = 0; i < 10; i++) {
      this.particles.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40, life: 0.8, max: 0.8, size: 4 + Math.random() * 4, color: 'rgba(160,150,140,0.7)' });
    }
  }

  fxMeteor(x: number, y: number) {
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 260;
      this.particles.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: 0, max: 0.8 + Math.random() * 0.8, size: 3 + Math.random() * 6, color: i % 3 ? '#f59e0b' : '#fde68a', grav: 300 });
    }
    this.ping = { x: x - 1, y: y - 1, w: 3, h: 3 };
    this.terrainChanged(x, y, 1);
    setTimeout(() => (this.ping = null), 2500);
  }

  fxUpgrade() {
    const core = this.sim.state.buildings[0];
    const sz = 3 * TILE;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.particles.push({ x: core.x * TILE + sz / 2, y: core.y * TILE + sz / 2, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.9, max: 0.9, size: 4, color: '#22d3ee' });
    }
  }

  // ---------- Frame ----------

  draw(dt: number) {
    if (!this.paused) this.time += dt;
    const { ctx, cam } = this;
    if (this.panTarget) {
      const k = Math.min(1, dt * 9);
      cam.x += (this.panTarget.x - cam.x) * k;
      cam.y += (this.panTarget.y - cam.y) * k;
      if (Math.hypot(this.panTarget.x - cam.x, this.panTarget.y - cam.y) < 0.5) this.panTarget = null;
    }
    const s = this.sim.state;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#1a1d23';
    ctx.fillRect(0, 0, cam.width, cam.height);

    ctx.save();
    ctx.translate(cam.width / 2, cam.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const [tx0, ty0] = cam.screenToTile(0, 0);
    const [tx1, ty1] = cam.screenToTile(cam.width, cam.height);
    const x0 = Math.max(0, tx0), y0 = Math.max(0, ty0);
    const x1 = Math.min(s.width - 1, tx1 + 1), y1 = Math.min(s.height - 1, ty1 + 1);

    this.lowDetail = cam.zoom < Renderer.LOW_ZOOM;
    const useCache = cam.zoom < Renderer.CACHE_ZOOM;
    if (useCache) {
      // zoomed out: one pre-rendered image instead of a sprite per tile
      this.cacheT += dt;
      if (!this.terrainCache || (!this.cacheComplete && this.cacheT > 2)) {
        this.cacheT = 0;
        this.buildTerrainCache();
      }
      this.flushDirtyTiles();
      const P = Renderer.CACHE_PX;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.terrainCache!, x0 * P, y0 * P, (x1 - x0 + 1) * P, (y1 - y0 + 1) * P, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
    } else {
      // depletion changes are painted into the cache lazily; remember them meanwhile
      if (this.dirtyTiles.length > 400) this.terrainCache = null;
    }

    ctx.fillStyle = this.ground ?? '#373d45';
    if (!useCache) ctx.fillRect(x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);

    // terrain features
    for (let y = useCache ? y1 + 1 : y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * s.width + x;
        const t = s.terrain[i];
        if (t === 'ground') continue;
        const img = terrainSprite(t);
        if (t === 'rock') {
          if (ready(img)) ctx.drawImage(img, x * TILE, y * TILE, TILE, TILE);
          else {
            ctx.fillStyle = '#2a2d33';
            ctx.fillRect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8);
          }
          continue;
        }
        const frac = Math.min(1, (s.ore[i] ?? ORE_PER_TILE[1]) / ORE_PER_TILE[1]);
        ctx.globalAlpha = 0.4 + 0.6 * frac;
        if (ready(img)) ctx.drawImage(img, x * TILE, y * TILE, TILE, TILE);
        else {
          ctx.fillStyle = ITEMS[TERRAIN_ITEM[t]!].color;
          ctx.fillRect(x * TILE + 8, y * TILE + 8, TILE - 16, TILE - 16);
        }
        ctx.globalAlpha = 1;
      }
    }

    if (cam.zoom > 0.5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.13)';
      ctx.lineWidth = 1 / cam.zoom;
      ctx.beginPath();
      for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(x * TILE, y0 * TILE); ctx.lineTo(x * TILE, (y1 + 1) * TILE); }
      for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(x0 * TILE, y * TILE); ctx.lineTo((x1 + 1) * TILE, y * TILE); }
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(56,189,248,0.35)';
    ctx.lineWidth = 3 / cam.zoom;
    ctx.strokeRect(0, 0, s.width * TILE, s.height * TILE);

    const visible: Building[] = [];
    for (const b of s.buildings) {
      const sz = BUILDINGS[b.type].size;
      if (b.x + sz <= x0 || b.x > x1 || b.y + sz <= y0 || b.y > y1) continue;
      visible.push(b);
    }
    for (const b of visible) if (b.type === 'conveyor' || b.type === 'tunnel') this.drawBelt(b);
    if (!this.lowDetail) for (const b of visible) if (b.type === 'conveyor' || (b.type === 'tunnel' && b.exit)) this.drawBeltItems(b);
    for (const b of visible) if (b.type !== 'conveyor' && b.type !== 'tunnel') this.drawBuilding(b);

    if (this.overlay) this.drawOverlay(visible, dt);

    this.drawParticles(dt);

    if (this.ghost) this.drawGhost(this.ghost);
    if (this.pasteGhost) this.drawPasteGhost(this.pasteGhost);
    if (this.beltPreview) this.drawBeltPreview(this.beltPreview);
    if (this.selectRect) {
      const r = this.selectRect;
      const x0 = Math.min(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), x1 = Math.max(r.x0, r.x1), y1 = Math.max(r.y0, r.y1);
      ctx.fillStyle = 'rgba(192,132,252,0.15)';
      ctx.fillRect(x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2 / cam.zoom;
      ctx.setLineDash([8 / cam.zoom, 6 / cam.zoom]);
      ctx.strokeRect(x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
      ctx.setLineDash([]);
    }

    if (this.selected) {
      const b = this.selected;
      const sz = BUILDINGS[b.type].size * TILE;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 3 / cam.zoom;
      ctx.setLineDash([8 / cam.zoom, 6 / cam.zoom]);
      ctx.lineDashOffset = -this.time * 30;
      ctx.strokeRect(b.x * TILE + 2, b.y * TILE + 2, sz - 4, sz - 4);
      ctx.setLineDash([]);
    }

    if (this.selectedTile) {
      const t = this.selectedTile;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3 / cam.zoom;
      ctx.setLineDash([8 / cam.zoom, 6 / cam.zoom]);
      ctx.lineDashOffset = -this.time * 30;
      ctx.strokeRect(t.x * TILE + 2, t.y * TILE + 2, TILE - 4, TILE - 4);
      ctx.setLineDash([]);
    }

    if (this.ping) {
      const p = this.ping;
      const pulse = (this.time * 1.2) % 1;
      ctx.strokeStyle = `rgba(251,191,36,${1 - pulse})`;
      ctx.lineWidth = 4 / cam.zoom;
      const grow = pulse * 24;
      ctx.strokeRect(p.x * TILE - grow, p.y * TILE - grow, p.w * TILE + grow * 2, p.h * TILE + grow * 2);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3 / cam.zoom;
      ctx.strokeRect(p.x * TILE, p.y * TILE, p.w * TILE, p.h * TILE);
    }

    ctx.restore();

    if (s.storm > 0) this.drawStorm(dt);
  }

  // ---------- Belts ----------

  /** Where does this belt receive from? */
  beltInput(b: Building): 'back' | 'left' | 'right' | 'none' {
    const back = this.sim.at(b.x - DX[b.dir], b.y - DY[b.dir]);
    if (back && this.feedsInto(back, b, b.dir)) return 'back';
    const ld = ((b.dir + 3) & 3) as Dir;
    const rd = ((b.dir + 1) & 3) as Dir;
    const left = this.sim.at(b.x + DX[ld], b.y + DY[ld]);
    const right = this.sim.at(b.x + DX[rd], b.y + DY[rd]);
    const lf = left && this.feedsInto(left, b, rd);
    const rf = right && this.feedsInto(right, b, ld);
    if (lf && !rf) return 'left';
    if (rf && !lf) return 'right';
    return 'none';
  }

  private feedsInto(from: Building, to: Building, dir: Dir): boolean {
    if (from.type === 'conveyor') return from.dir === dir;
    if (from.type === 'tunnel') return from.exit === true && from.dir === dir;
    if (from.type === 'splitter' || from.type === 'overflow') return from.dir !== ((dir + 2) & 3);
    if (from.type === 'sorter') return dir === from.dir || dir === ((from.dir + 3) & 3);
    if (from.type === 'mixer' || from.type === 'valve') return dir === from.dir;
    if (from.type === 'core' || from.type === 'solar' || from.type === 'generator') return false;
    return this.sim.frontTiles(from).some((t) => t.x === to.x && t.y === to.y);
  }

  private beltSpeedPx() {
    return 1.6 * this.sim.factor('belt') * TILE;
  }

  private drawBelt(b: Building) {
    const { ctx } = this;
    const cx = b.x * TILE + TILE / 2, cy = b.y * TILE + TILE / 2;
    if (this.lowDetail) {
      // far zoom: a flat strip with a darker moving lane; no textures, no items
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((b.dir * Math.PI) / 2);
      ctx.fillStyle = b.type === 'tunnel' ? '#3b4a5a' : '#4b5563';
      ctx.fillRect(-TILE / 2, -TILE * 0.36, TILE, TILE * 0.72);
      ctx.fillStyle = b.status === 'jammed' || b.status === 'dead_end' ? '#7f1d1d' : '#1f2937';
      ctx.fillRect(-TILE / 2, -TILE * 0.13, TILE, TILE * 0.26);
      ctx.restore();
      return;
    }
    const straight = buildingSprite('conveyor');
    const tunnelImg = buildingSprite('tunnel');
    const input = b.type === 'conveyor' ? this.beltInput(b) : 'back';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((b.dir * Math.PI) / 2);
    const curved = (input === 'left' || input === 'right') && ready(straight);
    if (b.type === 'tunnel' && !b.exit) {
      // entrance: belt comes in from behind and vanishes into the hatch
      if (ready(tunnelImg)) {
        ctx.drawImage(tunnelImg, -TILE / 2, -TILE / 2, TILE, TILE);
        this.scrollStrip(straight, 0, TILE / 2, true);
      } else this.fallbackBelt();
      if (b.pair == null) this.dot(0, -TILE / 4, '#ef4444');
    } else if (b.type === 'tunnel') {
      // exit: belt continues forward, hatch at the back
      if (ready(straight)) {
        this.drawStraight(straight);
        this.scrollStrip(straight, -TILE / 2, TILE / 2, false);
        if (ready(tunnelImg)) {
          ctx.save();
          ctx.rotate(Math.PI);
          ctx.drawImage(tunnelImg, 0, 0, tunnelImg.naturalWidth, tunnelImg.naturalHeight / 2, -TILE / 2, -TILE / 2, TILE, TILE / 2);
          ctx.restore();
        }
      } else this.fallbackBelt();
      if (b.pair == null) this.dot(0, TILE / 4, '#ef4444');
    } else if (curved) {
      // Mitred corner built from the straight texture: the incoming leg comes from the side,
      // the outgoing leg points up. Split along the 45° diagonal so rails meet cleanly.
      const sgn = input === 'left' ? -1 : 1; // side the items come from
      ctx.save();
      if (sgn < 0) ctx.scale(-1, 1); // mirror for a left feed; below assumes feed from the right
      // outgoing leg (points up): region above/left of the diagonal from bottom-left to top-right
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-TILE / 2, TILE / 2);
      ctx.lineTo(TILE / 2, -TILE / 2);
      ctx.lineTo(-TILE / 2, -TILE / 2);
      ctx.closePath();
      ctx.clip();
      this.drawStraight(straight);
      this.scrollStrip(straight, -TILE / 2, TILE / 2, false);
      ctx.restore();
      // incoming leg (from the right, pointing left): region below/right of the diagonal
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-TILE / 2, TILE / 2);
      ctx.lineTo(TILE / 2, -TILE / 2);
      ctx.lineTo(TILE / 2, TILE / 2);
      ctx.closePath();
      ctx.clip();
      ctx.rotate(-Math.PI / 2); // texture points up; rotate so it points left (travel from right to centre)
      this.drawStraight(straight);
      this.scrollStrip(straight, -TILE / 2, TILE / 2, false);
      ctx.restore();
      ctx.restore();
    } else if (ready(straight)) {
      this.drawStraight(straight);
      this.scrollStrip(straight, -TILE / 2, TILE / 2, false);
    } else this.fallbackBelt();
    ctx.restore();

    if (this.overlay || b.status === 'jammed' || b.status === 'dead_end') this.drawBeltStatus(b);
  }

  /** Draw the straight belt texture edge to edge, trimming the rail end caps so tiles join seamlessly. */
  private drawStraight(img: HTMLImageElement) {
    const m = img.naturalHeight * BELT_TRIM;
    this.ctx.drawImage(img, 0, m, img.naturalWidth, img.naturalHeight - 2 * m, -TILE / 2, -TILE / 2, TILE, TILE);
  }

  /** Redraw the moving belt surface of the straight texture scrolled by time, clipped to [y0,y1] in local space. */
  private scrollStrip(img: HTMLImageElement, y0: number, y1: number, half: boolean) {
    const { ctx } = this;
    if (!ready(img)) return;
    const w = TILE * BELT_STRIP;
    const off = (this.time * this.beltSpeedPx()) % TILE;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2, y0, w, y1 - y0);
    ctx.clip();
    const sx = img.naturalWidth * (0.5 - BELT_STRIP / 2), sw = img.naturalWidth * BELT_STRIP;
    const m = img.naturalHeight * BELT_TRIM, sh = img.naturalHeight - 2 * m;
    // two copies so the seam is never visible (belt moves "up" = towards -y)
    ctx.drawImage(img, sx, m, sw, sh, -w / 2, -TILE / 2 - off, w, TILE);
    ctx.drawImage(img, sx, m, sw, sh, -w / 2, TILE / 2 - off, w, TILE);
    if (half) {
      // entrance: fade the belt into the hatch
      const g = ctx.createLinearGradient(0, 0, 0, -TILE / 6);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = g;
      ctx.fillRect(-w / 2, -TILE / 6, w, TILE / 6);
    }
    ctx.restore();
  }

  private fallbackBelt() {
    const { ctx } = this;
    const w = TILE * 0.62;
    ctx.fillStyle = '#2b2f37';
    roundRect(ctx, -w / 2, -TILE / 2, w, TILE, 6);
    ctx.fill();
  }

  private dot(x: number, y: number, color: string) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBeltStatus(b: Building) {
    const { ctx } = this;
    if (b.status === 'jammed' || b.status === 'dead_end') {
      const pulse = 0.25 + 0.2 * Math.sin(this.time * 6);
      ctx.fillStyle = b.status === 'dead_end' ? `rgba(239,68,68,${pulse})` : `rgba(245,158,11,${pulse})`;
      ctx.fillRect(b.x * TILE, b.y * TILE, TILE, TILE);
      if (b.status === 'dead_end') this.drawBadge(b.x * TILE + TILE / 2, b.y * TILE + TILE / 2, '⊘', '#ef4444');
    }
  }

  private beltItemPos(b: Building, pos: number, input: string): [number, number] {
    let lx = 0, ly = 0;
    if ((input === 'left' || input === 'right') && pos >= 0.5) {
      const sgn = input === 'left' ? -1 : 1;
      const tt = (pos - 0.5) * 2; // 0 = side edge, 0.5 = centre, 1 = front edge
      if (tt < 0.5) lx = sgn * (TILE / 2) * (1 - tt * 2);
      else ly = -(TILE / 2) * ((tt - 0.5) * 2);
    } else ly = TILE / 2 - pos * TILE;
    const a = (b.dir * Math.PI) / 2;
    const rx = lx * Math.cos(a) - ly * Math.sin(a);
    const ry = lx * Math.sin(a) + ly * Math.cos(a);
    return [b.x * TILE + TILE / 2 + rx, b.y * TILE + TILE / 2 + ry];
  }

  private drawBeltItems(b: Building) {
    if (!b.items?.length) return;
    const input = b.type === 'conveyor' ? this.beltInput(b) : 'back';
    const size = TILE * 0.42;
    for (const it of b.items) {
      const [px, py] = this.beltItemPos(b, it.pos, input);
      this.drawItem(it.item, px, py, size);
    }
  }

  drawItem(id: ItemId, px: number, py: number, size: number, alpha = 1) {
    const { ctx } = this;
    const img = itemSprite(id);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    if (ready(img)) ctx.drawImage(img, px - size / 2, py - size / 2, size, size);
    else {
      ctx.fillStyle = ITEMS[id].color;
      ctx.beginPath();
      ctx.arc(px, py, size / 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 1;
  }

  // ---------- Buildings ----------

  private drawBuilding(b: Building, alpha = 1) {
    const { ctx } = this;
    const def = BUILDINGS[b.type];
    const sz = def.size * TILE;
    const cx = b.x * TILE + sz / 2, cy = b.y * TILE + sz / 2;
    let img = buildingSprite(b.type);
    if (b.type === 'core') {
      const p = this.sim.shipProgress();
      const stage = p <= 0 ? 0 : p < 0.45 ? 1 : p < 0.99 ? 2 : 3;
      img = buildingSprite((stage === 3 ? 'core' : `core_${stage}`) as BuildingId);
    }
    // spawn animation
    let scale = 1;
    if (alpha === 1 && b.id >= 0) {
      let t0 = this.spawn.get(b.id);
      if (t0 === undefined) {
        t0 = this.time;
        this.spawn.set(b.id, t0);
      }
      const k = Math.min(1, (this.time - t0) / 0.28);
      scale = 0.7 + 0.3 * (1 - Math.pow(1 - k, 3));
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.rotate((b.dir * Math.PI) / 2);
    if (ready(img)) ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
    else {
      ctx.fillStyle = '#3a4048';
      roundRect(ctx, -sz / 2 + 4, -sz / 2 + 4, sz - 8, sz - 8, 8);
      ctx.fill();
    }
    ctx.restore();

    if (alpha < 1) return;

    // working animations
    if (b.working) {
      if (this.lowDetail) { /* no animations when zoomed far out */ }
      else if (b.type === 'miner') this.animDrill(cx, cy);
      else if (b.type === 'smelter') this.animGlow(cx, cy, sz * 0.18, '#fb923c');
      else if (b.type === 'refinery') this.animGlow(cx, cy, sz * 0.14, '#4ade80');
      else if (b.type === 'assembler' || b.type === 'fabricator' || b.type === 'printer') this.animSparks(b, cx, cy);
    }

    if (def.kind === 'miner' || def.kind === 'machine' || def.kind === 'storage' || def.kind === 'splitter' || def.kind === 'logic') {
      this.drawArrow(b, b.dir, b.type === 'valve' && b.open === false ? '#ef4444' : '#22d3ee');
      if (def.kind === 'splitter' || b.type === 'overflow') {
        this.drawArrow(b, ((b.dir + 1) & 3) as Dir, b.type === 'overflow' ? '#f59e0b' : '#22d3ee');
        this.drawArrow(b, ((b.dir + 3) & 3) as Dir, b.type === 'overflow' ? '#f59e0b' : '#22d3ee');
      }
      if (b.type === 'sorter') this.drawArrow(b, ((b.dir + 3) & 3) as Dir, '#c084fc');
    }
    if (def.kind === 'logic') {
      // configuration badge: filter item (sorter / valve) or ratio (mixer)
      if ((b.type === 'sorter' || b.type === 'valve') && b.recipe) this.drawItem(b.recipe as ItemId, b.x * TILE + TILE - 13, b.y * TILE + 13, 20);
      else if (b.type === 'sorter' || (b.type === 'valve' && !b.recipe)) this.drawBadge(b.x * TILE + TILE - 13, b.y * TILE + 13, '?', '#f59e0b');
      if (b.type === 'valve') {
        ctx.fillStyle = b.open === false ? 'rgba(239,68,68,0.55)' : 'rgba(52,211,153,0.35)';
        ctx.fillRect(b.x * TILE + 6, b.y * TILE + TILE - 10, TILE - 12, 4);
      }
      if (b.type === 'mixer') {
        const r = MIXER_RATIOS[b.ratio ?? 0];
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        roundRect(ctx, b.x * TILE + TILE / 2 - 16, b.y * TILE + 3, 32, 14, 4);
        ctx.fill();
        ctx.fillStyle = '#86efac';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${r[0]}:${r[1]}`, b.x * TILE + TILE / 2, b.y * TILE + 10);
        if (b.status === 'ok' && ((b.bufL?.length ?? 0) || (b.bufR?.length ?? 0))) this.animGlow(cx, cy, 8, '#4ade80');
      }
    }
    if (def.kind === 'machine' || def.kind === 'miner') {
      const p = b.progress ?? 0;
      const barW = sz * 0.6, barH = 5;
      const bx = cx - barW / 2, by = b.y * TILE + sz - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, bx - 1, by - 1, barW + 2, barH + 2, 3);
      ctx.fill();
      ctx.fillStyle = b.working ? '#22d3ee' : '#64748b';
      roundRect(ctx, bx, by, barW * Math.min(1, p), barH, 2);
      ctx.fill();
      if (b.working) {
        const glow = 0.25 + 0.15 * Math.sin(this.time * 6);
        ctx.strokeStyle = `rgba(34,211,238,${glow})`;
        ctx.lineWidth = 2;
        roundRect(ctx, b.x * TILE + 3, b.y * TILE + 3, sz - 6, sz - 6, 8);
        ctx.stroke();
      }
      if (def.kind === 'machine' && !b.recipe) this.drawBadge(cx, b.y * TILE + 14, '?', '#f59e0b');
      else if (def.kind === 'machine' && b.recipe) this.drawItem(RECIPE_BY_ID[b.recipe].output, b.x * TILE + sz - 14, b.y * TILE + 14, 22);
      if (b.status === 'starved' && b.missing?.length) {
        const m = b.missing[0];
        this.drawItem(m, b.x * TILE + 14, b.y * TILE + 14, 22, 0.5 + 0.5 * Math.abs(Math.sin(this.time * 3)));
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x * TILE + 14, b.y * TILE + 14, 12, 0, Math.PI * 2);
        ctx.stroke();
      } else if (b.status === 'blocked' && !this.sim.hasOutputTarget(b)) this.drawBadge(b.x * TILE + 14, b.y * TILE + 14, '!', '#ef4444');
      else if (b.status === 'depleted') this.drawBadge(b.x * TILE + 14, b.y * TILE + 14, '∅', '#94a3b8');
    }
    if (b.type === 'generator') {
      const fuel = Math.min(1, (b.fuelSeconds ?? 0) / 12);
      const barW = sz * 0.6, barH = 5;
      const bx = cx - barW / 2, by = b.y * TILE + sz - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, bx - 1, by - 1, barW + 2, barH + 2, 3);
      ctx.fill();
      ctx.fillStyle = fuel > 0 ? '#84cc16' : '#ef4444';
      roundRect(ctx, bx, by, Math.max(2, barW * fuel), barH, 2);
      ctx.fill();
      if (fuel > 0) this.animGlow(cx, cy, sz * 0.12, '#fb923c');
    }
    if (b.type === 'storage' && b.recipe) this.drawItem(b.recipe as ItemId, b.x * TILE + sz - 14, b.y * TILE + 14, 22);
    if (b.type === 'core') {
      const glow = 0.35 + 0.2 * Math.sin(this.time * 2.5);
      ctx.strokeStyle = `rgba(34,211,238,${glow})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, sz * 0.47, 0, Math.PI * 2);
      ctx.stroke();
      // rotating hologram ring segments
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.time * 0.4);
      ctx.strokeStyle = 'rgba(103,232,249,0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, sz * 0.5, (i * Math.PI) / 2, (i * Math.PI) / 2 + 0.6);
        ctx.stroke();
      }
      ctx.restore();
      // ship progress arc
      const p = this.sim.shipProgress();
      if (p > 0 && p < 1) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, sz * 0.47, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private animDrill(cx: number, cy: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.time * 5);
    ctx.strokeStyle = 'rgba(251,146,60,0.85)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 9, (i * Math.PI * 2) / 3, (i * Math.PI * 2) / 3 + 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private animGlow(cx: number, cy: number, r: number, color: string) {
    const { ctx } = this;
    const k = 0.55 + 0.45 * Math.sin(this.time * 7 + cx);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.35 * k;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private animSparks(b: Building, cx: number, cy: number) {
    if (Math.random() < 0.12) {
      this.particles.push({ x: cx + (Math.random() - 0.5) * 20, y: cy + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 80, vy: -30 - Math.random() * 40, life: 0.35, max: 0.35, size: 2, color: b.type === 'printer' ? '#67e8f9' : '#fde68a', grav: 200 });
    }
  }

  private drawArrow(b: Building, dir: Dir, color: string) {
    const { ctx } = this;
    const sz = BUILDINGS[b.type].size * TILE;
    const cx = b.x * TILE + sz / 2, cy = b.y * TILE + sz / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((dir * Math.PI) / 2);
    ctx.translate(0, -sz / 2 + 4);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(7, 4);
    ctx.lineTo(-7, 4);
    ctx.closePath();
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.restore();
  }

  private drawBadge(x: number, y: number, text: string, color: string) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  private drawGhost(g: Ghost) {
    const { ctx } = this;
    const def = BUILDINGS[g.type];
    const sz = def.size * TILE;
    if (g.type === 'conveyor' || g.type === 'tunnel') {
      ctx.globalAlpha = 0.7;
      this.drawBelt({ id: -1, type: g.type, x: g.x, y: g.y, dir: g.dir, items: [], pair: 1 });
      ctx.globalAlpha = 1;
    } else this.drawBuilding({ id: -1, type: g.type, x: g.x, y: g.y, dir: g.dir }, 0.6);
    ctx.fillStyle = g.valid ? 'rgba(34,211,238,0.18)' : 'rgba(239,68,68,0.3)';
    ctx.fillRect(g.x * TILE, g.y * TILE, sz, sz);
    ctx.strokeStyle = g.valid ? '#22d3ee' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(g.x * TILE + 1, g.y * TILE + 1, sz - 2, sz - 2);
    if (def.rotatable && g.type !== 'solar') this.drawArrow({ id: -1, type: g.type, x: g.x, y: g.y, dir: g.dir }, g.dir, g.valid ? '#22d3ee' : '#ef4444');
  }

  /** The belt line editor: translucent belts along the planned line plus a count/cost tag at its end. */
  private drawBeltPreview(path: { x: number; y: number; dir: Dir; ok: boolean }[]) {
    if (!path.length) return;
    const { ctx } = this;
    let newBelts = 0;
    for (const p of path) {
      const existing = this.sim.at(p.x, p.y);
      if (!existing) newBelts++;
      ctx.globalAlpha = 0.75;
      this.drawBelt({ id: -1, type: 'conveyor', x: p.x, y: p.y, dir: p.dir, items: [] });
      ctx.globalAlpha = 1;
      ctx.fillStyle = existing ? 'rgba(251,191,36,0.2)' : 'rgba(34,211,238,0.18)';
      ctx.fillRect(p.x * TILE, p.y * TILE, TILE, TILE);
    }
    const last = path[path.length - 1];
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.strokeRect(path[0].x * TILE + 1, path[0].y * TILE + 1, TILE - 2, TILE - 2);
    this.drawArrow({ id: -1, type: 'conveyor', x: last.x, y: last.y, dir: last.dir }, last.dir, '#22d3ee');
    const plates = this.sim.state.inventory.iron_plate ?? 0;
    this.drawTag(last.x * TILE + TILE / 2, last.y * TILE - 8, `${path.length} ▸ ${newBelts}/${plates}`, newBelts > plates ? '#ef4444' : '#22d3ee');
  }

  /** Small hologram text tag centred above (x, y). */
  drawTag(x: number, y: number, text: string, color: string) {
    const { ctx } = this;
    ctx.font = 'bold 13px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(8,12,18,0.85)';
    roundRect(ctx, x - w / 2, y - 22, w, 22, 6);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - 10);
  }

  private drawPasteGhost(g: { bp: Blueprint; x: number; y: number; bad: Set<number> }) {
    const { ctx } = this;
    g.bp.items.forEach((i, idx) => {
      const valid = !g.bad.has(idx);
      const fake: Building = { id: -1, type: i.type, x: g.x + i.dx, y: g.y + i.dy, dir: i.dir, items: [], pair: 1 };
      ctx.globalAlpha = 0.6;
      if (i.type === 'conveyor' || i.type === 'tunnel') this.drawBelt(fake);
      else this.drawBuilding(fake, 0.6);
      ctx.globalAlpha = 1;
      const sz = BUILDINGS[i.type].size * TILE;
      ctx.fillStyle = valid ? 'rgba(192,132,252,0.15)' : 'rgba(239,68,68,0.35)';
      ctx.fillRect(fake.x * TILE, fake.y * TILE, sz, sz);
    });
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2;
    ctx.strokeRect(g.x * TILE, g.y * TILE, g.bp.w * TILE, g.bp.h * TILE);
  }

  // ---------- Overlay (scan mode) ----------

  private drawOverlay(visible: Building[], dt: number) {
    const { ctx, cam } = this;
    this.flowT += dt;
    if (this.flowT > 0.5 || !this.flows.length) {
      this.flowT = 0;
      this.flows = [];
      for (const b of this.sim.state.buildings) {
        const k = BUILDINGS[b.type].kind;
        if (k === 'miner' || k === 'machine' || k === 'storage') this.flows.push({ from: b, ...this.sim.traceFlow(b) });
      }
    }
    // flow lines
    ctx.lineWidth = 3 / Math.max(0.6, cam.zoom);
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -this.time * 40;
    for (const f of this.flows) {
      if (!f.path.length) continue;
      const item = f.from.type === 'miner' ? f.from.mineItem! : f.from.recipe ? RECIPE_BY_ID[f.from.recipe]?.output : null;
      ctx.strokeStyle = f.target ? (item ? ITEMS[item].color : '#22d3ee') : '#ef4444';
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      const s0 = BUILDINGS[f.from.type].size;
      ctx.moveTo((f.from.x + s0 / 2) * TILE, (f.from.y + s0 / 2) * TILE);
      for (const p of f.path) ctx.lineTo(p.x * TILE, p.y * TILE);
      if (f.target) {
        const s1 = BUILDINGS[f.target.type].size;
        ctx.lineTo((f.target.x + s1 / 2) * TILE, (f.target.y + s1 / 2) * TILE);
      }
      ctx.stroke();
      if (!f.target && f.path.length) {
        const e = f.path[f.path.length - 1];
        this.drawBadge(e.x * TILE, e.y * TILE, '⊘', '#ef4444');
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // hologram labels
    for (const b of visible) {
      const def = BUILDINGS[b.type];
      if (def.kind !== 'miner' && def.kind !== 'machine' && def.kind !== 'storage' && def.kind !== 'logic' && b.type !== 'generator') continue;
      const sz = def.size * TILE;
      const cx = b.x * TILE + sz / 2;
      const top = b.y * TILE - 6;
      let item: ItemId | null = null;
      if (b.type === 'miner') item = b.mineItem!;
      else if (b.recipe && def.kind === 'machine') item = RECIPE_BY_ID[b.recipe].output;
      else if (b.type === 'storage') item = (Object.keys(b.store ?? {})[0] as ItemId) ?? null;
      const rate = b.rate ?? 0;
      let text = item ? `${rate.toFixed(0)}/min` : '';
      if (b.type === 'miner') text += `  ${this.sim.oreLeft(b.x, b.y)}`;
      if (b.type === 'storage') text = String(Object.values(b.store ?? {}).reduce((a, c) => a + (c ?? 0), 0));
      if (b.type === 'generator') text = `${Math.ceil(b.fuelSeconds ?? 0)}s`;
      if (def.kind === 'logic') {
        item = (b.type === 'sorter' || b.type === 'valve') && b.recipe ? (b.recipe as ItemId) : null;
        if (b.type === 'sorter') text = item ? '← ' : '?';
        else if (b.type === 'valve') text = item ? `${this.sim.state.inventory[item] ?? 0}/${b.threshold ?? 50} ${b.open === false ? '■' : '▶'}` : '?';
        else if (b.type === 'mixer') text = `${MIXER_RATIOS[b.ratio ?? 0].join(':')}`;
        else text = '↑ → ←';
      }
      const status = b.status ?? 'ok';
      const col = status === 'ok' ? '#22d3ee' : status === 'blocked' || status === 'no_recipe' || status === 'starved' || status === 'no_fuel' || status === 'depleted' ? '#ef4444' : '#f59e0b';
      ctx.font = 'bold 12px system-ui, sans-serif';
      const tw = ctx.measureText(text).width + (item ? 28 : 8);
      ctx.fillStyle = 'rgba(8,12,18,0.82)';
      roundRect(ctx, cx - tw / 2, top - 22, tw, 22, 6);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (item) this.drawItem(item, cx - tw / 2 + 13, top - 11, 18);
      ctx.fillStyle = col;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx - tw / 2 + (item ? 25 : 4), top - 10);
    }
    // belts: tint by utilisation (how full the belt is), item colour on the edge
    const perTile = 1 / BELT_SPACING; // items a tile can hold
    for (const b of visible) {
      if (b.type !== 'conveyor') continue;
      const n = b.items?.length ?? 0;
      if (!n) continue;
      const util = Math.min(1, n / perTile);
      const jam = b.status === 'jammed' || b.status === 'dead_end';
      ctx.fillStyle = jam ? '#ef4444' : util < 0.5 ? '#22c55e' : util < 0.85 ? '#f59e0b' : '#ef4444';
      ctx.globalAlpha = 0.16 + util * 0.2;
      ctx.fillRect(b.x * TILE + 4, b.y * TILE + 4, TILE - 8, TILE - 8);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = ITEMS[b.items![n - 1].item].color;
      ctx.fillRect(b.x * TILE + 4, b.y * TILE + TILE - 8, TILE - 8, 4);
      ctx.globalAlpha = 1;
    }
    // throughput tags on belt lines: one per belt that feeds a machine / the core (measured items per minute)
    if (cam.zoom >= 0.55) {
      ctx.font = 'bold 11px system-ui, sans-serif';
      for (const b of visible) {
        if (b.type !== 'conveyor' || b.rate === undefined) continue;
        const nx = b.x + DX[b.dir], ny = b.y + DY[b.dir];
        const target = this.sim.at(nx, ny);
        if (!target || target.type === 'conveyor') continue;
        const cap = this.sim.beltCapacity();
        const pct = Math.min(999, Math.round((100 * b.rate) / cap));
        this.drawTag(b.x * TILE + TILE / 2, b.y * TILE + TILE - 2, `${b.rate.toFixed(0)}/min · ${pct}%`, pct >= 95 ? '#f59e0b' : '#22d3ee');
      }
    }
  }

  // ---------- Particles & storm ----------

  private drawParticles(dt: number) {
    const { ctx } = this;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      const a = Math.min(1, p.life / p.max);
      if (p.item) this.drawItem(p.item, p.x, p.y, p.size, a);
      else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color ?? '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawStorm(dt: number) {
    const { ctx, cam } = this;
    if (this.stormDust.length < 90) {
      for (let i = this.stormDust.length; i < 90; i++) this.stormDust.push({ x: Math.random() * cam.width, y: Math.random() * cam.height, l: 20 + Math.random() * 60, s: 300 + Math.random() * 500 });
    }
    ctx.fillStyle = 'rgba(120,90,50,0.16)';
    ctx.fillRect(0, 0, cam.width, cam.height);
    ctx.strokeStyle = 'rgba(214,190,150,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const d of this.stormDust) {
      d.x += d.s * dt;
      d.y += d.s * 0.25 * dt;
      if (d.x > cam.width + 80) { d.x = -80; d.y = Math.random() * cam.height; }
      if (d.y > cam.height + 40) d.y = -20;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.l, d.y - d.l * 0.25);
    }
    ctx.stroke();
  }

  // ---------- Minimap ----------

  drawMinimap(target: HTMLCanvasElement, force = false) {
    const s = this.sim.state;
    if (!this.mini) {
      this.mini = document.createElement('canvas');
      this.mini.width = s.width;
      this.mini.height = s.height;
      this.miniT = -1;
    }
    if (force || this.time - this.miniT > 1) {
      this.miniT = this.time;
      const g = this.mini.getContext('2d')!;
      const img = g.createImageData(s.width, s.height);
      for (let i = 0; i < s.width * s.height; i++) {
        const t = s.terrain[i];
        let c = [55, 61, 69];
        if (t === 'rock') c = [30, 32, 38];
        else if (t !== 'ground') {
          const col = ITEMS[TERRAIN_ITEM[t]!].color;
          c = [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
        }
        img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      for (const b of s.buildings) {
        const sz = BUILDINGS[b.type].size;
        g.fillStyle = b.type === 'core' ? '#fbbf24' : b.type === 'conveyor' || b.type === 'tunnel' ? '#67e8f9' : '#e2e8f0';
        g.fillRect(b.x, b.y, sz, sz);
      }
    }
    const t = target.getContext('2d')!;
    t.imageSmoothingEnabled = false;
    t.clearRect(0, 0, target.width, target.height);
    t.drawImage(this.mini, 0, 0, target.width, target.height);
    // viewport
    const k = target.width / (s.width * TILE);
    const [wx0, wy0] = this.cam.screenToWorld(0, 0);
    const [wx1, wy1] = this.cam.screenToWorld(this.cam.width, this.cam.height);
    t.strokeStyle = '#fff';
    t.lineWidth = 1;
    t.strokeRect(wx0 * k, wy0 * k, (wx1 - wx0) * k, (wy1 - wy0) * k);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
