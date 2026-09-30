// Generative music, played live through WebAudio (no audio files). A small album of songs: each has its own key,
// mode, tempo, chord progression, a recognisable melody (derived from its name, so it is the same every time), its
// lead instrument, bass and drum style. Songs play in shuffle and crossfade after a few minutes; the menu has its
// own calm ones, the game prefers the songs that fit the planet. In the game the rhythm grows with the factory.
// A song runs in sections: intro (pads and bass), theme, theme up an octave with full rhythm, and a quiet break.
import { getLang } from '../i18n';
import { audio } from './sfx';

export type Mood = 'menu' | 'game';
type Biome = 'basalt' | 'rust' | 'ice' | 'moss' | 'volcanic';
type Lead = 'bell' | 'glass' | 'flute' | 'pluck';

interface Song {
  id: string;
  name: { de: string; en: string };
  mood: Mood;
  biomes?: Biome[]; // planets this song suits (picked more often there)
  root: number; // bass note (midi)
  scale: number[];
  prog: number[]; // chord roots as scale degrees
  bars: 1 | 2; // bars per chord
  bpm: number;
  bright: number; // pad filter opening in Hz
  lead: Lead;
  bass: 'drone' | 'pulse' | 'walk';
  drums: 'none' | 'soft' | 'steady' | 'tribal';
  arp: number[] | null; // chord tone pattern per eighth (game only, grows with the factory)
  sparkle: number; // chance of a random bell per eighth
}

const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];

export const SONGS: Song[] = [
  // menu
  { id: 'crash', name: { de: 'Absturzstelle', en: 'Crash Site' }, mood: 'menu', root: 38, scale: AEOLIAN, prog: [0, 5, 2, 6], bars: 2, bpm: 58, bright: 1500, lead: 'bell', bass: 'drone', drums: 'none', arp: null, sparkle: 0.08 },
  { id: 'orbit', name: { de: 'Kalter Orbit', en: 'Cold Orbit' }, mood: 'menu', root: 41, scale: LYDIAN, prog: [0, 1, 5, 4], bars: 2, bpm: 62, bright: 2000, lead: 'glass', bass: 'drone', drums: 'none', arp: null, sparkle: 0.1 },
  { id: 'signal', name: { de: 'Letztes Signal', en: 'Last Signal' }, mood: 'menu', root: 36, scale: DORIAN, prog: [0, 3, 6, 4], bars: 2, bpm: 54, bright: 1200, lead: 'flute', bass: 'drone', drums: 'none', arp: null, sparkle: 0.05 },
  // game
  { id: 'melt', name: { de: 'Erste Schmelze', en: 'First Melt' }, mood: 'game', biomes: ['basalt', 'volcanic'], root: 45, scale: AEOLIAN, prog: [0, 3, 5, 4], bars: 2, bpm: 74, bright: 1200, lead: 'pluck', bass: 'pulse', drums: 'soft', arp: [0, 1, 2, 3, 2, 1, 2, 0], sparkle: 0.05 },
  { id: 'rust', name: { de: 'Rostiger Horizont', en: 'Rusty Horizon' }, mood: 'game', biomes: ['rust'], root: 40, scale: PHRYGIAN, prog: [0, 1, 0, 6], bars: 2, bpm: 70, bright: 1000, lead: 'flute', bass: 'pulse', drums: 'tribal', arp: [0, 2, 1, 2, 0, 2, 3, 2], sparkle: 0.04 },
  { id: 'ice', name: { de: 'Eisfelder', en: 'Ice Fields' }, mood: 'game', biomes: ['ice'], root: 43, scale: LYDIAN, prog: [0, 1, 4, 5], bars: 2, bpm: 68, bright: 1900, lead: 'glass', bass: 'drone', drums: 'soft', arp: [0, 2, 3, 2, 1, 2, 3, 1], sparkle: 0.1 },
  { id: 'moss', name: { de: 'Moosgarten', en: 'Moss Garden' }, mood: 'game', biomes: ['moss'], root: 36, scale: DORIAN, prog: [0, 3, 0, 6], bars: 1, bpm: 84, bright: 1300, lead: 'bell', bass: 'walk', drums: 'steady', arp: [0, 1, 2, 1, 3, 1, 2, 1], sparkle: 0.06 },
  { id: 'ember', name: { de: 'Glutkammer', en: 'Ember Chamber' }, mood: 'game', biomes: ['volcanic'], root: 37, scale: HARMONIC, prog: [0, 5, 3, 4], bars: 2, bpm: 64, bright: 850, lead: 'flute', bass: 'drone', drums: 'tribal', arp: [0, 3, 2, 3, 1, 3, 2, 3], sparkle: 0.03 },
  { id: 'line', name: { de: 'Fließband', en: 'Assembly Line' }, mood: 'game', biomes: ['basalt', 'moss'], root: 43, scale: MIXO, prog: [0, 6, 3, 0], bars: 1, bpm: 92, bright: 1500, lead: 'pluck', bass: 'walk', drums: 'steady', arp: [0, 2, 1, 3, 0, 2, 1, 3], sparkle: 0.03 },
  { id: 'night', name: { de: 'Nachtschicht', en: 'Night Shift' }, mood: 'game', biomes: ['ice', 'rust'], root: 38, scale: AEOLIAN, prog: [0, 6, 5, 6], bars: 2, bpm: 78, bright: 1100, lead: 'bell', bass: 'pulse', drums: 'soft', arp: [0, 1, 2, 3, 3, 2, 1, 0], sparkle: 0.05 },
];

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

