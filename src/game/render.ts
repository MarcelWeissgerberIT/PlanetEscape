import { buildingSprite, itemSprite, ready, terrainSprite } from './assets';
import { Camera, TILE } from './camera';
import { BELT_SPACING, BUILDINGS, MIXER_RATIOS, ORE_PER_TILE, RECIPE_BY_ID, TERRAIN_ITEM } from './data';
import { CHIP8_H, CHIP8_W, HIRES_H, HIRES_W } from './chip8';
import { audioLevel } from './video';
import { ARITH } from './sim';
import { RADIO_RANGE, CORE_REACH, kitOf, printSeconds, HALL_SLOT_CAP, isHall, PLANT_FUEL, CRATE_SIZE, crateOf, itemColor, DOCK_CAP, BATTERY_CAP, BOARD_PARTS, CHIP8_PALETTE, CHIP_ROM_BYTES, CRYSTAL_HZ, MATRIX_SIZE, OSCILLATOR_CRYSTALS, SCREEN_BUDGET_MAX, matrixSize, TERMINAL_CRYSTALS, TERMINAL_RAM_BANKS } from './data';
import type { Sim } from './sim';
import type { Blueprint, Building, BuildingId, Dir, ItemId } from './types';
import { DX, DY } from './types';
import { t } from '../i18n';

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
  paintGhost: { x: number; y: number; brush: number } | null = null;
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
  private screens = new Map<number, { frame: number; canvas: HTMLCanvasElement }>();
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
          cc.fillStyle = itemColor(TERRAIN_ITEM[t]!);
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
          ctx.fillStyle = itemColor(TERRAIN_ITEM[t]!);
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
    const hideCore = this.sim.coreHidden;
    for (const b of s.buildings) {
      if (hideCore && b.type === 'core') continue;
      const sz = BUILDINGS[b.type].size;
      if (b.x + sz <= x0 || b.x > x1 || b.y + sz <= y0 || b.y > y1) continue;
      visible.push(b);
    }
    this.drawBoards(x0, y0, x1, y1);
    for (const b of visible) if (b.type === 'road' && !b.site) this.drawRoad(b);
    for (const b of visible) if ((b.type === 'conveyor' || b.type === 'tunnel') && !b.site) this.drawBelt(b);
    if (!this.lowDetail) for (const b of visible) if ((b.type === 'conveyor' || (b.type === 'tunnel' && b.exit)) && !b.site) this.drawBeltItems(b);
    for (const b of visible) if (b.type !== 'conveyor' && b.type !== 'tunnel' && b.type !== 'road' && !b.site) this.drawBuilding(b);
    for (const b of visible) if (b.site) this.drawSite(b);
    this.drawRobots(x0, y0, x1, y1);
    this.drawDrones();
    if (this.overlay || this.selected?.type === 'radio' || this.selected?.type === 'mast') this.drawRadioLinks();

    this.drawScanlines(visible);
    if (this.overlay) this.drawOverlay(visible, dt);

    this.drawParticles(dt);

    if (this.ghost) {
      this.drawReach();
      this.drawGhost(this.ghost);
    }
    if (this.pasteGhost) this.drawPasteGhost(this.pasteGhost);
    if (this.beltPreview) this.drawBeltPreview(this.beltPreview);
    if (this.paintGhost) {
      const g = this.paintGhost;
      const r = Math.floor(g.brush / 2);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2 / cam.zoom;
      ctx.setLineDash([6 / cam.zoom, 4 / cam.zoom]);
      ctx.strokeRect((g.x - r) * TILE + 1, (g.y - r) * TILE + 1, g.brush * TILE - 2, g.brush * TILE - 2);
      ctx.setLineDash([]);
    }
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
    if (from.type === 'core' || BUILDINGS[from.type].kind === 'power') return false;
    return this.sim.frontTiles(from).some((t) => t.x === to.x && t.y === to.y);
  }

  private beltSpeedPx() {
    return 1.6 * this.sim.factor('belt') * TILE;
  }

  /** A road tile: asphalt with a dashed centre line towards every neighbouring road, dock or depot. */
  private drawRoad(b: Building) {
    const { ctx } = this;
    const px = b.x * TILE, py = b.y * TILE, cx = px + TILE / 2, cy = py + TILE / 2;
    ctx.fillStyle = '#2a2f37';
    ctx.fillRect(px, py, TILE, TILE);
    if (this.lowDetail) return;
    // asphalt grain: a few fixed specks per tile
    let seed = (b.x * 73856093) ^ (b.y * 19349663);
    for (let k = 0; k < 7; k++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      ctx.fillStyle = k & 1 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.07)';
      ctx.fillRect(px + (seed % TILE), py + ((seed >> 8) % TILE), 2 + (k % 2), 2);
    }
    // kerbs on every side without a road neighbour
    for (let d = 0; d < 4; d++) {
      const n = this.sim.at(b.x + DX[d], b.y + DY[d]);
      if (n && (n.type === 'road' || n.type === 'dock' || n.type === 'depot')) continue;
      ctx.fillStyle = '#6b7482';
      if (d === 0) ctx.fillRect(px, py, TILE, 5);
      if (d === 2) ctx.fillRect(px, py + TILE - 5, TILE, 5);
      if (d === 1) ctx.fillRect(px + TILE - 5, py, 5, TILE);
      if (d === 3) ctx.fillRect(px, py, 5, TILE);
      ctx.fillStyle = '#12161b';
      if (d === 0) ctx.fillRect(px, py + 5, TILE, 1.5);
      if (d === 2) ctx.fillRect(px, py + TILE - 6.5, TILE, 1.5);
      if (d === 1) ctx.fillRect(px + TILE - 6.5, py, 1.5, TILE);
      if (d === 3) ctx.fillRect(px + 5, py, 1.5, TILE);
    }
    ctx.strokeStyle = '#d6b44a';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    let links = 0;
    for (let d = 0; d < 4; d++) {
      const n = this.sim.at(b.x + DX[d], b.y + DY[d]);
      if (!n || (n.type !== 'road' && n.type !== 'dock' && n.type !== 'depot')) continue;
      links++;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + DX[d] * TILE / 2, cy + DY[d] * TILE / 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (!links) {
      ctx.fillStyle = '#d6b44a';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Radio links: dashed beams between radios and masts that hear each other; the range of the selected one. */
  private drawRadioLinks() {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(245,158,11,0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -this.time * 20;
    for (const [a, c] of this.sim.radioLinks()) {
      ctx.beginPath();
      ctx.moveTo(a.x * TILE + TILE / 2, a.y * TILE + TILE / 2);
      ctx.lineTo(c.x * TILE + TILE / 2, c.y * TILE + TILE / 2);
      ctx.stroke();
    }
    const s = this.selected;
    if (s && (s.type === 'radio' || s.type === 'mast')) {
      ctx.strokeStyle = 'rgba(245,158,11,0.35)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(s.x * TILE + TILE / 2, s.y * TILE + TILE / 2, RADIO_RANGE * TILE, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** While building: the square the core builds in directly (farther sites need their kit delivered). */
  private drawReach() {
    const c = this.sim.core();
    if (!c || this.sim.creative) return;
    const { ctx } = this;
    const n = BUILDINGS.core.size;
    const x = (c.x - CORE_REACH) * TILE, y = (c.y - CORE_REACH) * TILE, w = (n + 2 * CORE_REACH) * TILE;
    ctx.strokeStyle = 'rgba(34,211,238,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -this.time * 8;
    ctx.strokeRect(x, y, w, w);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(34,211,238,0.035)';
    ctx.fillRect(x, y, w, w);
  }

  /** Construction drones: body, four rotors, a kit hanging below, shadow on the ground. */
  private drawDrones() {
    const { ctx } = this;
    const spr = buildingSprite('drone' as BuildingId);
    for (const d of this.sim.drones()) {
      if (d.state === 'idle') continue;
      const px = d.x * TILE, py = d.y * TILE;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(px + 10, py + 16, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      if (d.carry) this.drawItem(('kit:' + d.carry) as ItemId, px, py + 8, TILE * 0.36);
      if (ready(spr)) ctx.drawImage(spr, px - TILE * 0.4, py - TILE * 0.46, TILE * 0.8, TILE * 0.8);
      if (!this.lowDetail) {
        ctx.strokeStyle = 'rgba(226,232,240,0.35)';
        ctx.lineWidth = 1;
        const a = this.time * 30;
        for (const [ox, oy] of [[-0.26, -0.32], [0.26, -0.32], [-0.26, 0.1], [0.26, 0.1]]) {
          ctx.beginPath();
          ctx.ellipse(px + ox * TILE, py + oy * TILE, TILE * 0.13, TILE * 0.04, a, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }

  /** A construction site: the building as a cyan hologram, with the print progress or its place in the queue. */
  private drawSite(b: Building) {
    const { ctx } = this;
    const sz = BUILDINGS[b.type].size * TILE, x0 = b.x * TILE, y0 = b.y * TILE, cx = x0 + sz / 2, cy = y0 + sz / 2;
    const img = buildingSprite((isHall(b.type) ? 'hall' : b.type) as BuildingId);
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.translate(cx, cy);
    ctx.rotate((b.dir * Math.PI) / 2);
    if (ready(img)) ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
    ctx.fillStyle = 'rgba(34,211,238,0.1)';
    ctx.fillRect(x0 + 2, y0 + 2, sz - 4, sz - 4);
    if (!this.lowDetail) {
      ctx.fillStyle = 'rgba(34,211,238,0.14)';
      const off = (this.time * 12) % 6;
      for (let y = y0 + 2 + off; y < y0 + sz - 2; y += 6) ctx.fillRect(x0 + 2, y, sz - 4, 1);
    }
    ctx.strokeStyle = 'rgba(34,211,238,0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -this.time * 10;
    ctx.strokeRect(x0 + 2.5, y0 + 2.5, sz - 5, sz - 5);
    ctx.setLineDash([]);
    const info = this.sim.siteInfo(b);
    if (b.deliver) {
      // kit ready, far from the core: waiting for a drone or a belt
      if (!this.lowDetail) {
        this.drawItem(('kit:' + b.type) as ItemId, cx, cy, Math.min(sz * 0.5, TILE * 0.55), 0.55 + 0.45 * Math.abs(Math.sin(this.time * 3)));
        this.drawTag(cx, y0 - 4, b.enroute === 'drone' ? '✈' : b.enroute === 'item' ? '⇢' : '⌖', '#f59e0b');
      }
    } else if (info.pos === 0) {
      // printing: bar at the foot and a print head sweeping over the site
      ctx.fillStyle = 'rgba(8,12,18,0.8)';
      ctx.fillRect(x0 + 6, y0 + sz - 10, sz - 12, 5);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(x0 + 6, y0 + sz - 10, (sz - 12) * info.progress, 5);
      const hx = x0 + 6 + (sz - 12) * (0.5 + 0.5 * Math.sin(this.time * 6));
      ctx.fillStyle = 'rgba(165,243,252,0.9)';
      ctx.fillRect(hx - 1, y0 + 4, 2, sz * info.progress - 6 > 0 ? sz - 14 : 4);
    } else if (!this.lowDetail) {
      ctx.fillStyle = 'rgba(8,12,18,0.75)';
      roundRect(ctx, cx - 16, cy - 9, 32, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#a5f3fc';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.pos > 0 ? `#${info.pos + 1}` : '…', cx, cy);
    }
    void printSeconds;
  }

  /** Warehouse: steel frame, one shelf slot per tile with the item, its count and a fill bar; the output edge glows when it is switched on. */
  private drawHall(b: Building) {
    const { ctx } = this;
    const n = BUILDINGS[b.type].size, sz = n * TILE, x0 = b.x * TILE, y0 = b.y * TILE;
    const m = 10, inner = sz - 2 * m, cell = inner / n;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, x0 + 4, y0 + 8, sz - 4, sz - 4, 16);
    ctx.fill();
    const g = ctx.createLinearGradient(x0, y0, x0 + sz, y0 + sz);
    g.addColorStop(0, '#7c8593');
    g.addColorStop(0.45, '#555d6a');
    g.addColorStop(1, '#2d333c');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#12161b';
    ctx.lineWidth = 3;
    roundRect(ctx, x0 + 2, y0 + 2, sz - 4, sz - 4, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#161a20';
    ctx.fillRect(x0 + m, y0 + m, inner, inner);
    // output edge
    const pass = b.mode === 'pass';
    ctx.fillStyle = pass ? '#22d3ee' : '#475569';
    if (pass) {
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 10;
    }
    if (b.dir === 0) ctx.fillRect(x0 + m, y0 + 3, inner, 4);
    if (b.dir === 2) ctx.fillRect(x0 + m, y0 + sz - 7, inner, 4);
    if (b.dir === 1) ctx.fillRect(x0 + sz - 7, y0 + m, 4, inner);
    if (b.dir === 3) ctx.fillRect(x0 + 3, y0 + m, 4, inner);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    const slots = this.sim.hallLayout(b);
    const font = Math.max(9, Math.round(cell * 0.22));
    for (let i = 0; i < n * n; i++) {
      const sx = x0 + m + (i % n) * cell, sy = y0 + m + Math.floor(i / n) * cell;
      const s = slots[i];
      ctx.fillStyle = s ? '#0f1318' : '#0b0e12';
      ctx.fillRect(sx + 2, sy + 2, cell - 4, cell - 4);
      ctx.strokeStyle = '#353d49';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 2.5, sy + 2.5, cell - 5, cell - 5);
      if (!s) {
        // an empty shelf: two boards
        if (!this.lowDetail) {
          ctx.fillStyle = '#232a33';
          ctx.fillRect(sx + 6, sy + cell * 0.38, cell - 12, 3);
          ctx.fillRect(sx + 6, sy + cell * 0.72, cell - 12, 3);
        }
        continue;
      }
      if (this.lowDetail) {
        ctx.fillStyle = itemColor(s.item);
        ctx.fillRect(sx + 6, sy + 6, cell - 12, cell - 12);
        continue;
      }
      const img = itemSprite(s.item);
      const is = cell * 0.56;
      if (ready(img)) ctx.drawImage(img, sx + (cell - is) / 2, sy + cell * 0.1, is, is);
      const inner2 = crateOf(s.item);
      if (inner2) {
        const ii = itemSprite(inner2);
        if (ready(ii)) ctx.drawImage(ii, sx + cell / 2 - is * 0.22, sy + cell * 0.1 + is * 0.16, is * 0.44, is * 0.44);
      }
      // fill bar and count like a register's value
      const f = s.n / HALL_SLOT_CAP;
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(sx + 5, sy + cell - 9, cell - 10, 4);
      ctx.fillStyle = f >= 1 ? '#f59e0b' : '#22d3ee';
      ctx.fillRect(sx + 5, sy + cell - 9, (cell - 10) * f, 4);
      ctx.font = `bold ${font}px system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(String(s.n), sx + cell - 5, sy + cell - 11);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(String(s.n), sx + cell - 6, sy + cell - 12);
    }
    for (const [bx, by] of [[x0 + 6, y0 + 6], [x0 + sz - 6, y0 + 6], [x0 + 6, y0 + sz - 6], [x0 + sz - 6, y0 + sz - 6]]) {
      ctx.fillStyle = '#8b94a1';
      ctx.beginPath();
      ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!this.lowDetail) {
      const total = Object.values(b.store ?? {}).reduce((a, c) => a + (c ?? 0), 0);
      this.drawTag(x0 + sz / 2, y0 - 4, `${n}×${n} · ${slots.length}/${n * n} · ${total}`, pass ? '#22d3ee' : '#94a3b8');
    }
  }

  /** Tiny battery gauge: green, amber when low, red when empty. */
  private drawCharge(cx: number, cy: number, v: number, w: number) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(8,12,18,0.85)';
    ctx.fillRect(cx - w / 2 - 1.5, cy - 3, w + 3, 6);
    ctx.fillStyle = v > 0.5 ? '#34d399' : v > 0.2 ? '#f59e0b' : '#ef4444';
    if (v <= 0.2 && Math.sin(this.time * 8) < 0) ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(cx - w / 2, cy - 1.5, w * Math.max(0.04, v), 3);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(cx + w / 2 + 1.5, cy - 1.5, 2, 3);
  }

  /** Depot life: robots charging in the four bays, bay lights, and a turning beacon while robots are out. */
  private drawDepotLife(b: Building, sz: number) {
    const { ctx } = this;
    const robots = this.sim.robots().filter((r) => r.depot === b.id);
    const charging = robots.filter((r) => r.state === 'charge');
    const out = robots.length - charging.length;
    const k = sz / 256;
    const spr = buildingSprite('robot' as BuildingId);
    for (let i = 0; i < 4; i++) {
      const bx = b.x * TILE + (24 + i * 53 + 24.5) * k, by = b.y * TILE + 181 * k;
      const r = charging[i];
      // bay light: green = charging, cyan = free for a robot the depot owns, dark = empty
      const owned = i < this.sim.depotRobots(b);
      ctx.fillStyle = r ? '#34d399' : owned ? 'rgba(34,211,238,0.55)' : '#1f2937';
      ctx.fillRect(bx - 6 * k * 2, b.y * TILE + 131 * k, 12 * k * 2, 3 * k * 2);
      if (!r) continue;
      if (ready(spr)) ctx.drawImage(spr, bx - 22 * k, by - 26 * k, 44 * k, 52 * k);
      const v = r.charge ?? 1;
      this.drawCharge(bx, b.y * TILE + 150 * k, v, 34 * k);
      const pulse = 0.35 + 0.35 * Math.sin(this.time * 5 + i);
      ctx.fillStyle = `rgba(52,211,153,${pulse})`;
      ctx.fillRect(bx - 17 * k, b.y * TILE + 205 * k, 34 * k, 3 * k);
    }
    // beacon on the roof: turns while robots are out
    const lx = b.x * TILE + 170 * k, ly = b.y * TILE + 55 * k;
    if (out > 0) {
      const a = this.time * 5;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 26 * k);
      g.addColorStop(0, 'rgba(251,146,60,0.9)');
      g.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.arc(lx, ly, 30 * k, a, a + 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.arc(lx, ly, 30 * k, a + Math.PI, a + Math.PI + 0.9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = out > 0 ? '#fb923c' : '#7c2d12';
    ctx.beginPath();
    ctx.arc(lx, ly, 7 * k, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Transport robots: a small rounded vehicle with a headlight, carrying its first item on top. */
  private drawRobots(x0: number, y0: number, x1: number, y1: number) {
    const { ctx } = this;
    for (const r of this.sim.robots()) {
      if (r.state === 'charge') continue; // drawn inside its depot bay
      if (r.x < x0 || r.x > x1 + 1 || r.y < y0 || r.y > y1 + 1) continue;
      const px = r.x * TILE, py = r.y * TILE;
      if (!this.lowDetail) this.drawCharge(px, py - TILE * 0.42, r.charge ?? 1, TILE * 0.5);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((r.dir * Math.PI) / 2);
      const spr = buildingSprite('robot' as BuildingId);
      if (ready(spr)) {
        ctx.drawImage(spr, -TILE * 0.36, -TILE * 0.36, TILE * 0.72, TILE * 0.72);
        ctx.restore();
        if (r.items.length && !this.lowDetail) {
          this.drawItem(r.items[0], px, py + 4, TILE * 0.28);
          if (r.items.length > 1) this.drawBadge(px + TILE * 0.24, py - TILE * 0.2, String(r.items.length), '#f59e0b');
        }
        continue;
      }
      ctx.fillStyle = '#3b4656';
      roundRect(ctx, -TILE * 0.22, -TILE * 0.3, TILE * 0.44, TILE * 0.6, 5);
      ctx.fill();
      ctx.fillStyle = '#1f2937';
      roundRect(ctx, -TILE * 0.16, -TILE * 0.22, TILE * 0.32, TILE * 0.2, 3);
      ctx.fill();
      ctx.fillStyle = r.state === 'go' ? '#22d3ee' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(-TILE * 0.12, -TILE * 0.27, 2.5, 0, Math.PI * 2);
      ctx.arc(TILE * 0.12, -TILE * 0.27, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (r.items.length && !this.lowDetail) {
        this.drawItem(r.items[0], px, py + 2, TILE * 0.3);
        if (r.items.length > 1) this.drawBadge(px + TILE * 0.22, py - TILE * 0.22, String(r.items.length), '#f59e0b');
      }
    }
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
    if (ready(img)) {
      ctx.drawImage(img, px - size / 2, py - size / 2, size, size);
      const inner = crateOf(id);
      if (inner) {
        // a crate shows its content as a small icon on the lid
        const ii = itemSprite(inner);
        if (ready(ii)) ctx.drawImage(ii, px - size * 0.24, py - size * 0.36, size * 0.48, size * 0.48);
      }
      const kb = kitOf(id);
      if (kb) {
        // a kit shows the building it holds
        const bi = buildingSprite(kb);
        if (ready(bi)) ctx.drawImage(bi, px - size * 0.26, py - size * 0.3, size * 0.52, size * 0.52);
      }
    } else {
      ctx.fillStyle = itemColor(id);
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
    if (b.type === 'bus' && alpha === 1) {
      this.drawBus(b);
      return;
    }
    if (b.type === 'matrix' && alpha === 1) {
      this.drawMatrix(b);
      return;
    }
    if (isHall(b.type) && alpha === 1) {
      this.drawHall(b);
      return;
    }
    let img = buildingSprite(b.type);
    // parts whose moving piece is drawn live get a sprite without it
    if (b.type === 'picker' || b.type === 'wind') img = buildingSprite(`${b.type}_base` as BuildingId);
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

    if (b.type === 'terminal') {
      // the terminal shows its own 64x32 screen; the lamp display region is outlined in scan mode
      const cpu = this.sim.cpu(b);
      const frame = this.sim.cpuFrameOf(b);
      let sc = this.screens.get(b.id);
      if (!sc) {
        const canvas = document.createElement('canvas');
        canvas.width = CHIP8_W;
        canvas.height = CHIP8_H;
        sc = { frame: -1, canvas };
        this.screens.set(b.id, sc);
      }
      if (cpu && sc.frame !== frame) {
        sc.frame = frame;
        const W = cpu.hires ? HIRES_W : CHIP8_W, H = cpu.hires ? HIRES_H : CHIP8_H;
        const buf = cpu.hires ? cpu.fb : cpu.display;
        if (sc.canvas.width !== W) {
          sc.canvas.width = W;
          sc.canvas.height = H;
        }
        const c2 = sc.canvas.getContext('2d')!;
        const img = c2.createImageData(W, H);
        const own = (b.recipe as ItemId) ?? 'copper_wire';
        const rgb = (item: ItemId) => {
          const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(itemColor(item));
          return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [34, 211, 238];
        };
        const pal = CHIP8_PALETTE.map((it, k) => (k ? rgb(it ?? own) : [4, 20, 26]));
        for (let i = 0; i < W * H; i++) {
          const c = pal[buf[i] & 15];
          img.data[i * 4] = c[0];
          img.data[i * 4 + 1] = c[1];
          img.data[i * 4 + 2] = c[2];
          img.data[i * 4 + 3] = 255;
        }
        c2.putImageData(img, 0, 0);
      }
      const sx = b.x * TILE + sz * 0.135, sy = b.y * TILE + sz * 0.135, sw = sz * 0.73, sh = sz * 0.43;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sc.canvas, sx, sy, sw, sh);
      ctx.imageSmoothingEnabled = true;
      // installed parts: memory banks (green) along the bottom, oscillator crystals (cyan) on the right
      const ram = b.ram ?? 0, clock = b.clock ?? 0;
      for (let i = 0; i < TERMINAL_RAM_BANKS; i++) {
        ctx.fillStyle = i < ram ? '#34d399' : 'rgba(255,255,255,0.12)';
        ctx.fillRect(b.x * TILE + sz * 0.14 + i * sz * 0.045, b.y * TILE + sz * 0.9, sz * 0.032, sz * 0.05);
      }
      for (let i = 0; i < TERMINAL_CRYSTALS; i++) {
        ctx.fillStyle = i < clock ? '#22d3ee' : 'rgba(255,255,255,0.12)';
        ctx.fillRect(b.x * TILE + sz * 0.9, b.y * TILE + sz * 0.62 + i * sz * 0.045, sz * 0.05, sz * 0.032);
      }
      if (b.run && !cpu?.halted && b.status === 'ok') this.animGlow(b.x * TILE + sz * 0.83, b.y * TILE + sz * 0.18, 5, '#34d399');
      if (b.status === 'starved') this.drawBadge(b.x * TILE + sz - 13, b.y * TILE + 13, '!', '#f59e0b');
      if (cpu?.halted) this.drawBadge(b.x * TILE + sz - 13, b.y * TILE + 13, '!', '#ef4444');
      if (this.overlay || this.selected === b) {
        const r = this.sim.terminalDisplayRect(b);
        ctx.strokeStyle = 'rgba(34,211,238,0.7)';
        ctx.lineWidth = 2 / Math.max(0.5, this.cam.zoom);
        ctx.setLineDash([10, 6]);
        ctx.strokeRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
        ctx.setLineDash([]);
        this.drawTag(r.x * TILE + (r.w * TILE) / 2, r.y * TILE - 6, `${CHIP8_W}×${CHIP8_H} display`, '#22d3ee');
        const tr = this.sim.terminalTraceRect(b);
        ctx.strokeStyle = 'rgba(245,158,11,0.7)';
        ctx.setLineDash([10, 6]);
        ctx.strokeRect(tr.x * TILE, tr.y * TILE, tr.w * TILE, tr.h * TILE);
        ctx.setLineDash([]);
        this.drawTag(tr.x * TILE + (tr.w * TILE) / 2, tr.y * TILE - 6, 'PC · OP · I · V0…VF', '#f59e0b');
      }
      return;
    }
    if (b.type === 'screen') {
      if (b.working && !this.lowDetail) this.animGlow(cx + sz * 0.3, cy - sz * 0.3, 4, '#f43f5e');
      // phosphor bar
      const frac = Math.min(1, (b.budget ?? 0) / SCREEN_BUDGET_MAX);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(b.x * TILE + 8, b.y * TILE + sz - 9, sz - 16, 4);
      ctx.fillStyle = frac > 0.25 ? '#34d399' : '#f59e0b';
      ctx.fillRect(b.x * TILE + 8, b.y * TILE + sz - 9, (sz - 16) * frac, 4);
      if (b.status === 'starved') this.drawBadge(b.x * TILE + sz - 13, b.y * TILE + 13, '!', '#f59e0b');
      if (this.overlay || this.selected === b) {
        const r = this.sim.screenRect(b);
        const first = this.sim.at(r.x, r.y);
        const dens = first?.type === 'matrix' ? matrixSize(first) : MATRIX_SIZE;
        const tw = r.w / dens, th = r.h / dens;
        ctx.strokeStyle = 'rgba(244,63,94,0.7)';
        ctx.lineWidth = 2 / Math.max(0.5, this.cam.zoom);
        ctx.setLineDash([10, 6]);
        ctx.strokeRect(r.x * TILE, r.y * TILE, tw * TILE, th * TILE);
        ctx.setLineDash([]);
        const stt = this.sim.screenStats(b);
        this.drawTag(r.x * TILE + (tw * TILE) / 2, r.y * TILE - 6, `${tw}×${th} LED matrix · ${r.w}×${r.h} px · ${stt.lanes} lanes · ${stt.hz >= 1000 ? (stt.hz / 1000).toFixed(1) + ' kHz' : stt.hz + ' Hz'} · ${stt.cells} cells`, stt.capPx >= stt.needPx && stt.rows >= stt.h ? '#f43f5e' : '#f59e0b');
        if (stt.rows < stt.h) {
          // the frame buffer ends here: everything below stays dark until more registers are wired to the receiver
          const yb = r.y * TILE + (stt.rows / dens) * TILE;
          ctx.strokeStyle = '#f59e0b';
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(r.x * TILE, yb);
          ctx.lineTo((r.x + tw) * TILE, yb);
          ctx.stroke();
          ctx.setLineDash([]);
          const missing = Math.ceil((stt.w * stt.h) / 4096) - stt.cells;
          this.drawTag(r.x * TILE + (tw * TILE) / 2, yb + 14, `RAM ${stt.rows}/${stt.h} rows · +${missing} cells needed`, '#f59e0b');
        }
        if (stt.capPx < stt.needPx) {
          const need = Math.ceil(stt.needPx / (stt.hz * 64)) - stt.lanes;
          this.drawTag(r.x * TILE + (tw * TILE) / 2, r.y * TILE + th * TILE + 14, `lanes×clock ${(stt.capPx / 1e6).toFixed(1)}/${(stt.needPx / 1e6).toFixed(1)} M px/s · +${Math.max(1, need)} lanes or a faster clock`, '#f59e0b');
        }
      }
      return;
    }
    if (b.type === 'stacker') {
      const n = b.bufL?.length ?? 0, unpack = b.mode === 'unpack';
      this.drawArrow(b, b.dir, n ? '#22d3ee' : 'rgba(34,211,238,0.35)');
      if (!this.lowDetail) {
        this.drawBadge(b.x * TILE + sz - 13, b.y * TILE + 13, unpack ? String(n) : `${n}`, unpack ? '#f59e0b' : n >= CRATE_SIZE ? '#34d399' : '#22d3ee');
        if (n) this.drawItem(b.bufL![0], b.x * TILE + 13, b.y * TILE + sz - 13, 16);
        this.drawTag(cx, b.y * TILE - 4, unpack ? 'UNPACK' : `PACK ${n}/${CRATE_SIZE}`, unpack ? '#f59e0b' : '#22d3ee');
      }
      return;
    }
    if (b.type === 'mast') {
      if (!this.lowDetail && Math.sin(this.time * 4 + b.id) > 0.3) this.animGlow(cx, cy - sz * 0.3, 4, '#ef4444');
      return;
    }
    if (b.type === 'wind') {
      // three blades turning with the wind
      const w = this.sim.windFactor();
      const ang = this.time * (0.8 + 3.2 * w) + b.id;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      for (let k = 0; k < 3; k++) {
        ctx.rotate((Math.PI * 2) / 3);
        const L = sz * 0.47;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.moveTo(-3, 6);
        ctx.lineTo(-9, -L * 0.3 + 6);
        ctx.lineTo(-3, -L + 6);
        ctx.lineTo(4, -L * 0.3 + 6);
        ctx.closePath();
        ctx.fill();
        const g = ctx.createLinearGradient(-9, 0, 9, 0);
        g.addColorStop(0, '#9aa3ae');
        g.addColorStop(0.5, '#f1f5f9');
        g.addColorStop(1, '#aeb7c2');
        ctx.fillStyle = g;
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(-10, -L * 0.3);
        ctx.lineTo(-3, -L);
        ctx.lineTo(3, -L);
        ctx.lineTo(6, -L * 0.3);
        ctx.lineTo(4, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(-3, -L, 6, L * 0.08);
      }
      ctx.fillStyle = '#cbd5e1';
      ctx.strokeStyle = '#12161b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (!this.lowDetail) this.drawBadge(b.x * TILE + sz - 14, b.y * TILE + 14, `${Math.round(w * 100)}`, '#22d3ee');
      return;
    }
    if (b.type === 'dock') {
      const n = b.bufL?.length ?? 0;
      if (b.mode === 'unload') this.drawArrow(b, b.dir, n ? '#22d3ee' : 'rgba(34,211,238,0.35)');
      if (!this.lowDetail) this.drawTag(cx, b.y * TILE - 4, t(b.mode === 'unload' ? 'dock_tag_unload' : 'dock_tag_load'), b.mode === 'unload' ? '#22d3ee' : '#34d399');
      if (!this.lowDetail) {
        this.drawBadge(b.x * TILE + sz - 13, b.y * TILE + 13, String(n), n >= DOCK_CAP ? '#f59e0b' : b.mode === 'unload' ? '#22d3ee' : '#34d399');
        if (b.recipe) this.drawItem(b.recipe as ItemId, b.x * TILE + 11, b.y * TILE + 11, 14);
        if (b.status === 'dead_end') this.drawBadge(cx, b.y * TILE + sz - 12, '⊘', '#ef4444');
      }
      return;
    }
    if (b.type === 'depot') {
      if (!this.lowDetail) this.drawDepotLife(b, sz);
      const owned = this.sim.depotRobots(b);
      if (!this.lowDetail) this.drawBadge(b.x * TILE + sz - 13, b.y * TILE + 13, String(owned), owned ? '#22d3ee' : '#f59e0b');
      if (!owned && !this.lowDetail) this.drawTag(cx, b.y * TILE - 4, t('depot_empty_tag'), '#f59e0b');
      if (b.status === 'dead_end') this.drawBadge(cx, cy, '⊘', '#ef4444');
      return;
    }
    if (b.type === 'picker') {
      // the arm swings from the source (behind) to the target (front); the item rides on its tip
      const reach = b.threshold === 2 ? 2 : 1;
      const held = Object.keys(b.output ?? {})[0] as ItemId | undefined;
      const f = Math.min(1, b.rateT ?? 0);
      const ang = ((b.dir * Math.PI) / 2) + (held ? -Math.PI + Math.PI * f : Math.PI * f); // swing: back -> front while holding, front -> back when empty
      const len = sz * (0.4 + 0.5 * (reach - 1));
      const tx = cx + Math.sin(ang) * len, ty = cy - Math.cos(ang) * len;
      // two segments with an elbow bent to the side
      const ex = cx + Math.sin(ang - 0.5) * len * 0.55, ey = cy - Math.cos(ang - 0.5) * len * 0.55;
      ctx.lineCap = 'round';
      for (const [w, col] of [[11, '#12161b'], [7, '#aab4c0']] as [number, string][]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ex, ey);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
      ctx.fillStyle = '#f97316';
      ctx.strokeStyle = '#12161b';
      ctx.lineWidth = 2;
      for (const [x, y, r] of [[cx, cy, 7], [ex, ey, 5]]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (held && !this.lowDetail) this.drawItem(held, tx, ty, TILE * 0.36);
      else {
        ctx.fillStyle = b.status === 'blocked' ? '#ef4444' : '#22d3ee';
        ctx.beginPath();
        ctx.arc(tx, ty, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.recipe && !this.lowDetail) this.drawItem(b.recipe as ItemId, b.x * TILE + 11, b.y * TILE + 11, 14);
      if (reach === 2 && !this.lowDetail) this.drawBadge(b.x * TILE + sz - 13, b.y * TILE + 13, '2', '#22d3ee');
      return;
    }
    if (b.type === 'timer') {
      // output arrow, open/closed frame and a countdown arc
      this.drawArrow(b, b.dir, b.open === false ? '#ef4444' : '#22d3ee');
      const period = b.threshold ?? 3, left = b.timer ?? period;
      ctx.strokeStyle = b.open !== false ? '#34d399' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, sz * 0.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - left / period));
      ctx.stroke();
      if (!this.lowDetail) this.drawBadge(b.x * TILE + sz - 13, b.y * TILE + 13, `${period}s`, '#22d3ee');
      return;
    }
    if (b.type === 'sensor') {
      this.drawArrow(b, b.dir, '#22d3ee');
      // the beam across the belt lights up when an item runs through
      const horiz = b.dir === 1 || b.dir === 3;
      ctx.strokeStyle = b.working ? '#f43f5e' : 'rgba(244,63,94,0.35)';
      ctx.lineWidth = b.working ? 3 : 1.5;
      ctx.beginPath();
      if (horiz) {
        ctx.moveTo(cx, b.y * TILE + 4);
        ctx.lineTo(cx, b.y * TILE + sz - 4);
      } else {
        ctx.moveTo(b.x * TILE + 4, cy);
        ctx.lineTo(b.x * TILE + sz - 4, cy);
      }
      ctx.stroke();
      if (b.working && !this.lowDetail) this.animGlow(cx, cy, 6, '#f43f5e');
      return;
    }
    if (b.type === 'radio') {
      const rx = b.mode === 'rx';
      this.drawArrow(b, b.dir, rx ? '#22d3ee' : 'rgba(34,211,238,0.35)');
      if (b.working && !this.lowDetail) this.animGlow(cx, cy - sz * 0.2, 5 + 3 * Math.sin(this.time * 12), rx ? '#34d399' : '#f59e0b');
      if (!this.lowDetail) this.drawTag(cx, b.y * TILE - 4, `${rx ? 'RX' : 'TX'} ${b.threshold ?? 1}`, rx ? '#34d399' : '#f59e0b');
      return;
    }
    if (b.type === 'battery') {
      const frac = Math.min(1, (b.value ?? 0) / BATTERY_CAP);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(b.x * TILE + 10, b.y * TILE + sz - 12, sz - 20, 6);
      ctx.fillStyle = frac > 0.3 ? '#34d399' : '#f59e0b';
      ctx.fillRect(b.x * TILE + 10, b.y * TILE + sz - 12, (sz - 20) * frac, 6);
      if (b.working && !this.lowDetail) this.animGlow(cx, cy - 6, 4, '#fbbf24');
      return;
    }
    if (b.type === 'keyboard') {
      const tm = this.sim.keyboardTerminal(b);
      if (!tm) this.drawBadge(b.x * TILE + sz - 13, b.y * TILE + 13, '!', '#f59e0b');
      else if (b.working && !this.lowDetail) this.animGlow(b.x * TILE + sz - 14, b.y * TILE + 14, 4, '#34d399');
      return;
    }
    if (b.type === 'speaker') {
      const rx = this.sim.linkedReceiver(b);
      const level = rx ? audioLevel(rx.id) : 0;
      const bars = 6;
      for (let i = 0; i < bars; i++) {
        const on = level * bars > i;
        ctx.fillStyle = on ? (i < 4 ? '#34d399' : '#f59e0b') : 'rgba(255,255,255,0.12)';
        ctx.fillRect(b.x * TILE + 10 + i * 8, b.y * TILE + sz - 12, 6, 6);
      }
      if (!rx) this.drawBadge(b.x * TILE + sz - 13, b.y * TILE + 13, '!', '#f59e0b');
      else if (level > 0.05 && !this.lowDetail) this.animGlow(cx, cy - 4, 4 + level * 10, '#34d399');
      return;
    }
    if (b.type === 'oscillator') {
      const q = b.clock ?? 0, g = b.turbo ?? 0;
      for (let i = 0; i < OSCILLATOR_CRYSTALS; i++) {
        ctx.fillStyle = i < q ? '#22d3ee' : i < q + g ? '#f8fafc' : 'rgba(255,255,255,0.14)';
        ctx.fillRect(b.x * TILE + 9 + i * 11, b.y * TILE + sz - 11, 8, 5);
      }
      const hz = q * CRYSTAL_HZ.quartz + g * CRYSTAL_HZ.glass;
      if (hz && !this.lowDetail) {
        const k = 0.5 + 0.5 * Math.sin(this.time * (g ? 40 : q * 4));
        this.animGlow(cx, cy - 3, 4 + 3 * k, g ? '#f8fafc' : '#22d3ee');
      }
      this.drawBadge(b.x * TILE + sz - 13, b.y * TILE + 11, hz >= 1000 ? `${hz / 1000}k` : `${hz}`, hz ? (g ? '#f8fafc' : '#22d3ee') : '#f59e0b');
      return;
    }
    if (ARITH.has(b.type)) {
      const mark = this.cellMark.get(b.id);
      if (mark) {
        ctx.strokeStyle = mark;
        ctx.lineWidth = 3;
        ctx.strokeRect(b.x * TILE + 2, b.y * TILE + 2, TILE - 4, TILE - 4);
      }
      if (this.lowDetail) return; // thousands of RAM cells: no arrows or numbers when zoomed out
      // arithmetic modules: output arrow, side inputs, and the number they hold
      this.drawArrow(b, b.dir, '#22d3ee');
      const back = ((b.dir + 2) & 3) as Dir;
      if (b.type !== 'adder') this.drawArrow(b, ((b.dir + 1) & 3) as Dir, b.type === 'register' ? '#f59e0b' : '#c084fc');
      if (b.type === 'adder' || b.type === 'subtractor') this.drawArrow(b, ((b.dir + 3) & 3) as Dir, '#c084fc');
      void back;
      const txt = b.type === 'register' ? String(b.value ?? 0) : b.type === 'multiplier' ? `×${b.value ?? 1}` : b.type === 'divider' ? `÷${b.value ?? 1}` : b.type === 'subtractor' ? `−${b.debt ?? 0}` : `${b.acc ?? 0}`;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      roundRect(ctx, cx - 16, b.y * TILE + 4, 32, 15, 4);
      ctx.fill();
      ctx.fillStyle = '#e6eaf0';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, cx, b.y * TILE + 12);
      if (b.bufL?.length) this.drawBadge(b.x * TILE + TILE - 11, b.y * TILE + TILE - 11, String(Math.min(99, b.bufL.length)), '#22d3ee');
      return;
    }
    if (b.type === 'lamp') {
      // pixel: glow in the colour of the item it holds
      const item = this.sim.lampItem(b);
      if (item) {
        const col = itemColor(item);
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, sz * 0.62);
        g.addColorStop(0, col);
        g.addColorStop(0.45, col);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = g;
        ctx.fillRect(b.x * TILE - 8, b.y * TILE - 8, TILE + 16, TILE + 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, cy, sz * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.arc(cx - sz * 0.08, cy - sz * 0.08, sz * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.mode === 'pass' && !this.lowDetail) this.drawArrow(b, b.dir, '#22d3ee');
      if (b.recipe && !this.lowDetail) this.drawItem(b.recipe as ItemId, b.x * TILE + TILE - 11, b.y * TILE + 11, 16);
      return;
    }
    if (def.kind === 'miner' || def.kind === 'machine' || def.kind === 'storage' || def.kind === 'splitter' || def.kind === 'logic') {
      this.drawArrow(b, b.dir, (b.type === 'valve' || b.type === 'switch') && b.open === false ? '#ef4444' : '#22d3ee');
      if (def.kind === 'splitter' || b.type === 'overflow') {
        this.drawArrow(b, ((b.dir + 1) & 3) as Dir, b.type === 'overflow' ? '#f59e0b' : '#22d3ee');
        this.drawArrow(b, ((b.dir + 3) & 3) as Dir, b.type === 'overflow' ? '#f59e0b' : '#22d3ee');
      }
      if (b.type === 'sorter') this.drawArrow(b, ((b.dir + 3) & 3) as Dir, '#c084fc');
    }
    if (def.kind === 'logic') {
      // configuration badge: filter item (sorter / valve) or ratio (mixer)
      if ((b.type === 'sorter' || b.type === 'valve' || b.type === 'switch') && b.recipe) this.drawItem(b.recipe as ItemId, b.x * TILE + TILE - 13, b.y * TILE + 13, 20);
      else if (b.type === 'sorter' || (b.type === 'valve' && !b.recipe)) this.drawBadge(b.x * TILE + TILE - 13, b.y * TILE + 13, '?', '#f59e0b');
      if (b.type === 'valve' || b.type === 'switch') {
        const open = b.open !== false;
        ctx.fillStyle = open ? 'rgba(52,211,153,0.7)' : 'rgba(239,68,68,0.75)';
        ctx.fillRect(b.x * TILE + 6, b.y * TILE + TILE - 10, TILE - 12, 4);
        if (b.type === 'switch') {
          ctx.strokeStyle = open ? '#34d399' : '#ef4444';
          ctx.lineWidth = 3;
          ctx.strokeRect(b.x * TILE + 3, b.y * TILE + 3, TILE - 6, TILE - 6);
          if (b.threshold !== undefined && b.threshold >= 0 && b.threshold <= 15 && !this.lowDetail) {
            // a key of a terminal: its number
            ctx.fillStyle = open ? '#34d399' : 'rgba(255,255,255,0.85)';
            ctx.font = 'bold 15px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.threshold.toString(16).toUpperCase(), b.x * TILE + TILE / 2, b.y * TILE + TILE - 12);
          }
        }
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
      const wear = b.wear ?? 0;
      if (wear >= 0.75) {
        // wear gauge in the lower left corner; worn out = amber spanner badge and sparks
        const gx = b.x * TILE + 6, gy = b.y * TILE + sz - 20;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(gx - 1, gy - 1, 6, 12);
        ctx.fillStyle = wear >= 1 ? '#f59e0b' : '#eab308';
        ctx.fillRect(gx, gy + 10 * (1 - wear), 4, 10 * wear);
        if (wear >= 1) {
          this.drawBadge(b.x * TILE + 14, b.y * TILE + sz - 30, '⚙', '#f59e0b');
          if (b.working && !this.lowDetail && Math.sin(this.time * 9 + b.id) > 0.93) {
            ctx.strokeStyle = '#fde68a';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 3; i++) {
              const a = this.time * 7 + i * 2.1 + b.id;
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(cx + Math.cos(a) * sz * 0.3, cy + Math.sin(a) * sz * 0.3);
              ctx.stroke();
            }
          }
        }
      }
    }
    if (PLANT_FUEL[b.type]) {
      if (b.type === 'reactor' && b.working && !this.lowDetail) this.animGlow(cx, cy, sz * 0.16, '#a855f7');
      const fuel = Math.min(1, (b.fuelSeconds ?? 0) / PLANT_FUEL[b.type]!.seconds);
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

  // ---------- Mainboards: green plate under everything wired to a terminal, PC / I markers on the RAM cells ----------

  private cellMark = new Map<number, string>(); // building id -> colour of the marker (PC amber, I cyan)

  private drawBoards(x0: number, y0: number, x1: number, y1: number) {
    const { ctx } = this;
    const s = this.sim.state;
    this.cellMark.clear();
    for (const t of s.buildings) {
      if (t.type !== 'terminal') continue;
      const board = this.sim.board(t);
      if (!board.tiles.size) continue;
      ctx.fillStyle = 'rgba(20,92,64,0.55)';
      const plate = (x: number, y: number) => {
        if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) return;
        ctx.fillRect(x * TILE - 2, y * TILE - 2, TILE + 4, TILE + 4);
      };
      for (let y = t.y - 0; y < t.y + 2; y++) for (let x = t.x; x < t.x + 2; x++) plate(x, y);
      for (const idx of board.tiles) plate(idx % s.width, Math.floor(idx / s.width));
      const cpu = this.sim.cpu(t);
      if (cpu) {
        const pc = board.cells[cpu.pc - CHIP_ROM_BYTES], pc2 = board.cells[cpu.pc + 1 - CHIP_ROM_BYTES], ir = board.cells[cpu.i - CHIP_ROM_BYTES];
        if (pc) this.cellMark.set(pc.id, '#f59e0b');
        if (pc2) this.cellMark.set(pc2.id, '#f59e0b');
        if (ir && !this.cellMark.has(ir.id)) this.cellMark.set(ir.id, '#22d3ee');
      }
    }
  }

  private mxCache = new Map<number, { canvas: HTMLCanvasElement; ver: number; s: number }>();
  private mxMask = new Map<number, HTMLCanvasElement>();

  /** The grid of dark gaps between the LEDs, rendered once per resolution. */
  private matrixMask(s: number): HTMLCanvasElement {
    let m = this.mxMask.get(s);
    if (m) return m;
    m = document.createElement('canvas');
    m.width = TILE;
    m.height = TILE;
    const c = m.getContext('2d')!;
    c.fillStyle = '#070a0e';
    c.fillRect(0, 0, TILE, TILE);
    const cell = (TILE - 4) / s, gap = s > 8 ? 0.8 : 1.6;
    c.globalCompositeOperation = 'destination-out';
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) c.fillRect(2 + x * cell + gap / 2, 2 + y * cell + gap / 2, cell - gap, cell - gap);
    this.mxMask.set(s, m);
    return m;
  }

  /** RGB LEDs on one tile (8x8 or 16x16): the pixels are cached as a tiny image and scaled up without smoothing. */
  private drawMatrix(b: Building) {
    const { ctx } = this;
    const x0 = b.x * TILE, y0 = b.y * TILE;
    const s = matrixSize(b);
    const ver = b.acc ?? 0;
    let cache = this.mxCache.get(b.id);
    if (!cache || cache.ver !== ver || cache.s !== s) {
      const canvas = cache?.s === s ? cache.canvas : document.createElement('canvas');
      canvas.width = s;
      canvas.height = s;
      const c = canvas.getContext('2d')!;
      const img = c.createImageData(s, s);
      const px = b.px;
      for (let i = 0; i < s * s; i++) {
        const v = px && px.length === s * s ? px[i] : 0;
        img.data[i * 4] = v ? v >> 16 : 16;
        img.data[i * 4 + 1] = v ? (v >> 8) & 255 : 22;
        img.data[i * 4 + 2] = v ? v & 255 : 30;
        img.data[i * 4 + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      cache = { canvas, ver, s };
      this.mxCache.set(b.id, cache);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cache.canvas, x0 + 2, y0 + 2, TILE - 4, TILE - 4);
    ctx.imageSmoothingEnabled = true;
    if (!this.lowDetail && s <= 16) ctx.drawImage(this.matrixMask(s), x0, y0);
    else {
      ctx.strokeStyle = '#070a0e';
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 + 1, y0 + 1, TILE - 2, TILE - 2);
    }
  }

  /** A sweeping line over each live video wall plus the scan sample marker: the sampling made visible. */
  private drawScanlines(visible: Building[]) {
    const { ctx } = this;
    for (const b of visible) {
      if (b.type !== 'screen' || !b.working) continue;
      const r = this.sim.screenRect(b);
      const first = this.sim.at(r.x, r.y);
      const dens = first?.type === 'matrix' ? matrixSize(first) : MATRIX_SIZE;
      const tw = r.w / dens, th = r.h / dens;
      const sweep = (this.time * 0.6) % 1;
      const y = r.y * TILE + sweep * th * TILE;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(r.x * TILE, y - 3, tw * TILE, 6);
      const p = this.sim.scanPos(b);
      if (p && (b.mode ?? 'scan') === 'scan' && !this.lowDetail) {
        const px = r.x * TILE + (p.x / p.w) * tw * TILE, py = r.y * TILE + (p.y / p.h) * th * TILE;
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - 4, py - 4, 8, 8);
      }
    }
  }

  /** Copper trace from a bus tile to each neighbouring board part (or terminal). */
  private drawBus(b: Building) {
    const { ctx } = this;
    const cx = b.x * TILE + TILE / 2, cy = b.y * TILE + TILE / 2;
    ctx.strokeStyle = '#d98b45';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    let links = 0;
    for (let d = 0; d < 4; d++) {
      const n = this.sim.at(b.x + DX[d], b.y + DY[d]);
      if (!n || (!BOARD_PARTS.has(n.type) && n.type !== 'terminal')) continue;
      links++;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + DX[d] * TILE * 0.5, cy + DY[d] * TILE * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8a25a';
    ctx.beginPath();
    ctx.arc(cx, cy, links ? 5 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a4a22';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
    ctx.fill();
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
      ctx.strokeStyle = f.target ? (item ? itemColor(item) : '#22d3ee') : '#ef4444';
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
      if (def.kind !== 'miner' && def.kind !== 'machine' && def.kind !== 'storage' && def.kind !== 'logic' && !PLANT_FUEL[b.type]) continue;
      const sz = def.size * TILE;
      const cx = b.x * TILE + sz / 2;
      const top = b.y * TILE - 6;
      let item: ItemId | null = null;
      if (b.type === 'miner') item = b.mineItem!;
      else if (b.recipe && def.kind === 'machine') item = RECIPE_BY_ID[b.recipe].output;
      else if (def.kind === 'storage') item = (Object.keys(b.store ?? {})[0] as ItemId) ?? null;
      const rate = b.rate ?? 0;
      let text = item ? `${rate.toFixed(0)}/min` : '';
      if (b.type === 'miner') text += `  ${this.sim.oreLeft(b.x, b.y)}`;
      if (def.kind === 'storage') text = String(Object.values(b.store ?? {}).reduce((a, c) => a + (c ?? 0), 0));
      if (PLANT_FUEL[b.type]) text = `${Math.ceil(b.fuelSeconds ?? 0)}s`;
      if (b.type === 'lamp' || b.type === 'switch' || b.type === 'terminal' || ARITH.has(b.type)) continue;
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
    const perTile = 1 / BELT_SPACING; // items a tile can hold (compact items; bulky ores fill it sooner)
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
      ctx.fillStyle = itemColor(b.items![n - 1].item);
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
          const col = itemColor(TERRAIN_ITEM[t]!);
          c = [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
        }
        img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      for (const b of s.buildings) {
        if (b.type === 'core' && this.sim.coreHidden) continue;
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
