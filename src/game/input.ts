import { TILE } from './camera';
import { BUILDINGS } from './data';
import type { Renderer } from './render';
import { Sim } from './sim';
import type { Blueprint, Building, BuildingId, Dir, TerrainId } from './types';

export interface BeltStep {
  x: number;
  y: number;
  dir: Dir;
  ok: boolean;
}

export type Tool = { kind: 'none' } | { kind: 'build'; type: BuildingId } | { kind: 'delete' } | { kind: 'select' } | { kind: 'paste'; bp: Blueprint } | { kind: 'paint'; terrain: TerrainId | 'core'; brush: number };

export interface InputCallbacks {
  onPlace: (type: BuildingId, x: number, y: number, dir: Dir) => boolean;
  onRemove: (b: Building) => void;
  onSelect: (b: Building | null) => void;
  onPlacementError: (reason: string) => void;
  onToolChange: (tool: Tool) => void;
  onRotate: (b: Building) => void;
  onRotateKey: () => void;
  onSelectTile: (x: number, y: number) => void;
  onUndo: () => void;
  onAreaSelected: (x0: number, y0: number, x1: number, y1: number) => void;
  onPaste: (bp: Blueprint, x: number, y: number) => void;
  onTogglePause: () => void;
  onCycleSpeed: () => void;
  onBeltLine: (placed: number) => void;
  onBeltTapHint: () => void;
  onPaint: (x: number, y: number) => void;
}

interface PointerInfo {
  id: number;
  t: number;
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
  /** true while a terminal is selected: the keyboard belongs to the program, not to the shortcuts */
  captureKeys = false;
  private pointers = new Map<number, PointerInfo>();
  private dragging = false;
  private layingBelts = false;
  private pinchDist = 0;
  private pinchMid: [number, number] = [0, 0];
  private hoverTile: [number, number] | null = null;
  private moved = false;
  private longPressTimer: number | null = null;
  private lastTap: { x: number; y: number; t: number } | null = null;
  private lastTouch = -1e9;
  private lastPointerType = 'mouse';
  private selStart: [number, number] | null = null;
  private beltStart: [number, number] | null = null;
  private painting = false;
  private lastPaint: [number, number] | null = null;
  private beltPath: BeltStep[] = [];

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

  /** Pipette: make `b`'s type (and direction) the active build tool. */
  pickTool(b: Building) {
    if (b.type === 'core' || !this.sim.state.unlockedBuildings.includes(b.type)) return;
    this.dir = b.dir;
    this.setTool({ kind: 'build', type: b.type });
  }

  rotate() {
    if (this.tool.kind === 'paste') {
      this.tool = { kind: 'paste', bp: Sim.rotateBlueprint(this.tool.bp) };
      this.cb.onToolChange(this.tool);
      this.updateGhost();
      return;
    }
    this.dir = ((this.dir + 1) & 3) as Dir;
    this.updateGhost();
  }