let on = true;
try {
  on = localStorage.getItem('pe_music') !== 'off';
} catch {
  /* ignore */
}

let wantMood: Mood | null = null;
let biome: Biome = 'basalt';
/** 0..1: how busy the factory is (drives arpeggio and rhythm) */
let target = 0;
let intensity = 0;

interface Layer {
  out: GainNode;
  delayIn: GainNode;
  song: Song;
  melody: (number | null)[];
  started: number; // context time the song began
  length: number; // seconds until the next song
}
let layer: Layer | null = null;
let timer = 0;
let step = 0;
let nextAt = 0;
let unlocked = false;
let ducked = 0;
let voiceDuck = false;
const recent: string[] = [];
const songListeners: ((s: Song | null) => void)[] = [];

/** KORA is talking: the music steps back a little. */
export function setVoiceDuck(on: boolean) {
  voiceDuck = on;
  if (layer) tick();
}

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

/** What should play now: the menu songs, the game songs or nothing. */
export function setMood(m: Mood | null) {
  if (m === wantMood) return;
  wantMood = m;
  apply(true);
}

export function setMusicBiome(id: string) {
  if (id === biome || !['basalt', 'rust', 'ice', 'moss', 'volcanic'].includes(id)) return;
  biome = id as Biome;
  // a new planet: the next song fits it (the current one plays on until its end)
}

/** Working machines -> how much rhythm the game music carries. */
export function setMusicActivity(working: number) {
  target = Math.min(1, working / 24);
}

/** The song playing now (null: none). */
export function currentSong(): { id: string; name: string } | null {
  if (!layer) return null;
  return { id: layer.song.id, name: layer.song.name[docLang()] };
}

/** Skip to the next song in the shuffle. */
export function nextSong() {
  if (layer) apply(true);
}

export function onSongChange(cb: (s: { id: string; name: string } | null) => void) {
  songListeners.push(() => cb(currentSong()));
}

const docLang = (): 'de' | 'en' => (getLang() === 'de' ? 'de' : 'en');

// the context may only run after a gesture: the first click or key starts whatever is wanted by then
function unlock() {
  if (unlocked) return;
  unlocked = true;
  apply();
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true, passive: true });

/** Shuffle: any song of the mood but the last two, the ones that suit this planet three times as likely. */
function pickSong(m: Mood): Song {
  const pool = SONGS.filter((s) => s.mood === m);
  const fresh = pool.filter((s) => !recent.includes(s.id));
  const from = fresh.length ? fresh : pool;
  const weight = (s: Song) => (m === 'game' && s.biomes?.includes(biome) ? 3 : 1);
  let r = Math.random() * from.reduce((a, s) => a + weight(s), 0);
  for (const s of from) {
    r -= weight(s);
    if (r <= 0) return s;
  }
  return from[0];
}

