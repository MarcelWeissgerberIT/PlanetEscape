// Tiny procedural sound effects (no audio files needed).
let ctx: AudioContext | null = null;
let enabled = true;

try {
  enabled = localStorage.getItem('pe_sound') !== 'off';
} catch {
  /* ignore */
}

export function soundEnabled() {
  return enabled;
}

export function setSound(on: boolean) {
  enabled = on;
  if (!on) stopAmbient();
  else if (ambientOn) setTimeout(startAmbient, 0);
  try {
    localStorage.setItem('pe_sound', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, vol = 0.08, slide = 0) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

/** Filtered noise burst (rumble, hiss). */
function noise(dur: number, freq: number, vol = 0.08, q = 1) {
  const c = ac();
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
  src.connect(f).connect(g).connect(c.destination);
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
  master.connect(c.destination);
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
}

export function stopAmbient() {
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
