// Generative music, played live through WebAudio (no audio files): slow detuned pads over a sub bass, sparse bells
// through a delay and a long hall, and in the game an arpeggio and a soft pulse that grow with the factory.
// Every biome has its own key and mode; the menu has a wide, calm one. Moods crossfade into each other.
import { audio } from './sfx';

export type Mood = 'menu' | 'game';
type Biome = 'basalt' | 'rust' | 'ice' | 'moss' | 'volcanic';

interface Style {
  /** bass note (midi) */
  root: number;
  scale: number[];
  /** chord roots as scale degrees, two bars each */
  prog: number[];
  bpm: number;
  /** pad filter opening in Hz */
  bright: number;
  /** chance of a bell per eighth */
  bells: number;
}

const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

const MENU: Style = { root: 38, scale: AEOLIAN, prog: [0, 5, 2, 6], bpm: 58, bright: 1500, bells: 0.13 };
const BIOME: Record<Biome, Style> = {
  basalt: { root: 45, scale: AEOLIAN, prog: [0, 3, 5, 4], bpm: 74, bright: 1200, bells: 0.07 },
  rust: { root: 40, scale: PHRYGIAN, prog: [0, 1, 0, 6], bpm: 70, bright: 1000, bells: 0.06 },
  ice: { root: 43, scale: LYDIAN, prog: [0, 1, 4, 5], bpm: 68, bright: 1900, bells: 0.1 },
  moss: { root: 36, scale: DORIAN, prog: [0, 3, 0, 6], bpm: 80, bright: 1300, bells: 0.08 },
  volcanic: { root: 37, scale: PHRYGIAN, prog: [0, 5, 1, 0], bpm: 64, bright: 800, bells: 0.05 },
};

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

let on = true;
try {
  on = localStorage.getItem('pe_music') !== 'off';
} catch {
  /* ignore */
}

let wantMood: Mood | null = null;
let biome: Biome = 'basalt';
/** 0..1: how busy the factory is (drives arpeggio and pulse) */
let target = 0;
let intensity = 0;

interface Layer {
  out: GainNode;
  delayIn: GainNode;
  style: Style;
  mood: Mood;
}
let layer: Layer | null = null;
let timer = 0;
let step = 0;
let nextAt = 0;
let unlocked = false;
let ducked = false;

export function musicEnabled() {
  return on;
}

export function setMusic(v: boolean) {
  on = v;
  try {
    localStorage.setItem('pe_music', v ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  apply();
}

/** What should play now: the menu theme, the game music or nothing. */
export function setMood(m: Mood | null) {
  wantMood = m;
  apply();
}

export function setMusicBiome(id: string) {
  if (!(id in BIOME) || id === biome) return;
  biome = id as Biome;
  apply();
}

/** Working machines -> how much rhythm the game music carries. */
export function setMusicActivity(working: number) {
  target = Math.min(1, working / 24);
}

// the context may only run after a gesture: the first click or key starts whatever is wanted by then
function unlock() {
  if (unlocked) return;
  unlocked = true;
  apply();
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true, passive: true });

function styleFor(m: Mood): Style {
  return m === 'menu' ? MENU : BIOME[biome];
}

function apply() {
  const a = on && unlocked && wantMood ? audio() : null;
  const want = a && wantMood ? styleFor(wantMood) : null;
  if (layer && want && layer.style === want) return;
  if (layer) fadeOut(layer);
  layer = null;
  if (!a || !want || !wantMood) {
    if (timer) clearInterval(timer);
    timer = 0;
    return;
  }
  const { c, bus, verb } = a;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, c.currentTime);
  out.gain.exponentialRampToValueAtTime(1, c.currentTime + 3.5);
  out.connect(bus('music'));
  const send = c.createGain();
  send.gain.value = 0.7;
  out.connect(send).connect(verb);
  // a dotted-eighth echo, darker with every repeat
  const delayIn = c.createGain();
  const dl = c.createDelay(2);
  dl.delayTime.value = (60 / want.bpm) * 0.75;
  const fb = c.createGain();
  fb.gain.value = 0.38;
  const damp = c.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2400;
  delayIn.connect(dl).connect(damp).connect(fb).connect(dl);
  damp.connect(out);
  layer = { out, delayIn, style: want, mood: wantMood };
  step = 0;
  nextAt = c.currentTime + 0.15;
  if (!timer) timer = window.setInterval(tick, 200);
  tick();
}

function fadeOut(l: Layer) {
  const a = audio();
  if (!a) return;
  const t = a.c.currentTime;
  l.out.gain.cancelScheduledValues(t);
  l.out.gain.setValueAtTime(Math.max(0.0001, l.out.gain.value), t);
  l.out.gain.exponentialRampToValueAtTime(0.0001, t + 3);
  setTimeout(() => l.out.disconnect(), 9000);
}

/** Schedule every eighth that starts within the next second. */
function tick() {
  const a = audio();
  if (!a || !layer) return;
  const { c } = a;
  // a video with sound (intro, story clip) plays: the music steps back
  const video = [...document.querySelectorAll('video')].some((v) => !v.paused && !v.muted && !v.ended);
  if (video !== ducked) {
    ducked = video;
    layer.out.gain.cancelScheduledValues(c.currentTime);
    layer.out.gain.setTargetAtTime(video ? 0.0001 : 1, c.currentTime, video ? 0.3 : 1.5);
  }
  if (nextAt < c.currentTime) nextAt = c.currentTime + 0.05; // the tab slept: no catching up
  const st = layer.style;
  const eighth = 60 / st.bpm / 2;
  while (nextAt < c.currentTime + 1) {
    intensity += (target - intensity) * 0.02;
    play(c, layer, step, nextAt, eighth);
    step++;
    nextAt += eighth;
  }
}