/** A song's melody: two bars of eighths from its name (a small seeded random walk over the scale, with rests). */
function melodyOf(song: Song): (number | null)[] {
  let seed = 0;
  for (const ch of song.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out: (number | null)[] = [];
  let deg = [0, 2, 4][Math.floor(rnd() * 3)];
  for (let i = 0; i < 16; i++) {
    // strong beats mostly sound, off beats often rest; the phrase ends on the root or fifth
    const rest = i % 2 ? rnd() < 0.55 : rnd() < 0.2;
    if (i === 14) deg = rnd() < 0.5 ? 0 : 4;
    if (rest && i !== 14) {
      out.push(null);
      continue;
    }
    out.push(deg);
    const stepBy = [-2, -1, -1, 1, 1, 2, 0][Math.floor(rnd() * 7)];
    deg = Math.max(-2, Math.min(9, deg + stepBy));
  }
  return out;
}

function apply(forceNew = false) {
  const a = on && unlocked && wantMood ? audio() : null;
  if (layer && a && !forceNew) return; // keeps playing
  if (layer) fadeOut(layer);
  layer = null;
  if (!a || !wantMood) {
    if (timer) clearInterval(timer);
    timer = 0;
    for (const l of songListeners) l(null);
    return;
  }
  const song = pickSong(wantMood);
  recent.unshift(song.id);
  recent.length = Math.min(recent.length, 2);
  const { c, bus, verb } = a;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, c.currentTime);
  out.gain.exponentialRampToValueAtTime(1, c.currentTime + 4);
  out.connect(bus('music'));
  const send = c.createGain();
  send.gain.value = 0.6;
  out.connect(send).connect(verb('music'));
  // a dotted-eighth echo, darker with every repeat
  const delayIn = c.createGain();
  const dl = c.createDelay(2);
  dl.delayTime.value = (60 / song.bpm) * 0.75;
  const fb = c.createGain();
  fb.gain.value = 0.36;
  const damp = c.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2400;
  delayIn.connect(dl).connect(damp).connect(fb).connect(dl);
  damp.connect(out);
  layer = { out, delayIn, song, melody: melodyOf(song), started: c.currentTime, length: 150 + Math.random() * 90 };
  step = 0;
  nextAt = c.currentTime + 0.15;
  if (!timer) timer = window.setInterval(tick, 200);
  ducked = 0;
  for (const l of songListeners) l(song);
  tick();
}

function fadeOut(l: Layer) {
  const a = audio();
  if (!a) return;
  const t = a.c.currentTime;
  l.out.gain.cancelScheduledValues(t);
  l.out.gain.setValueAtTime(Math.max(0.0001, l.out.gain.value), t);
  l.out.gain.exponentialRampToValueAtTime(0.0001, t + 4);
  setTimeout(() => l.out.disconnect(), 10000);
}

/** Schedule every eighth that starts within the next second; after its time the song hands over to the next one. */
function tick() {
  const a = audio();
  if (!a || !layer) return;
  const { c } = a;
  if (c.currentTime - layer.started > layer.length) {
    apply(true);
    return;
  }
  // a video with sound (intro, story clip) silences the music, KORA speaking turns it down
  const video = [...document.querySelectorAll('video')].some((v) => !v.paused && !v.muted && !v.ended);
  const duck = video ? 2 : voiceDuck ? 1 : 0;
  if (duck !== ducked) {
    ducked = duck;
    layer.out.gain.cancelScheduledValues(c.currentTime);
    layer.out.gain.setTargetAtTime(duck === 2 ? 0.0001 : duck === 1 ? 0.35 : 1, c.currentTime, duck ? 0.3 : 1.5);
  }
  if (nextAt < c.currentTime) nextAt = c.currentTime + 0.05; // the tab slept: no catching up
  const eighth = 60 / layer.song.bpm / 2;
  while (nextAt < c.currentTime + 1) {
    intensity += (target - intensity) * 0.02;
    play(c, layer, step, nextAt, eighth);
    step++;
    nextAt += eighth;
  }
}

