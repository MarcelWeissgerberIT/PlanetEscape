// Procedural sound (no audio files needed): effects, the ambient soundscape and the mix they run through.
// Everything goes through one small mixer: effects, ambience and music each have a bus with its own volume, a
// shared hall (a generated impulse response) gives them space, a compressor on the master keeps peaks in check.
let ctx: AudioContext | null = null;
let enabled = true;

type Bus = 'sfx' | 'amb' | 'music';
let mix: { master: GainNode; buses: Record<Bus, GainNode>; verb: GainNode } | null = null;
const VOL_KEY: Record<Bus, string> = { sfx: 'pe_vol_sfx', amb: 'pe_vol_amb', music: 'pe_vol_music' };
const DEFAULT_VOL: Record<Bus, number> = { sfx: 0.8, amb: 0.7, music: 0.6 };

/** Stored volume of a bus, 0..1. */
export function volume(bus: Bus): number {
  try {
    const v = localStorage.getItem(VOL_KEY[bus]);
    if (v !== null && !Number.isNaN(Number(v))) return Math.max(0, Math.min(1, Number(v)));
  } catch {
    /* ignore */
  }
  return DEFAULT_VOL[bus];
}

export function setVolume(bus: Bus, v: number) {
  v = Math.max(0, Math.min(1, v));
  try {
    localStorage.setItem(VOL_KEY[bus], String(v));
  } catch {
    /* ignore */
  }
  if (mix && ctx) mix.buses[bus].gain.setTargetAtTime(curve(v), ctx.currentTime, 0.05);
}

/** Sliders feel linear when the gain follows a curve. */
const curve = (v: number) => v * v;

function buildMix(c: AudioContext) {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  const master = c.createGain();
  master.gain.value = 0.9;
  master.connect(comp).connect(c.destination);
  // the hall: 3.2 s of decaying stereo noise, darker towards the tail
  const secs = 3.2, len = Math.floor(c.sampleRate * secs);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += ((Math.random() * 2 - 1) - lp) * (0.6 - 0.5 * t);
      d[i] = lp * Math.pow(1 - t, 2.6);
    }
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  const verb = c.createGain();
  verb.gain.value = 0.55;
  verb.connect(conv).connect(master);
  const buses = {} as Record<Bus, GainNode>;
  for (const b of ['sfx', 'amb', 'music'] as Bus[]) {
    buses[b] = c.createGain();
    buses[b].gain.value = curve(volume(b));
    buses[b].connect(master);
  }
  mix = { master, buses, verb };
}

/** The audio context with its mixer (null while sound is off). */
export function audio(): { c: AudioContext; bus: (b: Bus) => GainNode; verb: GainNode } | null {
  const c = ac();
  if (!c || !mix) return null;
  const m = mix;
  return { c, bus: (b) => m.buses[b], verb: m.verb };
}

try {
  enabled = localStorage.getItem('pe_sound') !== 'off';
} catch {
  /* ignore */
}

export function soundEnabled() {
  return enabled;
}

/** Sound effects on or off (music and ambience have their own switches). */
export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem('pe_sound', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    buildMix(ctx);
  }
  if (ctx.state === 'suspended' && !document.hidden) void ctx.resume();
  return ctx;
}

/** The context for an effect, or null while effects are off. */
function fx(): AudioContext | null {
  return enabled ? ac() : null;
}

// a tab in the background falls silent (and its timers would stutter anyway)
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else void ctx.resume();
});

function tone(freq: number, dur: number, type: OscillatorType, vol = 0.08, slide = 0) {
  const c = fx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g);
  out(g, 0.18);
  o.start();
  o.stop(c.currentTime + dur);
}

/** Route a sound into the effects bus with some of it sent into the hall. */
function out(node: AudioNode, send = 0.15) {
  if (!mix || !ctx) return;
  node.connect(mix.buses.sfx);
  if (send > 0) {
    const s = ctx.createGain();
    s.gain.value = send;
    node.connect(s).connect(mix.verb);
  }
}