/** The chord on a scale degree: root, third, fifth, seventh (semitones above the key). */
function chord(st: Style, deg: number): number[] {
  const n = st.scale.length;
  return [0, 2, 4, 6].map((k) => {
    const i = deg + k;
    return st.scale[i % n] + 12 * Math.floor(i / n);
  });
}

function play(c: AudioContext, l: Layer, s: number, t: number, eighth: number) {
  const st = l.style;
  const bar16 = 16;
  const pos = s % bar16;
  const ci = Math.floor(s / bar16) % st.prog.length;
  const deg = st.prog[ci];
  const notes = chord(st, deg);
  const game = l.mood === 'game';
  if (pos === 0) {
    const len = bar16 * eighth;
    // pad: the triad (the seventh on every other chord) an octave and a half above the bass
    const voiced = ci % 2 ? notes : notes.slice(0, 3);
    for (const n of voiced) pad(c, l.out, st.root + 12 + n, t, len, 0.022, st.bright);
    // a high, quiet layer of the fifth in the menu: the wide sky
    if (!game) pad(c, l.out, st.root + 36 + notes[2], t, len, 0.008, st.bright * 1.6);
    bass(c, l.out, st.root + notes[0] - (notes[0] >= 7 ? 12 : 0), t, len);
  }
  // bells: sparse, mostly chord tones, never twice on the same eighth
  if (Math.random() < st.bells * (pos % 2 ? 0.5 : 1)) {
    const pool = Math.random() < 0.7 ? notes : st.scale;
    const n = pool[Math.floor(Math.random() * pool.length)];
    bell(c, l, st.root + 36 + n + (Math.random() < 0.25 ? 12 : 0), t);
  }
  if (!game) return;
  // arpeggio: fades in with the first working machines
  const k = intensity;
  if (k > 0.04) {
    const pat = [0, 1, 2, 3, 2, 1, 2, 0];
    const n = notes[pat[s % pat.length]] + 24;
    if (pos % 2 === 0 || k > 0.3) pluck(c, l, st.root + n, t, 0.018 + 0.035 * k, st.bright);
  }
  // pulse: a soft low thump on the beats and a ticking hat once the factory really runs
  if (k > 0.35 && pos % 4 === 0) thump(c, l.out, t, 0.12 * Math.min(1, (k - 0.35) * 2.5));
  if (k > 0.55 && pos % 2 === 1) hat(c, l.out, t, 0.02 * Math.min(1, (k - 0.55) * 3));
}

function pad(c: AudioContext, dest: AudioNode, midi: number, t: number, len: number, vol: number, bright: number) {
  const rel = 3.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(3, len * 0.4));
  g.gain.setValueAtTime(vol, t + len);
  g.gain.linearRampToValueAtTime(0, t + len + rel);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 0.8;
  f.frequency.setValueAtTime(bright * 0.45, t);
  f.frequency.linearRampToValueAtTime(bright, t + len * 0.5);
  f.frequency.linearRampToValueAtTime(bright * 0.6, t + len + rel);
  f.connect(g).connect(dest);
  for (const det of [-9, 8]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(midi);
    o.detune.value = det;
    o.connect(f);
    o.start(t);
    o.stop(t + len + rel + 0.1);
  }
}

function bass(c: AudioContext, dest: AudioNode, midi: number, t: number, len: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.09, t + 1.2);
  g.gain.setValueAtTime(0.09, t + len - 0.3);
  g.gain.linearRampToValueAtTime(0, t + len + 1.2);
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = hz(midi);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + len + 1.3);
}

function bell(c: AudioContext, l: Layer, midi: number, t: number) {
  const f0 = hz(midi);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.028, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  g.connect(l.out);
  g.connect(l.delayIn);
  // a sine with a slightly inharmonic overtone that dies sooner: glassy, not a beep
  for (const [mul, amp, dec] of [
    [1, 1, 3.2],
    [2.76, 0.35, 1.1],
    [5.4, 0.12, 0.5],
  ]) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f0 * mul;
    const og = c.createGain();
    og.gain.setValueAtTime(amp, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + dec + 0.05);
  }
}

function pluck(c: AudioContext, l: Layer, midi: number, t: number, vol: number, bright: number) {
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.value = hz(midi);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(bright * 2, t);
  f.frequency.exponentialRampToValueAtTime(220, t + 0.25);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(f).connect(g);
  g.connect(l.out);
  const s = c.createGain();
  s.gain.value = 0.5;
  g.connect(s).connect(l.delayIn);
  o.start(t);
  o.stop(t + 0.45);
}

function thump(c: AudioContext, dest: AudioNode, t: number, vol: number) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.4);
}

let hatBuf: AudioBuffer | null = null;
function hat(c: AudioContext, dest: AudioNode, t: number, vol: number) {
  if (!hatBuf) {
    hatBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.08), c.sampleRate);
    const d = hatBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = hatBuf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  src.connect(f).connect(g).connect(dest);
  src.start(t);
}