/** The chord on a scale degree: root, third, fifth, seventh (semitones above the key). */
function chord(sc: number[], deg: number): number[] {
  return [0, 2, 4, 6].map((k) => degree(sc, deg + k));
}
/** Semitones of a scale degree (negative and beyond an octave allowed). */
function degree(sc: number[], d: number): number {
  const n = sc.length;
  const o = Math.floor(d / n);
  return sc[((d % n) + n) % n] + 12 * o;
}

function play(c: AudioContext, l: Layer, s: number, t: number, eighth: number) {
  const song = l.song;
  const chordLen = 8 * song.bars; // eighths per chord
  const phraseLen = chordLen * song.prog.length;
  const pos = s % chordLen;
  const ci = Math.floor(s / chordLen) % song.prog.length;
  const section = Math.floor(s / phraseLen) % 4; // 0 intro, 1 theme, 2 theme high + full rhythm, 3 break
  const notes = chord(song.scale, song.prog[ci]);
  const game = song.mood === 'game';
  const k = game ? intensity : 0;
  if (pos === 0) {
    const len = chordLen * eighth;
    const voiced = ci % 2 ? notes : notes.slice(0, 3);
    for (const n of voiced) pad(c, l.out, song.root + 12 + n, t, len, 0.02, song.bright);
    if (!game || section === 3) pad(c, l.out, song.root + 36 + notes[2], t, len, 0.007, song.bright * 1.6);
    if (song.bass === 'drone' || section === 3) bass(c, l.out, song.root + notes[0] - (notes[0] >= 7 ? 12 : 0), t, len);
  }
  const bassNote = song.root + notes[0] - (notes[0] >= 7 ? 12 : 0);
  if (section !== 3 && section !== 0) {
    if (song.bass === 'pulse' && pos % 2 === 0) pulse(c, l.out, bassNote + (pos % 4 === 2 ? 12 : 0), t, eighth * 1.6, 0.07);
    if (song.bass === 'walk' && pos % 2 === 0) pulse(c, l.out, bassNote + [0, 7, 12, 7][(pos / 2) % 4], t, eighth * 1.9, 0.07);
  } else if (section === 0 && song.bass !== 'drone' && pos === 0) bass(c, l.out, bassNote, t, chordLen * eighth);
  // the melody: from the second section on, one two-bar phrase over the first chords of each round
  if (section === 1 || section === 2) {
    const m = l.melody[s % 16];
    const inPhrase = Math.floor((s % phraseLen) / 16) % 2 === 0; // answer every other two bars with silence
    if (m !== null && inPhrase) lead(c, l, song.lead, song.root + 24 + (section === 2 ? 12 : 0) + degree(song.scale, m), t, eighth);
  }
  // sparkle: sparse random bells, mostly chord tones
  if (Math.random() < song.sparkle * (pos % 2 ? 0.5 : 1)) {
    const pool = Math.random() < 0.7 ? notes : song.scale;
    bell(c, l, song.root + 36 + pool[Math.floor(Math.random() * pool.length)] + (Math.random() < 0.25 ? 12 : 0), t, 0.02);
  }
  if (!game || section === 3) return;
  // arpeggio: fades in with the first working machines
  if (song.arp && k > 0.04) {
    const n = notes[song.arp[s % song.arp.length]] + 24;
    if (pos % 2 === 0 || k > 0.3) pluck(c, l, song.root + n, t, 0.014 + 0.028 * k, song.bright);
  }
  // rhythm: grows with the factory, full in the high theme
  const drive = Math.min(1, k * 1.6 + (section === 2 ? 0.25 : 0));
  if (song.drums === 'none' || drive < 0.3) return;
  const v = Math.min(1, (drive - 0.3) * 2);
  const beat = pos % 8;
  if (song.drums === 'soft') {
    if (beat === 0 || beat === 4) thump(c, l.out, t, 0.11 * v);
    if (beat % 2 === 1 && v > 0.4) hat(c, l.out, t, 0.016 * v);
  } else if (song.drums === 'steady') {
    if (beat % 2 === 0) thump(c, l.out, t, (beat === 0 ? 0.13 : 0.09) * v);
    if (beat === 2 || beat === 6) snare(c, l.out, t, 0.05 * v);
    hat(c, l.out, t, (beat % 2 ? 0.018 : 0.01) * v);
  } else {
    // tribal: low toms on a syncopated figure, a shaker in between
    if (beat === 0 || beat === 3 || beat === 6) tom(c, l.out, beat === 0 ? 70 : 95, t, 0.12 * v);
    if (beat === 5 && v > 0.5) tom(c, l.out, 130, t, 0.07 * v);
    if (beat % 2 === 1) hat(c, l.out, t, 0.012 * v);
  }
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

/** A short bass note: sine with a little triangle bite. */
function pulse(c: AudioContext, dest: AudioNode, midi: number, t: number, len: number, vol: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 420;
  f.connect(g).connect(dest);
  for (const [type, amp] of [['sine', 1], ['triangle', 0.5]] as [OscillatorType, number][]) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi);
    const og = c.createGain();
    og.gain.value = amp;
    o.connect(og).connect(f);
    o.start(t);
    o.stop(t + len + 0.05);
  }
}