/** Filtered noise burst (rumble, hiss). */
function noise(dur: number, freq: number, vol = 0.08, q = 1) {
  const c = fx();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + Math.min(0.3, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(f).connect(g);
  out(g, 0.2);
  src.start();
  src.stop(c.currentTime + dur);
}

/** Noise swept through a band-pass: whooshes for pages and panels. */
function sweep(dur: number, from: number, to: number, vol = 0.05) {
  const c = fx();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(from, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(f).connect(g);
  out(g, 0.35);
  src.start();
  src.stop(c.currentTime + dur);
}

// ---------- Ambient soundscape (procedural: wind, drone, factory hum) ----------
let ambientOn = true;
try {
  ambientOn = localStorage.getItem('pe_ambient') !== 'off';
} catch {
  /* ignore */
}
let amb: { master: GainNode; hum: GainNode; nodes: AudioScheduledSourceNode[] } | null = null;

export function ambientEnabled() {
  return ambientOn;
}

export function setAmbient(on: boolean) {
  ambientOn = on;
  try {
    localStorage.setItem('pe_ambient', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  if (on) startAmbient();
  else stopAmbient();
}

/** Start the soundscape (must follow a user gesture so the AudioContext may run). */
export function startAmbient() {
  if (!ambientOn || amb) return;
  const c = ac();
  if (!c) return;
  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, c.currentTime);
  master.gain.exponentialRampToValueAtTime(1, c.currentTime + 4);
  master.connect(mix!.buses.amb);
  const nodes: AudioScheduledSourceNode[] = [];
  // wind: looping brown noise through a low-pass filter, slowly swelling
  const len = c.sampleRate * 3;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  const windGain = c.createGain();
  windGain.gain.value = 0.05;
  const windLfo = c.createOscillator();
  windLfo.frequency.value = 0.07;
  const windDepth = c.createGain();
  windDepth.gain.value = 0.03;
  windLfo.connect(windDepth).connect(windGain.gain);
  noise.connect(lp).connect(windGain).connect(master);
  noise.start();
  windLfo.start();
  nodes.push(noise, windLfo);
  // drone: two low sines a fifth apart with a slow beat
  const drone = c.createGain();
  drone.gain.value = 0.03;
  for (const [f, det] of [
    [55, 0],
    [82.4, 2],
    [110.5, -3],
  ]) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(drone);
    o.start();
    nodes.push(o);
  }
  const trem = c.createOscillator();
  trem.frequency.value = 0.11;
  const tremDepth = c.createGain();
  tremDepth.gain.value = 0.012;
  trem.connect(tremDepth).connect(drone.gain);
  trem.start();
  nodes.push(trem);
  drone.connect(master);
  // factory hum: grows with the number of working machines (see setActivity)
  const hum = c.createGain();
  hum.gain.value = 0;
  const humOsc = c.createOscillator();
  humOsc.type = 'sawtooth';
  humOsc.frequency.value = 50;
  const humLp = c.createBiquadFilter();
  humLp.type = 'lowpass';
  humLp.frequency.value = 180;
  humOsc.connect(humLp).connect(hum).connect(master);
  humOsc.start();
  nodes.push(humOsc);
  amb = { master, hum, nodes };
  startBiomeLayer();
}

// ---------- Biome layer: what this planet sounds like, on top of wind and drone ----------
type BiomeId = 'basalt' | 'rust' | 'ice' | 'moss' | 'volcanic';
let biomeId: BiomeId = 'basalt';
let biomeLayer: { out: GainNode; nodes: AudioScheduledSourceNode[]; timer: number } | null = null;

export function setBiome(id: string) {
  if (id === biomeId) return;
  biomeId = id as BiomeId;
  if (amb) startBiomeLayer();
}

function stopBiomeLayer() {
  const l = biomeLayer;
  biomeLayer = null;
  if (!l || !ctx) return;
  clearTimeout(l.timer);
  l.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
  setTimeout(() => {
    for (const n of l.nodes) {
      try {
        n.stop();
      } catch {
        /* ignore */
      }
    }
    l.out.disconnect();
  }, 3000);
}

function loopNoise(c: AudioContext, secs: number): AudioBufferSourceNode {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * secs), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function startBiomeLayer() {
  stopBiomeLayer();
  const c = ac();
  if (!c || !amb || !mix) return;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, c.currentTime);
  out.gain.setTargetAtTime(1, c.currentTime, 1.5);
  out.connect(amb.master);
  const wet = c.createGain();
  wet.gain.value = 0.5;
  out.connect(wet).connect(mix.verb);
  const nodes: AudioScheduledSourceNode[] = [];
  const l = { out, nodes, timer: 0 };
  biomeLayer = l;
  // a continuous bed per biome
  if (biomeId === 'ice' || biomeId === 'basalt') {
    // wind whistling over edges: a narrow band of noise that wanders in pitch
    const n = loopNoise(c, 2);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = biomeId === 'ice' ? 14 : 8;
    bp.frequency.value = biomeId === 'ice' ? 1100 : 600;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.05;
    const depth = c.createGain();
    depth.gain.value = biomeId === 'ice' ? 450 : 200;
    lfo.connect(depth).connect(bp.frequency);
    const g = c.createGain();
    g.gain.value = biomeId === 'ice' ? 0.05 : 0.03;
    n.connect(bp).connect(g).connect(out);
    n.start();
    lfo.start();
    nodes.push(n, lfo);
  } else if (biomeId === 'volcanic') {
    // a deep, restless rumble from below
    const n = loopNoise(c, 3);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 70;
    const g = c.createGain();
    g.gain.value = 0.16;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.13;
    const depth = c.createGain();
    depth.gain.value = 0.08;
    lfo.connect(depth).connect(g.gain);
    n.connect(lp).connect(g).connect(out);
    n.start();
    lfo.start();
    nodes.push(n, lfo);
  } else if (biomeId === 'moss') {
    // a faint, humid rustle
    const n = loopNoise(c, 2);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.value = 0.008;
    n.connect(bp).connect(g).connect(out);
    n.start();
    nodes.push(n);
  }
  // and now and then a single event
  const next = () => {
    if (biomeLayer !== l) return;
    event(c, out);
    l.timer = window.setTimeout(next, 2500 + Math.random() * 6000);
  };
  l.timer = window.setTimeout(next, 1500 + Math.random() * 3000);
}

/** One sound out of the landscape, somewhere left or right. */
function event(c: AudioContext, dest: AudioNode) {
  if (document.hidden) return;
  const t = c.currentTime + 0.02;
  const pan = c.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(dest);
  const blip = (f: number, f2: number, dur: number, vol: number, type: OscillatorType = 'sine', at = t) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f2, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(pan);
    o.start(at);
    o.stop(at + dur + 0.05);
  };
  const crackle = (dur: number, freq: number, q: number, vol: number, at = t) => {
    const src = c.createBufferSource();
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    // sparse clicks, not hiss: ice cracking, embers, gravel
    for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.02 ? Math.random() * 2 - 1 : 0;
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(bp).connect(g).connect(pan);
    src.start(at);
  };
  const r = Math.random();
  switch (biomeId) {
    case 'ice':
      // the ice sheet groans (a low, bending tone) or cracks
      if (r < 0.5) blip(180 + Math.random() * 80, 90, 1.4, 0.03, 'triangle');
      else crackle(0.6, 2500, 1.5, 0.35);
      break;
    case 'moss':
      // insects chirp in short trains, a drop falls
      if (r < 0.6) {
        const f = 3800 + Math.random() * 1600;
        const n = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) blip(f, f * 0.94, 0.05, 0.012, 'sine', t + i * 0.09);
      } else blip(1500, 500, 0.12, 0.03);
      break;
    case 'volcanic':
      // a distant eruption thump, embers crackling
      if (r < 0.4) {
        blip(70, 35, 1.2, 0.12);
        crackle(1.2, 900, 0.8, 0.2, t + 0.1);
      } else crackle(0.8, 1800, 1, 0.25);
      break;
    case 'rust':
      // loose metal: a creak that bends, a far clank (inharmonic)
      if (r < 0.5) blip(420 + Math.random() * 200, 300, 0.9, 0.012, 'sawtooth');
      else for (const [m, v] of [[1, 0.03], [2.4, 0.015], [4.1, 0.008]]) blip(310 * m, 300 * m, 1.6, v);
      break;
    default:
      // basalt: stones settle, a faint ping from a far machine
      if (r < 0.5) crackle(0.4, 1200, 1.2, 0.3);
      else blip(1760, 1740, 1.8, 0.008);
  }
}

