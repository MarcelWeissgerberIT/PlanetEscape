import { buildingSprite, itemSprite, ready, terrainSprite } from './assets';
import { Camera, TILE } from './camera';
import { BUILDINGS, ITEMS, RECIPE_BY_ID, TERRAIN_ITEM } from './data';
import type { Sim } from './sim';
import type { Building, BuildingId, Dir, ItemId } from './types';
import { DX, DY } from './types';

export interface Ghost {
  type: BuildingId;
  x: number;
  y: number;
  dir: Dir;
  valid: boolean;
}

export class Renderer {
  ctx: CanvasRenderingContext2D;
  cam = new Camera();
  ground: CanvasPattern | null = null;
  time = 0;
  ghost: Ghost | null = null;
  selected: Building | null = null;
  deleteMode = false;
  dpr = 1;

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
    // subtle noise speckle
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * 256, y = rnd() * 256, r = rnd() * 1.6 + 0.3;
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.22)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // faint hex dots grid
    g.fillStyle = 'rgba(120,140,160,0.08)';
    for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 16) {
      g.beginPath();
      g.arc(x + ((y / 16) % 2) * 8, y, 1.1, 0, Math.PI * 2);
      g.fill();
    }
    this.ground = this.ctx.createPattern(c, 'repeat');
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const w = window.innerWidth, h = window.innerHeight;
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

  draw(dt: number) {
    this.time += dt;
    const { ctx, cam } = this;
    const s = this.sim.state;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#1a1d23';
    ctx.fillRect(0, 0, cam.width, cam.height);

    // world transform
    ctx.save();
    ctx.translate(cam.width / 2, cam.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const [tx0, ty0] = cam.screenToTile(0, 0);
    const [tx1, ty1] = cam.screenToTile(cam.width, cam.height);
    const x0 = Math.max(0, tx0), y0 = Math.max(0, ty0);
    const x1 = Math.min(s.width - 1, tx1 + 1), y1 = Math.min(s.height - 1, ty1 + 1);

    // ground
    ctx.fillStyle = this.ground ?? '#373d45';
    ctx.fillRect(x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);

    // deposits
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = s.terrain[y * s.width + x];
        if (t === 'ground') continue;
        const img = terrainSprite(t);
        if (ready(img)) ctx.drawImage(img, x * TILE, y * TILE, TILE, TILE);
        else {
          ctx.fillStyle = ITEMS[TERRAIN_ITEM[t]!].color;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(x * TILE + 8, y * TILE + 8, TILE - 16, TILE - 16);
          ctx.globalAlpha = 1;
        }
      }
    }

    // grid lines (only when zoomed in enough)
    if (cam.zoom > 0.5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.13)';
      ctx.lineWidth = 1 / cam.zoom;
      ctx.beginPath();
      for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(x * TILE, y0 * TILE); ctx.lineTo(x * TILE, (y1 + 1) * TILE); }
      for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(x0 * TILE, y * TILE); ctx.lineTo((x1 + 1) * TILE, y * TILE); }
      ctx.stroke();
    }

    // map border
    ctx.strokeStyle = 'rgba(56,189,248,0.35)';
    ctx.lineWidth = 3 / cam.zoom;
    ctx.strokeRect(0, 0, s.width * TILE, s.height * TILE);

    // buildings: belts first, then the rest so machines overlap belt edges
    const visible: Building[] = [];
    for (const b of s.buildings) {
      const sz = BUILDINGS[b.type].size;
      if (b.x + sz <= x0 || b.x > x1 || b.y + sz <= y0 || b.y > y1) continue;
      visible.push(b);
    }
    for (const b of visible) if (b.type === 'conveyor') this.drawBelt(b);
    for (const b of visible) if (b.type === 'conveyor') this.drawBeltItems(b);
    for (const b of visible) if (b.type !== 'conveyor') this.drawBuilding(b);

    // ghost
    if (this.ghost) this.drawGhost(this.ghost);

    // selection
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

    ctx.restore();
  }

  /** Where does this belt receive from? returns 'back' | 'left' | 'right' | 'none' */
  private beltInput(b: Building): 'back' | 'left' | 'right' | 'none' {
    const back = this.sim.at(b.x - DX[b.dir], b.y - DY[b.dir]);
    if (back && this.feedsInto(back, b, b.dir)) return 'back';
    const ld = ((b.dir + 3) & 3) as Dir; // left of travel
    const rd = ((b.dir + 1) & 3) as Dir;
    const left = this.sim.at(b.x + DX[ld], b.y + DY[ld]);
    const right = this.sim.at(b.x + DX[rd], b.y + DY[rd]);
    const lf = left && this.feedsInto(left, b, rd);
    const rf = right && this.feedsInto(right, b, ld);
    if (lf && !rf) return 'left';
    if (rf && !lf) return 'right';
    return 'none';
  }

  /** Does building `from` output into `to` travelling in direction `dir`? */
  private feedsInto(from: Building, to: Building, dir: Dir): boolean {
    if (from.type === 'conveyor') return from.dir === dir;
    if (from.type === 'splitter') return from.dir !== ((dir + 2) & 3);
    if (from.type === 'core' || from.type === 'solar' || from.type === 'generator') return false;
    // machines / miners / storage output over the whole front edge
    return this.sim.frontTiles(from).some((t) => t.x === to.x && t.y === to.y);
  }

  private drawBelt(b: Building) {
    const { ctx } = this;
    const input = this.beltInput(b);
    const cx = b.x * TILE + TILE / 2, cy = b.y * TILE + TILE / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((b.dir * Math.PI) / 2);
    // belt oriented "up" in local space
    const w = TILE * 0.62, h = TILE;
    const curved = input === 'left' || input === 'right';
    const sgn = input === 'left' ? -1 : 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    if (!curved) {
      ctx.fillStyle = '#2b2f37';
      roundRect(ctx, -w / 2, -h / 2, w, h, 6);
      ctx.fill();
      ctx.strokeStyle = '#3d434d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(-w / 2, h / 2);
      ctx.moveTo(w / 2, -h / 2); ctx.lineTo(w / 2, h / 2);
      ctx.stroke();
    } else {
      // L-shaped path from the side centre through the middle to the front centre
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(sgn * (h / 2), 0);
        ctx.lineTo(0, 0);
        ctx.lineTo(0, -h / 2);
      };
      path();
      ctx.strokeStyle = '#3d434d';
      ctx.lineWidth = w + 4;
      ctx.stroke();
      path();
      ctx.strokeStyle = '#2b2f37';
      ctx.lineWidth = w;
      ctx.stroke();
    }
    // moving chevrons
    ctx.strokeStyle = 'rgba(34,211,238,0.55)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const speed = 40;
    const off = (this.time * speed) % 16;
    ctx.beginPath();
    if (curved) {
      // quarter arc around the corner (sgn*h/2, -h/2), from side centre (angle pi/2) to front centre
      const ccx = sgn * (h / 2), ccy = -h / 2, r = h / 2;
      const a0 = Math.PI / 2, a1 = sgn > 0 ? Math.PI : 0;
      const n = 4;
      for (let i = 0; i < n; i++) {
        const tt = ((i * 16 + off) / (n * 16)) % 1;
        const a = a0 + (a1 - a0) * tt;
        const px = ccx + Math.cos(a) * r, py = ccy + Math.sin(a) * r;
        // direction of travel = derivative of position wrt tt
        let tx = -Math.sin(a) * (a1 - a0), ty = Math.cos(a) * (a1 - a0);
        const l = Math.hypot(tx, ty) || 1;
        tx /= l; ty /= l;
        chevron(ctx, px, py, tx, ty, 7);
      }
    } else {
      for (let yy = h / 2 - off; yy > -h / 2 - 8; yy -= 16) chevron(ctx, 0, yy, 0, -1, 7);
    }
    ctx.stroke();
    ctx.restore();
  }

  private beltItemPos(b: Building, pos: number, input: string): [number, number] {
    // local coords, belt pointing up; returns world coords
    let lx = 0, ly = 0;
    if (input === 'left' || input === 'right') {
      const sgn = input === 'left' ? -1 : 1;
      if (pos >= 0.5) {
        const tt = (pos - 0.5) * 2;
        const a0 = Math.PI / 2, a1 = sgn > 0 ? Math.PI : 0;
        const a = a0 + (a1 - a0) * tt;
        lx = sgn * (TILE / 2) + Math.cos(a) * (TILE / 2);
        ly = -TILE / 2 + Math.sin(a) * (TILE / 2);
      } else {
        ly = TILE / 2 - pos * TILE;
      }
    } else {
      ly = TILE / 2 - pos * TILE;
    }
    const a = (b.dir * Math.PI) / 2;
    const rx = lx * Math.cos(a) - ly * Math.sin(a);
    const ry = lx * Math.sin(a) + ly * Math.cos(a);
    return [b.x * TILE + TILE / 2 + rx, b.y * TILE + TILE / 2 + ry];
  }

  private drawBeltItems(b: Building) {
    if (!b.items?.length) return;
    const input = this.beltInput(b);
    const size = TILE * 0.42;
    for (const it of b.items) {
      const [px, py] = this.beltItemPos(b, it.pos, input);
      this.drawItem(it.item, px, py, size);
    }
  }

  drawItem(id: ItemId, px: number, py: number, size: number) {
    const { ctx } = this;
    const img = itemSprite(id);
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
  }

  private drawBuilding(b: Building, alpha = 1) {
    const { ctx } = this;
    const def = BUILDINGS[b.type];
    const sz = def.size * TILE;
    const cx = b.x * TILE + sz / 2, cy = b.y * TILE + sz / 2;
    const img = buildingSprite(b.type);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate((b.dir * Math.PI) / 2);
    if (ready(img)) ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
    else {
      ctx.fillStyle = '#3a4048';
      roundRect(ctx, -sz / 2 + 4, -sz / 2 + 4, sz - 8, sz - 8, 8);
      ctx.fill();
    }
    ctx.restore();

    if (alpha < 1) return;
    // output arrow
    if (def.kind === 'miner' || def.kind === 'machine' || def.kind === 'storage' || def.kind === 'splitter') {
      this.drawArrow(b, b.dir, '#22d3ee');
      if (def.kind === 'splitter') {
        this.drawArrow(b, ((b.dir + 1) & 3) as Dir, '#22d3ee');
        this.drawArrow(b, ((b.dir + 3) & 3) as Dir, '#22d3ee');
      }
    }
    // status
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
      else if (def.kind === 'machine' && b.recipe) {
        // show recipe output icon in the corner
        const r = RECIPE_BY_ID[b.recipe];
        this.drawItem(r.output, b.x * TILE + sz - 14, b.y * TILE + 14, 22);
      }
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
    }
    if (b.type === 'core') {
      // gentle pulsing landing beacon
      const glow = 0.35 + 0.2 * Math.sin(this.time * 2.5);
      ctx.strokeStyle = `rgba(34,211,238,${glow})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, sz * 0.47, 0, Math.PI * 2);
      ctx.stroke();
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
    if (g.type === 'conveyor') {
      this.drawBelt({ id: -1, type: 'conveyor', x: g.x, y: g.y, dir: g.dir, items: [] });
    } else {
      this.drawBuilding({ id: -1, type: g.type, x: g.x, y: g.y, dir: g.dir }, 0.6);
    }
    ctx.fillStyle = g.valid ? 'rgba(34,211,238,0.18)' : 'rgba(239,68,68,0.3)';
    ctx.fillRect(g.x * TILE, g.y * TILE, sz, sz);
    ctx.strokeStyle = g.valid ? '#22d3ee' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(g.x * TILE + 1, g.y * TILE + 1, sz - 2, sz - 2);
    if (def.rotatable && g.type !== 'conveyor' && g.type !== 'solar') this.drawArrow({ id: -1, type: g.type, x: g.x, y: g.y, dir: g.dir }, g.dir, g.valid ? '#22d3ee' : '#ef4444');
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

/** Adds a chevron centred at (x,y) pointing along (tx,ty) to the current path. */
function chevron(ctx: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, s: number) {
  // perpendicular
  const px = -ty, py = tx;
  ctx.moveTo(x - tx * s * 0.5 + px * s, y - ty * s * 0.5 + py * s);
  ctx.lineTo(x + tx * s * 0.5, y + ty * s * 0.5);
  ctx.lineTo(x - tx * s * 0.5 - px * s, y - ty * s * 0.5 - py * s);
}