function lead(c: AudioContext, l: Layer, kind: Lead, midi: number, t: number, eighth: number) {
  if (kind === 'bell') return bell(c, l, midi, t, 0.03);
  if (kind === 'pluck') return pluck(c, l, midi, t, 0.035, l.song.bright * 1.2);
  if (kind === 'glass') return glass(c, l, midi, t);
  return flute(c, l, midi, t, eighth * 1.8);
}

function bell(c: AudioContext, l: Layer, midi: number, t: number, vol: number) {
  const f0 = hz(midi);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  g.connect(l.out);
  g.connect(l.delayIn);
  // a sine with slightly inharmonic overtones that die sooner: glassy, not a beep
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

/** Glass: two soft sines a twelfth apart, a slow attack and a long ring. */
function glass(c: AudioContext, l: Layer, midi: number, t: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.028, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  g.connect(l.out);
  const s = c.createGain();
  s.gain.value = 0.6;
  g.connect(s).connect(l.delayIn);
  for (const [mul, amp, det] of [[1, 1, -4], [3, 0.25, 5], [1, 0.6, 6]] as [number, number, number][]) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz(midi) * mul;
    o.detune.value = det;
    const og = c.createGain();
    og.gain.value = amp;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 2.3);
  }
}

/** Flute: a breathy triangle with vibrato and a soft onset. */
function flute(c: AudioContext, l: Layer, midi: number, t: number, len: number) {
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.value = hz(midi);
  const vib = c.createOscillator();
  vib.frequency.value = 5.2;
  const vd = c.createGain();
  vd.gain.setValueAtTime(0, t);
  vd.gain.linearRampToValueAtTime(hz(midi) * 0.006, t + len * 0.6);
  vib.connect(vd).connect(o.frequency);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2400;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.032, t + 0.08);
  g.gain.setValueAtTime(0.03, t + len * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
  o.connect(f).connect(g);
  g.connect(l.out);
  const s = c.createGain();
  s.gain.value = 0.4;
  g.connect(s).connect(l.delayIn);
  o.start(t);
  vib.start(t);
  o.stop(t + len + 0.3);
  vib.stop(t + len + 0.3);
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

/** A low tom: a sine that drops a little. */
function tom(c: AudioContext, dest: AudioNode, f: number, t: number, vol: number) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f * 1.5, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.5);
}

let noiseBuf: AudioBuffer | null = null;
function noiseSrc(c: AudioContext): AudioBufferSourceNode {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

function hat(c: AudioContext, dest: AudioNode, t: number, vol: number) {
  const src = noiseSrc(c);
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  src.connect(f).connect(g).connect(dest);
  src.start(t);
  src.stop(t + 0.08);
}

/** A soft, dark snare: band-passed noise with a short body. */
function snare(c: AudioContext, dest: AudioNode, t: number, vol: number) {
  const src = noiseSrc(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  f.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  src.connect(f).connect(g).connect(dest);
  src.start(t);
  src.stop(t + 0.2);
  const o = c.createOscillator();
  o.frequency.setValueAtTime(190, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  const og = c.createGain();
  og.gain.setValueAtTime(vol * 0.6, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  o.connect(og).connect(dest);
  o.start(t);
  o.stop(t + 0.12);
}
