// Video feeds for the "screen" building: a shared browser tab (YouTube in another tab, for example), the camera or a
// video file is sampled into a small RGB frame that the sim writes onto the LED matrices / lamps right of the receiver.
import type { Sim } from './sim';

export type VideoKind = 'screen' | 'camera' | 'file';
/** Centre-crop factors selectable on the receiver (index = building.ratio). */
export const VIDEO_CROPS = [1, 1.5, 2, 3];

let audioCtx: AudioContext | null = null;
function audio(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

class VideoFeed {
  readonly video = document.createElement('video');
  private readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private stream: MediaStream | null = null;
  private url: string | null = null;
  private source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
  private elementSource: MediaElementAudioSourceNode | null = null; // a video element can be wrapped only once
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelBuf = new Uint8Array(256);
  hasAudio = false;
  level = 0;
  kind: VideoKind = 'screen';
  lastT = 0;

  /** Route the feed's sound through a gain (speakers decide the loudness) and an analyser (VU meters). */
  private wireAudio() {
    this.unwireAudio();
    const ac = audio();
    if (this.kind === 'file') {
      this.elementSource ??= ac.createMediaElementSource(this.video);
      this.source = this.elementSource;
      this.hasAudio = true;
    } else {
      if (!this.stream || !this.stream.getAudioTracks().length) {
        this.hasAudio = false;
        return;
      }
      this.source = ac.createMediaStreamSource(this.stream);
      this.hasAudio = true;
    }
    this.gainNode = ac.createGain();
    this.gainNode.gain.value = 0;
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 256;
    this.source.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.analyser.connect(ac.destination);
  }

  private unwireAudio() {
    this.source?.disconnect();
    this.gainNode?.disconnect();
    this.analyser?.disconnect();
    this.source = this.gainNode = this.analyser = null;
    this.hasAudio = false;
    this.level = 0;
  }

  setGain(g: number) {
    if (this.gainNode) this.gainNode.gain.value = g;
  }

  /** 0..1 loudness of the last few milliseconds. */
  measure(): number {
    if (!this.analyser) return (this.level = 0);
    this.analyser.getByteTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) {
      const v = (this.levelBuf[i] - 128) / 128;
      sum += v * v;
    }
    this.level = Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 3);
    return this.level;
  }

  async start(kind: VideoKind, file?: File): Promise<void> {
    this.stop();
    this.kind = kind;
    const v = this.video;
    v.muted = kind !== 'file'; // the element itself stays silent for streams; sound goes through the audio graph
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
      this.stream = kind === 'screen' ? await md.getDisplayMedia({ video: true, audio: true }) : await md.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 }, audio: false });
      v.srcObject = this.stream;
      this.stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stop());
    }
    await v.play();
    this.wireAudio();
  }

  get live(): boolean {
    return !!(this.stream ? this.stream.active : this.url) && !this.video.paused && this.video.readyState >= 2;
  }

  stop() {
    this.unwireAudio();
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

/** Whether the live feed carries sound (a shared tab only does when "share tab audio" was ticked). */
export function videoHasAudio(buildingId: number): boolean {
  return !!feeds.get(buildingId)?.hasAudio;
}

/** Current loudness 0..1 of a receiver's feed (VU meters). */
export function audioLevel(buildingId: number): number {
  return feeds.get(buildingId)?.level ?? 0;
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
    f.setGain(sim.receiverGain(b));
    f.measure();
    const r = sim.screenRect(b);
    const interval = Math.max(40, (r.w * r.h) / 8000); // 25 fps for small walls, ~15 fps at 1024x512
    if (!f.live || now - f.lastT < interval) continue;
    f.lastT = now;
    const data = f.sample(r.w, r.h, VIDEO_CROPS[b.ratio ?? 0] ?? 1);
    if (data) sim.pushFrame(b, data, r.w, r.h);
  }
}
