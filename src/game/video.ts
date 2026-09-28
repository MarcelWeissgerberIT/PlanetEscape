// Video feeds for the "screen" building: a shared browser tab (YouTube in another tab, for example), the camera or a
// video file is sampled into a small RGB frame that the sim writes onto the LED matrices / lamps right of the receiver.
import type { Sim } from './sim';

export type VideoKind = 'screen' | 'camera' | 'file';
/** Centre-crop factors selectable on the receiver (index = building.ratio). */
export const VIDEO_CROPS = [1, 1.5, 2, 3];

class VideoFeed {
  readonly video = document.createElement('video');
  private readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private stream: MediaStream | null = null;
  private url: string | null = null;
  kind: VideoKind = 'screen';
  lastT = 0;

  async start(kind: VideoKind, file?: File): Promise<void> {
    this.stop();
    this.kind = kind;
    const v = this.video;
    v.muted = kind !== 'file';
    v.playsInline = true;
    v.loop = kind === 'file';
    if (kind === 'file') {
      if (!file) throw new Error('no file');
      this.url = URL.createObjectURL(file);
      v.srcObject = null;
      v.src = this.url;
    } else {
      const md = navigator.mediaDevices;
      if (!md) throw new Error('unsupported');
      this.stream = kind === 'screen' ? await md.getDisplayMedia({ video: true, audio: false }) : await md.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 }, audio: false });
      v.srcObject = this.stream;
      this.stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stop());
    }
    await v.play();
  }

  get live(): boolean {
    return !!(this.stream ? this.stream.active : this.url) && !this.video.paused && this.video.readyState >= 2;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.video.pause();
    this.video.srcObject = null;
    this.video.removeAttribute('src');
  }

  /** The current frame scaled (cover-fit, centre crop) to w x h RGBA pixels. */
  sample(w: number, h: number, crop = 1): Uint8ClampedArray | null {
    const v = this.video;
    if (!this.live || !v.videoWidth) return null;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const sa = v.videoWidth / v.videoHeight, da = w / h;
    let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
    if (sa > da) {
      sw = sh * da;
      sx = (v.videoWidth - sw) / 2;
    } else {
      sh = sw / da;
      sy = (v.videoHeight - sh) / 2;
    }
    if (crop > 1) {
      // zoom into the centre: a shared tab shows the whole page, the video is usually in the middle
      const nw = sw / crop, nh = sh / crop;
      sx += (sw - nw) / 2;
      sy += (sh - nh) / 2;
      sw = nw;
      sh = nh;
    }
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
    return this.ctx.getImageData(0, 0, w, h).data;
  }
}

const feeds = new Map<number, VideoFeed>();

export function videoLive(buildingId: number): VideoKind | null {
  const f = feeds.get(buildingId);
  return f && f.live ? f.kind : null;
}

export async function startVideo(buildingId: number, kind: VideoKind, file?: File): Promise<void> {
  let f = feeds.get(buildingId);
  if (!f) {
    f = new VideoFeed();
    feeds.set(buildingId, f);
  }
  await f.start(kind, file);
}

export function stopVideo(buildingId: number) {
  feeds.get(buildingId)?.stop();
  feeds.delete(buildingId);
}

/** Called every animation frame: pushes fresh frames (about 15 per second) into the receivers' displays. */
export function tickVideo(sim: Sim, now: number) {
  for (const [id, f] of feeds) {
    const b = sim.state.buildings.find((q) => q.id === id);
    if (!b || b.type !== 'screen') {
      f.stop();
      feeds.delete(id);
      continue;
    }
    if (!f.live || now - f.lastT < 40) continue;
    f.lastT = now;
    const r = sim.screenRect(b);
    const data = f.sample(r.w, r.h, VIDEO_CROPS[b.ratio ?? 0] ?? 1);
    if (data) sim.pushFrame(b, data, r.w, r.h);
  }
}
