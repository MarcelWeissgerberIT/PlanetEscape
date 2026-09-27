import { TILE } from './camera';
import { BUILDINGS } from './data';
import type { Renderer } from './render';
import type { Sim } from './sim';
import type { Building, BuildingId, Dir } from './types';

export type Tool = { kind: 'none' } | { kind: 'build'; type: BuildingId } | { kind: 'delete' };

export interface InputCallbacks {
  onPlace: (type: BuildingId, x: number, y: number, dir: Dir) => boolean;
  onRemove: (b: Building) => void;
  onSelect: (b: Building | null) => void;
  onPlacementError: (reason: string) => void;
  onToolChange: (tool: Tool) => void;
  onRotate: (b: Building) => void;
  onRotateKey: () => void;
}

interface PointerInfo {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  button: number;
  type: string;
}

/**
 * Unified pointer handling for touch + mouse: tap, drag (pan / lay belts), pinch zoom, wheel zoom.
 */
export class Input {
  tool: Tool = { kind: 'none' };
  dir: Dir = 1;
  private pointers = new Map<number, PointerInfo>();
  private dragging = false;
  private layingBelts = false;
  private lastBeltTile: [number, number] | null = null;
  private pinchDist = 0;
  private pinchMid: [number, number] = [0, 0];
  private hoverTile: [number, number] | null = null;
  private moved = false;
  private longPressTimer: number | null = null;
  private lastTap: { x: number; y: number; t: number } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private sim: Sim,
    private renderer: Renderer,
    private cb: InputCallbacks,
  ) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.updateGhost();
    this.renderer.deleteMode = tool.kind === 'delete';
    this.cb.onToolChange(tool);
  }

  rotate() {
    this.dir = ((this.dir + 1) & 3) as Dir;
    this.updateGhost();
  }

  private get cam() {
    return this.renderer.cam;
  }

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    switch (e.key.toLowerCase()) {
      case 'r':
        this.cb.onRotateKey();
        break;
      case 'escape':
        this.setTool({ kind: 'none' });
        this.cb.onSelect(null);
        break;
      case 'x':
      case 'delete':
        this.setTool(this.tool.kind === 'delete' ? { kind: 'none' } : { kind: 'delete' });
        break;
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.cam.zoomAt(e.clientX, e.clientY, factor);
  };

  private onDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    const p: PointerInfo = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, button: e.button, type: e.pointerType };
    this.pointers.set(e.pointerId, p);
    this.moved = false;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchMid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      this.layingBelts = false;
      this.lastBeltTile = null;
      this.renderer.ghost = null;
      return;
    }
    this.dragging = true;
    if (this.tool.kind === 'build' && this.tool.type === 'conveyor' && e.button === 0) {
      this.layingBelts = true;
      this.lastBeltTile = this.cam.screenToTile(e.clientX, e.clientY);
    }
    // long press in pan mode on touch = remove (mobile convenience)
    if (e.pointerType === 'touch' && this.tool.kind === 'none') {
      this.longPressTimer = window.setTimeout(() => {
        const [tx, ty] = this.cam.screenToTile(e.clientX, e.clientY);
        const b = this.sim.at(tx, ty);
        if (b && b.type !== 'core' && !this.moved) {
          this.cb.onSelect(b);
          if (navigator.vibrate) navigator.vibrate(15);
        }
        this.longPressTimer = null;
      }, 450);
    }
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      // hover (mouse) -> ghost
      if (e.pointerType === 'mouse') {
        this.hoverTile = this.cam.screenToTile(e.clientX, e.clientY);
        this.updateGhost();
      }
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 8) this.moved = true;
    this.hoverTile = this.cam.screenToTile(e.clientX, e.clientY);

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid: [number, number] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if (this.pinchDist > 0) this.cam.zoomAt(mid[0], mid[1], d / this.pinchDist);
      this.cam.x -= (mid[0] - this.pinchMid[0]) / this.cam.zoom;
      this.cam.y -= (mid[1] - this.pinchMid[1]) / this.cam.zoom;
      this.pinchDist = d;
      this.pinchMid = mid;
      return;
    }
    if (!this.dragging) return;

    if (this.layingBelts && this.moved) {
      this.layBeltTo(this.hoverTile);
      this.updateGhost();
      return;
    }
    const panButton = p.button === 1 || p.button === 2 || this.tool.kind === 'none' || (this.tool.kind === 'build' && this.tool.type !== 'conveyor') || this.tool.kind === 'delete';
    if (panButton && this.moved) {
      this.cam.x -= dx / this.cam.zoom;
      this.cam.y -= dy / this.cam.zoom;
      this.cam.clamp(this.sim.state.width * TILE, this.sim.state.height * TILE);
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    }
    this.updateGhost();
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    if (!p) return;
    if (this.pointers.size > 0) {
      // finished a pinch; do not treat as tap
      this.dragging = false;
      this.layingBelts = false;
      this.lastBeltTile = null;
      return;
    }
    const wasDragging = this.dragging;
    this.dragging = false;
    const wasLaying = this.layingBelts;
    this.layingBelts = false;
    this.lastBeltTile = null;
    if (!wasDragging) return;
    if (this.moved && !wasLaying) return; // pan
    if (wasLaying && this.moved) return; // belts already laid during drag
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // tap
    const [tx, ty] = this.cam.screenToTile(e.clientX, e.clientY);
    this.tap(tx, ty);
    if (e.pointerType !== 'mouse') {
      this.hoverTile = null;
      this.updateGhost();
    }
  };

  private onLeave = () => {
    this.hoverTile = null;
    this.updateGhost();
  };

  private tap(tx: number, ty: number) {
    const b = this.sim.at(tx, ty);
    // double tap on a rotatable building turns it by 90 degrees
    const now = performance.now();
    if (this.lastTap && this.lastTap.x === tx && this.lastTap.y === ty && now - this.lastTap.t < 380 && b && BUILDINGS[b.type].rotatable && this.tool.kind !== 'delete') {
      this.lastTap = null;
      this.sim.rotate(b, ((b.dir + 1) & 3) as Dir);
      this.cb.onRotate(b);
      return;
    }
    this.lastTap = { x: tx, y: ty, t: now };
    switch (this.tool.kind) {
      case 'none':
        this.cb.onSelect(b);
        break;
      case 'delete':
        if (b && b.type !== 'core') this.cb.onRemove(b);
        break;
      case 'build': {
        const type = this.tool.type;
        const [px, py] = this.originFor(type, tx, ty);
        if (b && b.type === type && BUILDINGS[type].rotatable) {
          // tapping an existing building of the same type turns it by 90 degrees
          this.sim.rotate(b, ((b.dir + 1) & 3) as Dir);
          this.cb.onRotate(b);
          return;
        }
        const err = this.sim.placementError(type, px, py);
        if (err) {
          this.cb.onPlacementError(err);
          return;
        }
        this.cb.onPlace(type, px, py, this.dir);
        break;
      }
    }
  }

  /** For multi-tile buildings the tapped tile becomes the centre-ish. */
  private originFor(type: BuildingId, tx: number, ty: number): [number, number] {
    const s = BUILDINGS[type].size;
    const off = Math.floor((s - 1) / 2);
    return [tx - off, ty - off];
  }

  private layBeltTo(tile: [number, number] | null) {
    if (!tile || !this.lastBeltTile) return;
    let [lx, ly] = this.lastBeltTile;
    const [tx, ty] = tile;
    if (lx === tx && ly === ty) return;
    // walk in single steps (Manhattan) so fast drags still create a continuous line
    let guard = 0;
    while ((lx !== tx || ly !== ty) && guard++ < 64) {
      let dir: Dir;
      if (Math.abs(tx - lx) >= Math.abs(ty - ly)) dir = tx > lx ? 1 : 3;
      else dir = ty > ly ? 2 : 0;
      this.dir = dir;
      // set/rotate the belt we are leaving to point toward the next tile
      const here = this.sim.at(lx, ly);
      if (here?.type === 'conveyor') this.sim.rotate(here, dir);
      else if (!here && !this.sim.placementError('conveyor', lx, ly)) this.cb.onPlace('conveyor', lx, ly, dir);
      lx += dir === 1 ? 1 : dir === 3 ? -1 : 0;
      ly += dir === 2 ? 1 : dir === 0 ? -1 : 0;
      const next = this.sim.at(lx, ly);
      if (next?.type === 'conveyor') this.sim.rotate(next, dir);
      else if (!next && !this.sim.placementError('conveyor', lx, ly)) this.cb.onPlace('conveyor', lx, ly, dir);
    }
    this.lastBeltTile = [tx, ty];
  }

  updateGhost() {
    if (this.tool.kind !== 'build' || !this.hoverTile) {
      this.renderer.ghost = null;
      return;
    }
    const [tx, ty] = this.hoverTile;
    const [px, py] = this.originFor(this.tool.type, tx, ty);
    this.renderer.ghost = { type: this.tool.type, x: px, y: py, dir: this.dir, valid: !this.sim.placementError(this.tool.type, px, py) };
  }
}
