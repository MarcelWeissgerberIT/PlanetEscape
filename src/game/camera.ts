export const TILE = 64;

export class Camera {
  x = 0; // world px at screen centre
  y = 0;
  zoom = 1;
  width = 1;
  height = 1;
  minZoom = 0.12;
  maxZoom = 2.5;

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.zoom + this.width / 2, (wy - this.y) * this.zoom + this.height / 2];
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.width / 2) / this.zoom + this.x, (sy - this.height / 2) / this.zoom + this.y];
  }

  screenToTile(sx: number, sy: number): [number, number] {
    const [wx, wy] = this.screenToWorld(sx, sy);
    return [Math.floor(wx / TILE), Math.floor(wy / TILE)];
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const [nx, ny] = this.screenToWorld(sx, sy);
    this.x += wx - nx;
    this.y += wy - ny;
  }

  clamp(worldW: number, worldH: number) {
    const margin = TILE * 4;
    this.x = Math.max(-margin, Math.min(worldW + margin, this.x));
    this.y = Math.max(-margin, Math.min(worldH + margin, this.y));
  }
}