  private get cam() {
    return this.renderer.cam;
  }

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    if (this.captureKeys && e.key.toLowerCase() !== 'escape') return;
    switch (e.key.toLowerCase()) {
      case 'r':
        this.cb.onRotateKey();
        break;
      case 'escape':
        this.selStart = null;
        this.renderer.selectRect = null;
        this.setTool({ kind: 'none' });
        this.cb.onSelect(null);
        break;
      case 'z':
        this.cb.onUndo();
        break;
      case 'q': {
        // pipette: pick up the building under the cursor as the current tool
        const b = this.hoverTile ? this.sim.at(this.hoverTile[0], this.hoverTile[1]) : null;
        if (b) this.pickTool(b);
        break;
      }
      case 'c':
        this.setTool(this.tool.kind === 'select' ? { kind: 'none' } : { kind: 'select' });
        break;
      case ' ':
        e.preventDefault();
        this.cb.onTogglePause();
        break;
      case '+':
      case 'f':
        this.cb.onCycleSpeed();
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
    // drop pointers whose 'up' never arrived (can happen when the OS steals a touch)
    const now = performance.now();
    for (const [id, p] of this.pointers) if (now - p.t > 3000) this.pointers.delete(id);
    // ignore compatibility mouse events browsers synthesise shortly after a touch (ghost clicks)
    if (e.pointerType === 'mouse' && now - this.lastTouch < 800) return;
    if (e.pointerType === 'touch') this.lastTouch = now;
    this.lastPointerType = e.pointerType;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const p: PointerInfo = { id: e.pointerId, t: now, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, button: e.button, type: e.pointerType };
    this.pointers.set(e.pointerId, p);
    this.moved = false;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchMid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      this.layingBelts = false;
      this.painting = false;
      this.beltPath = [];
      this.renderer.beltPreview = null;
      this.renderer.ghost = null;
      return;
    }
    this.dragging = true;
    if (this.tool.kind === 'select' && e.button === 0) {
      this.selStart = this.cam.screenToTile(e.clientX, e.clientY);
      this.renderer.selectRect = { x0: this.selStart[0], y0: this.selStart[1], x1: this.selStart[0], y1: this.selStart[1] };
    }
    if (this.tool.kind === 'paint' && e.button === 0) {
      this.painting = true;
      const [px, py] = this.cam.screenToTile(e.clientX, e.clientY);
      this.lastPaint = [px, py];
      this.cb.onPaint(px, py);
    }
    if (this.tool.kind === 'build' && this.tool.type === 'conveyor' && e.button === 0) {
      // a belt line starts on free ground or on a belt; dragging from a machine, deposit or rock pans instead
      const [sx, sy] = this.cam.screenToTile(e.clientX, e.clientY);
      const here = this.sim.at(sx, sy);
      const canStart = this.sim.inBounds(sx, sy) && (here ? here.type === 'conveyor' : this.sim.terrain(sx, sy) === 'ground');
      if (canStart) {
        this.layingBelts = true;
        this.beltStart = [sx, sy];
        this.beltPath = [];
      }
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

    if (this.painting) {
      const [px, py] = this.hoverTile;
      if (!this.lastPaint || this.lastPaint[0] !== px || this.lastPaint[1] !== py) {
        this.lastPaint = [px, py];
        this.cb.onPaint(px, py);
      }
      this.updateGhost();
      return;
    }
    if (this.layingBelts && this.moved) {
      // belt line editor: preview an L-shaped line from the start tile to the pointer, placed on release
      this.beltPath = this.beltStart ? this.planBeltLine(this.beltStart, this.hoverTile) : [];
      this.renderer.beltPreview = this.beltPath;
      this.renderer.ghost = null;
      return;
    }
    if (this.tool.kind === 'select' && this.selStart && p.button === 0) {
      this.renderer.selectRect = { x0: this.selStart[0], y0: this.selStart[1], x1: this.hoverTile[0], y1: this.hoverTile[1] };
      return;
    }
    const panButton = p.button === 1 || p.button === 2 || this.tool.kind === 'none' || (this.tool.kind === 'paint' && p.button !== 0) || (this.tool.kind === 'build' && (this.tool.type !== 'conveyor' || !this.layingBelts)) || this.tool.kind === 'delete' || this.tool.kind === 'paste';
    if (panButton && this.moved) {
      this.renderer.cancelPan();
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
    if (e.pointerType === 'touch') this.lastTouch = performance.now();
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
      return;
    }
    if (this.tool.kind === 'select' && this.selStart) {
      const [tx, ty] = this.cam.screenToTile(e.clientX, e.clientY);
      const [sx, sy] = this.selStart;
      this.selStart = null;
      this.renderer.selectRect = null;
      this.dragging = false;
      this.cb.onAreaSelected(sx, sy, tx, ty);
      return;
    }
    const wasPainting = this.painting;
    this.painting = false;
    this.lastPaint = null;
    if (wasPainting) {
      this.dragging = false;
      if (e.pointerType !== 'mouse') this.hoverTile = null;
      this.updateGhost();
      return;
    }
    const wasDragging = this.dragging;
    this.dragging = false;
    const wasLaying = this.layingBelts;
    this.layingBelts = false;
    if (!wasDragging) return;
    if (this.moved && !wasLaying) return; // pan
    if (wasLaying && this.moved) {
      // commit the previewed belt line
      this.commitBeltLine(this.beltPath);
      this.beltPath = [];
      this.beltStart = null;
      this.renderer.beltPreview = null;
      if (e.pointerType !== 'mouse') this.hoverTile = null;
      this.updateGhost();
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // tap
    const [tx, ty] = this.cam.screenToTile(e.clientX, e.clientY);
    if (this.tool.kind === 'none') this.renderer.pokeCritters(...this.cam.screenToWorld(e.clientX, e.clientY)); // a critter there runs off
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
        if (b?.type === 'switch') this.sim.toggleSwitch(b); // a switch flips on tap, like a real one
        if (b) this.cb.onSelect(b);
        else if (this.sim.inBounds(tx, ty)) this.cb.onSelectTile(tx, ty);
        break;
      case 'select':
        break;
      case 'paste': {
        const bp = this.tool.bp;
        this.cb.onPaste(bp, tx - Math.floor(bp.w / 2), ty - Math.floor(bp.h / 2));
        break;
      }
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
        if (type === 'conveyor' && !this.hasNeighbour(px, py)) {
          // a lone belt in the void is almost always an accident (tap to close a panel, tap to look)
          this.cb.onBeltTapHint();
          return;
        }
        if (this.cb.onPlace(type, px, py, this.dir) && type !== 'conveyor' && this.lastPointerType === 'touch') {
          // on touch, leave build mode after placing a building so the next tap cannot build by accident
          this.setTool({ kind: 'none' });
        }
        break;
      }
    }
  }

  /** Is there any building on one of the four neighbouring tiles? */
  private hasNeighbour(x: number, y: number): boolean {
    return !!(this.sim.at(x + 1, y) || this.sim.at(x - 1, y) || this.sim.at(x, y + 1) || this.sim.at(x, y - 1));
  }

  /** For multi-tile buildings the tapped tile becomes the centre-ish. */
  private originFor(type: BuildingId, tx: number, ty: number): [number, number] {
    const s = BUILDINGS[type].size;
    const off = Math.floor((s - 1) / 2);
    return [tx - off, ty - off];
  }

  /**
   * Plan an L-shaped belt line between two tiles. Both bends (horizontal-first, vertical-first) are
   * tried and the one with fewer blocked tiles wins; the line stops at the first tile that cannot
   * take a belt. Existing belts on the line are re-pointed instead of blocking it.
   */
  planBeltLine(from: [number, number], to: [number, number]): BeltStep[] {
    const [x0, y0] = from, [x1, y1] = to;
    const build = (horizontalFirst: boolean): BeltStep[] => {
      const tiles: { x: number; y: number }[] = [];
      let x = x0, y = y0;
      tiles.push({ x, y });
      const stepX = () => { while (x !== x1) { x += Math.sign(x1 - x); tiles.push({ x, y }); } };
      const stepY = () => { while (y !== y1) { y += Math.sign(y1 - y); tiles.push({ x, y }); } };
      if (horizontalFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
      const out: BeltStep[] = [];
      let plates = this.sim.state.inventory.iron_plate ?? 0;
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        const n = tiles[i + 1];
        let dir: Dir = out.length ? out[out.length - 1].dir : this.dir;
        if (n) dir = n.x > t.x ? 1 : n.x < t.x ? 3 : n.y > t.y ? 2 : 0;
        const here = this.sim.at(t.x, t.y);
        let ok: boolean;
        if (here?.type === 'conveyor') ok = true;
        else if (here) ok = false;
        else {
          const err = this.sim.placementError('conveyor', t.x, t.y);
          ok = !err || err === 'err_cost';
          if (ok) {
            if (plates <= 0) ok = false;
            else plates--;
          }
        }
        if (!ok) break;
        out.push({ x: t.x, y: t.y, dir, ok });
      }
      // a straight line has no second variant
      return out;
    };
    const a = build(true), b = build(false);
    return b.length > a.length ? b : a;
  }

  /** Place / re-point the belts of a planned line. */
  private commitBeltLine(path: BeltStep[]) {
    let placed = 0;
    for (const p of path) {
      const here = this.sim.at(p.x, p.y);
      if (here?.type === 'conveyor') {
        if (here.dir !== p.dir) this.sim.rotate(here, p.dir);
        continue;
      }
      if (!here && !this.sim.placementError('conveyor', p.x, p.y) && this.cb.onPlace('conveyor', p.x, p.y, p.dir)) placed++;
    }
    if (path.length) this.dir = path[path.length - 1].dir;
    if (placed) this.cb.onBeltLine(placed);
  }

  updateGhost() {
    this.renderer.paintGhost = this.tool.kind === 'paint' && this.hoverTile ? { x: this.hoverTile[0], y: this.hoverTile[1], brush: this.tool.terrain === 'core' ? 3 : this.tool.brush } : null;
    if (this.tool.kind === 'paint') {
      this.renderer.ghost = null;
      this.renderer.pasteGhost = null;
      return;
    }
    if (this.tool.kind === 'paste') {
      this.renderer.ghost = null;
      if (!this.hoverTile) {
        this.renderer.pasteGhost = null;
        return;
      }
      const bp = this.tool.bp;
      const x = this.hoverTile[0] - Math.floor(bp.w / 2), y = this.hoverTile[1] - Math.floor(bp.h / 2);
      this.renderer.pasteGhost = { bp, x, y, bad: this.sim.pasteErrors(bp, x, y) };
      return;
    }
    this.renderer.pasteGhost = null;
    if (this.tool.kind !== 'build' || !this.hoverTile) {
      this.renderer.ghost = null;
      return;
    }
    const [tx, ty] = this.hoverTile;
    const [px, py] = this.originFor(this.tool.type, tx, ty);
    this.renderer.ghost = { type: this.tool.type, x: px, y: py, dir: this.dir, valid: !this.sim.placementError(this.tool.type, px, py) };
  }
}