export function stopAmbient() {
  stopBiomeLayer();
  if (!amb || !ctx) return;
  const a = amb;
  amb = null;
  a.master.gain.cancelScheduledValues(ctx.currentTime);
  a.master.gain.setValueAtTime(a.master.gain.value, ctx.currentTime);
  a.master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
  setTimeout(() => {
    for (const n of a.nodes) {
      try {
        n.stop();
      } catch {
        /* ignore */
      }
    }
    a.master.disconnect();
  }, 1600);
}

/** How busy the factory is: 0..n working machines -> hum level. */
export function setActivity(working: number) {
  if (!amb || !ctx) return;
  const target = Math.min(0.035, working * 0.0025);
  amb.hum.gain.setTargetAtTime(target, ctx.currentTime, 0.8);
}

export const sfx = {
  beep: () => tone(440, 0.09, 'square', 0.05),
  place: () => tone(520, 0.08, 'square', 0.05, 120),
  belt: () => tone(380, 0.05, 'triangle', 0.04, 60),
  remove: () => tone(300, 0.12, 'sawtooth', 0.05, -150),
  error: () => tone(160, 0.18, 'square', 0.06, -40),
  select: () => tone(700, 0.05, 'sine', 0.04),
  /** A soft, dry tick: the pointer moves onto a control. */
  hover: () => {
    tone(2300, 0.025, 'sine', 0.012, -500);
    noise(0.03, 6000, 0.006, 0.7);
  },
  /** A short two-layer press: a bright blip over a small thump. */
  click: () => {
    tone(1100, 0.04, 'square', 0.018, 300);
    tone(160, 0.09, 'sine', 0.05, -60);
  },
  /** A page slides in / out. */
  pageOpen: () => {
    sweep(0.45, 300, 2600, 0.045);
    tone(220, 0.35, 'sine', 0.03, 110);
  },
  pageClose: () => {
    sweep(0.35, 2400, 280, 0.04);
    tone(330, 0.25, 'sine', 0.025, -110);
  },
  /** The info panel rises: a short, bright sweep. */
  panelOpen: () => {
    sweep(0.22, 900, 3200, 0.02);
    tone(1500, 0.06, 'sine', 0.012, 400);
  },
  /** A switch flips. */
  toggle: () => {
    tone(880, 0.03, 'square', 0.02);
    setTimeout(() => tone(1320, 0.04, 'square', 0.02), 45);
  },
  mission: () => {
    tone(523, 0.15, 'triangle', 0.08);
    setTimeout(() => tone(659, 0.15, 'triangle', 0.08), 120);
    setTimeout(() => tone(784, 0.25, 'triangle', 0.08), 240);
    setTimeout(() => tone(1046, 0.4, 'triangle', 0.08), 380);
  },
  /** Deep rumble with a few knocks: the seismograph reports a quake. */
  quake: () => {
    noise(1.8, 140, 0.16, 4);
    tone(55, 1.6, 'sine', 0.08, -15);
    [250, 620, 980].forEach((ms) => setTimeout(() => tone(90, 0.12, 'square', 0.04, -30), ms));
  },
  /** Two bright chimes and a short radio chirp: a trade drone calls in. */
  trader: () => {
    tone(1320, 0.12, 'sine', 0.06);
    setTimeout(() => tone(1760, 0.18, 'sine', 0.06), 110);
    setTimeout(() => tone(900, 0.08, 'square', 0.025, 500), 320);
  },
  /** Ratchet clicks and a hiss: a drone repaired a machine. */
  repair: () => {
    [0, 70, 140, 210].forEach((ms) => setTimeout(() => tone(1600, 0.025, 'square', 0.03), ms));
    setTimeout(() => noise(0.25, 4000, 0.03, 0.7), 260);
  },
  /** Fanfare by medal: bronze short, gold long and high. */
  medal: (m: number) => {
    const notes = m >= 3 ? [523, 659, 784, 1046, 1318] : m === 2 ? [523, 659, 784, 1046] : m === 1 ? [523, 659, 784] : [440, 523];
    notes.forEach((f, i) => setTimeout(() => tone(f, i === notes.length - 1 ? 0.5 : 0.14, 'triangle', 0.08), i * 120));
    if (m >= 3) setTimeout(() => noise(0.6, 6000, 0.025, 0.5), notes.length * 120);
  },
  launch: () => {
    tone(90, 2.5, 'sawtooth', 0.1, 400);
    setTimeout(() => tone(523, 0.3, 'triangle', 0.08), 600);
    setTimeout(() => tone(784, 0.3, 'triangle', 0.08), 900);
    setTimeout(() => tone(1046, 0.8, 'triangle', 0.08), 1200);
  },
};
