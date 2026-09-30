// Generative music, played live through WebAudio (no audio files). A small album of songs that each sound like
// themselves: own key, mode, tempo and chord progression, a recognisable melody (derived from the song's id, so it
// is the same every time), and own instruments: pad (warm saw, strings, organ, choir, electric piano or none),
// bass (sub, octave, walking, acid), lead (bell, glass, flute, whistle, chip square, gliding saw) and drums (soft,
// steady, techno, lo-fi, tribal or none), with its own amount of hall. Songs play in shuffle and crossfade after a
// few minutes; the menu has its own, the game prefers the songs that suit the planet, and in the game the rhythm
// grows with the factory. A song runs in sections: intro, theme, theme an octave up, and a break.
import { getLang } from '../i18n';
import { audio } from './sfx';

export type Mood = 'menu' | 'game';
type Biome = 'basalt' | 'rust' | 'ice' | 'moss' | 'volcanic';
type Pad = 'saw' | 'strings' | 'organ' | 'choir' | 'epiano' | 'none';
type Bass = 'sub' | 'octave' | 'walk' | 'acid';
type Lead = 'bell' | 'glass' | 'flute' | 'whistle' | 'chip' | 'glide';
type Drums = 'none' | 'soft' | 'steady' | 'techno' | 'lofi' | 'tribal';

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
  swing: number; // 0 straight .. 0.33 heavy swing on the off sixteenths
  pad: Pad;
  bright: number; // pad / filter opening in Hz
  bass: Bass;
  lead: Lead;
  drums: Drums;
  arp: number[] | null; // chord tone pattern
  arpRate: 8 | 16; // arpeggio in eighths or sixteenths
  hall: number; // share of the song in the hall
  sparkle: number; // chance of a random bell per eighth
}

const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];
const PENTA = [0, 3, 5, 7, 10];

export const SONGS: Song[] = [
  // menu: an ambient wreck, an electric piano ballad, a choir drone
  { id: 'crash', name: { de: 'Absturzstelle', en: 'Crash Site' }, mood: 'menu', root: 38, scale: AEOLIAN, prog: [0, 5, 2, 6], bars: 2, bpm: 58, swing: 0, pad: 'saw', bright: 1500, bass: 'sub', lead: 'bell', drums: 'none', arp: null, arpRate: 8, hall: 0.8, sparkle: 0.08 },
  { id: 'orbit', name: { de: 'Kalter Orbit', en: 'Cold Orbit' }, mood: 'menu', root: 41, scale: LYDIAN, prog: [0, 1, 5, 4], bars: 1, bpm: 76, swing: 0.12, pad: 'epiano', bright: 2200, bass: 'octave', lead: 'glass', drums: 'lofi', arp: null, arpRate: 8, hall: 0.55, sparkle: 0.04 },
  { id: 'signal', name: { de: 'Letztes Signal', en: 'Last Signal' }, mood: 'menu', root: 36, scale: DORIAN, prog: [0, 3, 6, 4], bars: 2, bpm: 50, swing: 0, pad: 'choir', bright: 1200, bass: 'sub', lead: 'whistle', drums: 'none', arp: null, arpRate: 8, hall: 0.9, sparkle: 0.03 },
  // game
  { id: 'melt', name: { de: 'Erste Schmelze', en: 'First Melt' }, mood: 'game', biomes: ['basalt', 'volcanic'], root: 45, scale: AEOLIAN, prog: [0, 3, 5, 4], bars: 1, bpm: 96, swing: 0, pad: 'strings', bright: 1400, bass: 'octave', lead: 'bell', drums: 'steady', arp: [0, 1, 2, 3, 2, 1, 2, 0], arpRate: 8, hall: 0.45, sparkle: 0.03 },
  { id: 'rust', name: { de: 'Rostiger Horizont', en: 'Rusty Horizon' }, mood: 'game', biomes: ['rust'], root: 40, scale: PHRYGIAN, prog: [0, 1, 0, 6], bars: 2, bpm: 84, swing: 0.08, pad: 'organ', bright: 900, bass: 'walk', lead: 'glide', drums: 'tribal', arp: [0, 2, 1, 2], arpRate: 16, hall: 0.5, sparkle: 0 },
  { id: 'ice', name: { de: 'Eisfelder', en: 'Ice Fields' }, mood: 'game', biomes: ['ice'], root: 43, scale: LYDIAN, prog: [0, 1, 4, 5], bars: 2, bpm: 70, swing: 0, pad: 'choir', bright: 2200, bass: 'sub', lead: 'glass', drums: 'soft', arp: [0, 2, 3, 1, 2, 3, 0, 2], arpRate: 16, hall: 0.8, sparkle: 0.08 },
  { id: 'moss', name: { de: 'Moosgarten', en: 'Moss Garden' }, mood: 'game', biomes: ['moss'], root: 36, scale: DORIAN, prog: [0, 3, 0, 6], bars: 1, bpm: 104, swing: 0.25, pad: 'organ', bright: 1600, bass: 'walk', lead: 'flute', drums: 'lofi', arp: null, arpRate: 8, hall: 0.4, sparkle: 0.04 },
  { id: 'ember', name: { de: 'Glutkammer', en: 'Ember Chamber' }, mood: 'game', biomes: ['volcanic'], root: 37, scale: HARMONIC, prog: [0, 5, 3, 4], bars: 2, bpm: 66, swing: 0, pad: 'saw', bright: 700, bass: 'acid', lead: 'chip', drums: 'tribal', arp: [0, 3, 2, 3], arpRate: 8, hall: 0.55, sparkle: 0 },
  { id: 'line', name: { de: 'Fließband', en: 'Assembly Line' }, mood: 'game', biomes: ['basalt', 'moss'], root: 43, scale: MIXO, prog: [0, 6, 3, 0], bars: 1, bpm: 124, swing: 0, pad: 'none', bright: 1800, bass: 'acid', lead: 'chip', drums: 'techno', arp: [0, 2, 1, 3, 0, 2, 1, 3], arpRate: 16, hall: 0.25, sparkle: 0 },
  { id: 'night', name: { de: 'Nachtschicht', en: 'Night Shift' }, mood: 'game', biomes: ['ice', 'rust'], root: 38, scale: PENTA, prog: [0, 3, 2, 3], bars: 1, bpm: 88, swing: 0.18, pad: 'epiano', bright: 1900, bass: 'octave', lead: 'glide', drums: 'lofi', arp: null, arpRate: 8, hall: 0.5, sparkle: 0.02 },
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
let step = 0; // sixteenths since the song began
let nextAt = 0;
let unlocked = false;
let ducked = 0;
let voiceDuck = false;
let lastGlide = 0;
const recent: string[] = [];
const songListeners: ((s: Song | null) => void)[] = [];

/** KORA is talking: the music steps back a little. */
export function setVoiceDuck(v: boolean) {
  voiceDuck = v;
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
  biome = id as Biome; // the next song fits the new planet (the current one plays to its end)
}

/** Working machines -> how much rhythm the game music carries. */
export function setMusicActivity(working: number) {
  target = Math.min(1, working / 24);
}

/** The song playing now (null: none). */
export function currentSong(): { id: string; name: string } | null {
  if (!layer) return null;
  return { id: layer.song.id, name: layer.song.name[getLang() === 'de' ? 'de' : 'en'] };
}

/** Skip to the next song in the shuffle. */
export function nextSong() {
  if (layer) apply(true);
}

export function onSongChange(cb: (s: { id: string; name: string } | null) => void) {
  songListeners.push(() => cb(currentSong()));
}

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

/** A song's melody: two bars of eighths from its id (a small seeded random walk over the scale, with rests). */
function melodyOf(song: Song): (number | null)[] {
  let seed = 7;
  for (const ch of song.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out: (number | null)[] = [];
  let deg = [0, 2, 4][Math.floor(rnd() * 3)];
  const busy = song.bpm > 95 ? 0.35 : 0.55; // fast songs rest more
  for (let i = 0; i < 16; i++) {
    const rest = i % 2 ? rnd() < busy : rnd() < 0.15;
    if (i === 14) deg = rnd() < 0.5 ? 0 : 4;
    if (rest && i !== 14) {
      out.push(null);
      continue;
    }
    out.push(deg);
    deg = Math.max(-2, Math.min(9, deg + [-2, -1, -1, 1, 1, 2, 3, 0][Math.floor(rnd() * 8)]));
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
  out.gain.exponentialRampToValueAtTime(1, c.currentTime + 3);
  out.connect(bus('music'));
  const send = c.createGain();
  send.gain.value = song.hall;
  out.connect(send).connect(verb('music'));
  // a dotted-eighth echo, darker with every repeat
  const delayIn = c.createGain();
  const dl = c.createDelay(2);
  dl.delayTime.value = (60 / song.bpm) * 0.75;
  const fb = c.createGain();
  fb.gain.value = 0.3 + song.hall * 0.15;
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
  l.out.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
  setTimeout(() => l.out.disconnect(), 10000);
}

/** Schedule every sixteenth that starts within the next second; after its time the song hands over. */
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
  const six = 60 / layer.song.bpm / 4;
  while (nextAt < c.currentTime + 1) {
    intensity += (target - intensity) * 0.01;
    // swing: the off sixteenths come a little late
    const late = step % 2 ? layer.song.swing * six : 0;
    play(c, layer, step, nextAt + late, six);
    step++;
    nextAt += six;
  }
}

/** Semitones of a scale degree (negative and beyond an octave allowed). */
function degree(sc: number[], d: number): number {
  const n = sc.length;
  return sc[((d % n) + n) % n] + 12 * Math.floor(d / n);
}
/** The chord on a scale degree: root, third, fifth, seventh. */
function chord(sc: number[], deg: number): number[] {
  return [0, 2, 4, 6].map((k) => degree(sc, deg + k));
}

function play(c: AudioContext, l: Layer, s: number, t: number, six: number) {
  const song = l.song;
  const chordLen = 16 * song.bars; // sixteenths per chord
  const phraseLen = chordLen * song.prog.length;
  const pos = s % chordLen;
  const ci = Math.floor(s / chordLen) % song.prog.length;
  const section = Math.floor(s / phraseLen) % 4; // 0 intro, 1 theme, 2 theme high + full rhythm, 3 break
  const notes = chord(song.scale, song.prog[ci]);
  const game = song.mood === 'game';
  const out = l.out;
  const len = chordLen * six;
  const bassNote = song.root + notes[0] - (notes[0] >= 7 ? 12 : 0);
  const eighth = s % 2 === 0;
  const beat16 = s % 16; // position in the bar

  // ---- pad ----
  if (pos === 0 && song.pad !== 'none') {
    const voiced = (ci % 2 ? notes : notes.slice(0, 3)).map((n) => song.root + 12 + n);
    padChord(c, out, song.pad, voiced, t, len, song.bright);
  }
  if (song.pad === 'epiano' && pos === 8 && section !== 0) {
    // the electric piano strikes again on the third beat
    padChord(c, out, 'epiano', notes.slice(0, 3).map((n) => song.root + 12 + n), t, len / 2, song.bright);
  }
  if (section === 3 && pos === 0) padChord(c, out, 'saw', [song.root + 36 + notes[2]], t, len, song.bright * 1.4, 0.4);

  // ---- bass ----
  if (song.bass === 'sub' || section === 0 || section === 3) {
    if (pos === 0) subBass(c, out, bassNote, t, len);
  } else if (song.bass === 'octave') {
    if (eighth) pluckBass(c, out, bassNote + ((s / 2) % 2 ? 12 : 0), t, six * 1.8);
  } else if (song.bass === 'walk') {
    if (s % 4 === 0) pluckBass(c, out, bassNote + [0, 7, 12, 10][(s / 4) % 4], t, six * 3.6);
  } else if (song.bass === 'acid') {
    const pat = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1];
    if (pat[beat16]) acid(c, out, bassNote + (beat16 === 6 || beat16 === 14 ? 12 : 0), t, six * 0.9, beat16 % 4 === 0);
  }

  // ---- melody: from the second section on, a two-bar phrase answered by two bars of rest ----
  if ((section === 1 || section === 2) && eighth) {
    const i = (s / 2) % 16;
    const m = l.melody[i];
    const inPhrase = Math.floor((s % phraseLen) / 32) % 2 === 0;
    if (m !== null && inPhrase) lead(c, l, song.lead, song.root + 24 + (section === 2 ? 12 : 0) + degree(song.scale, m), t, six * 2);
  }

  // ---- sparkle ----
  if (eighth && Math.random() < song.sparkle) {
    const pool = Math.random() < 0.7 ? notes : song.scale;
    bell(c, l, song.root + 36 + pool[Math.floor(Math.random() * pool.length)] + (Math.random() < 0.25 ? 12 : 0), t, 0.018);
  }
  if (section === 0 && s < phraseLen && !game) return;

  // ---- arpeggio: always a little, more with the factory ----
  const k = game ? Math.max(0.35, intensity) : 0.5;
  if (song.arp && section !== 3 && (song.arpRate === 16 || eighth)) {
    const idx = song.arpRate === 16 ? s : s / 2;
    if (k > 0.5 || song.arpRate === 8 || s % 2 === 0) pluck(c, l, song.root + 24 + notes[song.arp[idx % song.arp.length]], t, 0.012 + 0.02 * k, song.bright);
  }

  // ---- drums ----
  if (song.drums === 'none' || section === 3 || (section === 0 && s < chordLen * 2)) return;
  const v = Math.min(1, (game ? 0.55 + 0.45 * intensity : 0.55) + (section === 2 ? 0.15 : 0));
  switch (song.drums) {
    case 'soft':
      if (beat16 === 0 || beat16 === 10) kick(c, out, t, 0.12 * v);
      if (beat16 === 8) snare(c, out, t, 0.03 * v, 2600);
      if (beat16 % 4 === 2) hat(c, out, t, 0.012 * v);
      break;
    case 'steady':
      if (beat16 % 4 === 0) kick(c, out, t, (beat16 === 0 ? 0.14 : 0.1) * v);
      if (beat16 === 4 || beat16 === 12) snare(c, out, t, 0.055 * v);
      if (eighth) hat(c, out, t, (beat16 % 4 === 2 ? 0.02 : 0.011) * v);
      break;
    case 'techno':
      if (beat16 % 4 === 0) kick(c, out, t, 0.17 * v, 1.2);
      if (beat16 === 4 || beat16 === 12) clap(c, out, t, 0.06 * v);
      if (beat16 % 4 === 2) hat(c, out, t, 0.03 * v, 0.09);
      else if (!eighth) hat(c, out, t, 0.008 * v);
      break;
    case 'lofi':
      if (beat16 === 0 || beat16 === 7) kick(c, out, t, 0.12 * v, 0.8);
      if (beat16 === 8) snare(c, out, t, 0.05 * v, 1500);
      if (eighth) hat(c, out, t, (beat16 % 4 === 2 ? 0.014 : 0.008) * v);
      break;
    case 'tribal':
      if (beat16 === 0 || beat16 === 6 || beat16 === 12) tom(c, out, beat16 === 0 ? 65 : 90, t, 0.13 * v);
      if (beat16 === 10 || beat16 === 14) tom(c, out, 130, t, 0.07 * v);
      if (beat16 % 4 === 2) shaker(c, out, t, 0.02 * v);
      break;
  }
}

// ---------- instruments ----------

function env(c: AudioContext, dest: AudioNode, t: number, vol: number, attack: number, hold: number, release: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  if (hold > attack) g.gain.setValueAtTime(vol, t + hold);
  g.gain.linearRampToValueAtTime(0, t + Math.max(hold, attack) + release);
  g.connect(dest);
  return g;
}

function osc(c: AudioContext, type: OscillatorType, freq: number, dest: AudioNode, t: number, stop: number, detune = 0, amp = 1) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  if (amp !== 1) {
    const a = c.createGain();
    a.gain.value = amp;
    o.connect(a).connect(dest);
  } else o.connect(dest);
  o.start(t);
  o.stop(stop);
  return o;
}

/** One chord on the song's pad. */
function padChord(c: AudioContext, dest: AudioNode, kind: Pad, midis: number[], t: number, len: number, bright: number, level = 1) {
  const rel = kind === 'epiano' ? 1.6 : 3;
  for (const m of midis) {
    const f = hz(m);
    if (kind === 'saw') {
      const g = env(c, dest, t, 0.018 * level, Math.min(3, len * 0.4), len, rel);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.8;
      lp.frequency.setValueAtTime(bright * 0.45, t);
      lp.frequency.linearRampToValueAtTime(bright, t + len * 0.5);
      lp.frequency.linearRampToValueAtTime(bright * 0.6, t + len + rel);
      lp.connect(g);
      for (const d of [-9, 8]) osc(c, 'sawtooth', f, lp, t, t + len + rel + 0.1, d);
    } else if (kind === 'strings') {
      // two detuned squares through a soft filter with a slow swell: a string section
      const g = env(c, dest, t, 0.014 * level, 0.6, len, rel);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = bright;
      lp.connect(g);
      for (const d of [-12, 11]) osc(c, 'square', f, lp, t, t + len + rel + 0.1, d, 0.6);
      osc(c, 'sawtooth', f * 2, lp, t, t + len + rel + 0.1, 3, 0.3);
    } else if (kind === 'organ') {
      // drawbars: fundamental, octave, twelfth, two octaves; a quick attack, a slow tremolo
      const g = env(c, dest, t, 0.016 * level, 0.03, len, 0.4);
      const trem = c.createGain();
      trem.gain.value = 1;
      const lfo = c.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = c.createGain();
      depth.gain.value = 0.18;
      lfo.connect(depth).connect(trem.gain);
      lfo.start(t);
      lfo.stop(t + len + 0.5);
      trem.connect(g);
      for (const [mul, amp] of [[1, 1], [2, 0.7], [3, 0.35], [4, 0.25]] as [number, number][]) osc(c, 'sine', f * mul, trem, t, t + len + 0.5, 0, amp);
    } else if (kind === 'choir') {
      // a saw through two vowel formants ('ah'), slow in, with a gentle vibrato
      const g = env(c, dest, t, 0.03 * level, Math.min(2.5, len * 0.4), len, rel);
      const mix = c.createGain();
      mix.gain.value = 1;
      for (const [fq, q, amp] of [[800, 6, 1], [1150, 7, 0.6], [2900, 9, 0.2]] as [number, number, number][]) {
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = fq;
        bp.Q.value = q;
        const a = c.createGain();
        a.gain.value = amp;
        mix.connect(bp).connect(a).connect(g);
      }
      for (const d of [-7, 6]) {
        const o = osc(c, 'sawtooth', f, mix, t, t + len + rel + 0.1, d);
        const vib = c.createOscillator();
        vib.frequency.value = 4.6 + Math.random();
        const vd = c.createGain();
        vd.gain.value = 5;
        vib.connect(vd).connect(o.detune);
        vib.start(t);
        vib.stop(t + len + rel + 0.1);
      }
    } else if (kind === 'epiano') {
      // FM electric piano: a sine modulated by a sine at 14x that fades fast (the tine), struck, not held
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03 * level, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.008 * level, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(len, 2.4) + 0.4);
      g.connect(dest);
      const car = osc(c, 'sine', f, g, t, t + 3.2);
      const mod = c.createOscillator();
      mod.frequency.value = f * 14;
      const mg = c.createGain();
      mg.gain.setValueAtTime(f * 1.2, t);
      mg.gain.exponentialRampToValueAtTime(1, t + 0.4);
      mod.connect(mg).connect(car.frequency);
      mod.start(t);
      mod.stop(t + 3.2);
      osc(c, 'sine', f * 2, g, t, t + 3.2, 4, 0.25);
    }
  }
}

function subBass(c: AudioContext, dest: AudioNode, midi: number, t: number, len: number) {
  const g = env(c, dest, t, 0.09, Math.min(1.2, len * 0.3), len - 0.3, 1.2);
  osc(c, 'sine', hz(midi), g, t, t + len + 1.3);
}

/** A short round bass note: sine with a little triangle bite. */
function pluckBass(c: AudioContext, dest: AudioNode, midi: number, t: number, len: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.08, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 480;
  lp.connect(g).connect(dest);
  osc(c, 'sine', hz(midi), lp, t, t + len + 0.05);
  osc(c, 'triangle', hz(midi), lp, t, t + len + 0.05, 0, 0.5);
}

/** Acid bass: a saw through a resonant low-pass that snaps open (wider on accents). */
function acid(c: AudioContext, dest: AudioNode, midi: number, t: number, len: number, accent: boolean) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(accent ? 0.06 : 0.045, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 12;
  lp.frequency.setValueAtTime(accent ? 2400 : 1300, t);
  lp.frequency.exponentialRampToValueAtTime(180, t + len);
  lp.connect(g).connect(dest);
  osc(c, 'sawtooth', hz(midi), lp, t, t + len + 0.08);
}

function lead(c: AudioContext, l: Layer, kind: Lead, midi: number, t: number, eighth: number) {
  if (kind === 'bell') return bell(c, l, midi, t, 0.04);
  if (kind === 'glass') return glass(c, l, midi, t);
  if (kind === 'flute') return flute(c, l, midi, t, eighth * 1.8, 'triangle', 0.045);
  if (kind === 'whistle') return flute(c, l, midi + 12, t, eighth * 2.4, 'sine', 0.03);
  if (kind === 'chip') return chip(c, l, midi, t, eighth * 0.9);
  return glide(c, l, midi, t, eighth * 1.9);
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
    const og = c.createGain();
    og.gain.setValueAtTime(amp, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    og.connect(g);
    osc(c, 'sine', f0 * mul, og, t, t + dec + 0.05);
  }
}

/** Glass: soft sines a twelfth apart, a slow attack and a long ring. */
function glass(c: AudioContext, l: Layer, midi: number, t: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.036, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  g.connect(l.out);
  const s = c.createGain();
  s.gain.value = 0.6;
  g.connect(s).connect(l.delayIn);
  for (const [mul, amp, det] of [[1, 1, -4], [3, 0.25, 5], [1, 0.6, 6]] as [number, number, number][]) osc(c, 'sine', hz(midi) * mul, g, t, t + 2.3, det, amp);
}

/** Flute / whistle: a breathy tone with vibrato and a soft onset. */
function flute(c: AudioContext, l: Layer, midi: number, t: number, len: number, type: OscillatorType, vol: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.07);
  g.gain.setValueAtTime(vol * 0.9, t + len * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
  g.connect(l.out);
  const s = c.createGain();
  s.gain.value = 0.4;
  g.connect(s).connect(l.delayIn);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  lp.connect(g);
  const o = osc(c, type, hz(midi), lp, t, t + len + 0.3);
  const vib = c.createOscillator();
  vib.frequency.value = 5.2;
  const vd = c.createGain();
  vd.gain.setValueAtTime(0, t);
  vd.gain.linearRampToValueAtTime(hz(midi) * 0.007, t + len * 0.6);
  vib.connect(vd).connect(o.frequency);
  vib.start(t);
  vib.stop(t + len + 0.3);
}

/** Chip lead: a thin square with a quick octave blip at the start, like an old game console. */
function chip(c: AudioContext, l: Layer, midi: number, t: number, len: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.028, t);
  g.gain.setValueAtTime(0.022, t + len * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
  g.connect(l.out);
  const s = c.createGain();
  s.gain.value = 0.35;
  g.connect(s).connect(l.delayIn);
  const o = osc(c, 'square', hz(midi + 12), g, t, t + len + 0.08);
  o.frequency.setValueAtTime(hz(midi), t + 0.03);
}

/** Gliding saw lead: slides from the previous note, filtered, with vibrato. */
function glide(c: AudioContext, l: Layer, midi: number, t: number, len: number) {
  const f = hz(midi);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.026, t + 0.03);
  g.gain.setValueAtTime(0.024, t + len * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.2);
  g.connect(l.out);
  const s = c.createGain();
  s.gain.value = 0.45;
  g.connect(s).connect(l.delayIn);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;
  lp.Q.value = 2;
  lp.connect(g);
  for (const d of [-6, 6]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = d;
    o.frequency.setValueAtTime(lastGlide || f, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    o.connect(lp);
    o.start(t);
    o.stop(t + len + 0.25);
  }
  lastGlide = f;
}

function pluck(c: AudioContext, l: Layer, midi: number, t: number, vol: number, bright: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  g.connect(l.out);
  const s = c.createGain();
  s.gain.value = 0.5;
  g.connect(s).connect(l.delayIn);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 3;
  lp.frequency.setValueAtTime(bright * 2, t);
  lp.frequency.exponentialRampToValueAtTime(220, t + 0.25);
  lp.connect(g);
  osc(c, 'square', hz(midi), lp, t, t + 0.4);
}

// ---------- drums ----------

function kick(c: AudioContext, dest: AudioNode, t: number, vol: number, punch = 1) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(110 * punch, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.4);
}

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
function noise(c: AudioContext, dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, vol: number) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.2);
  src.stop(t + dur + 0.02);
}

function hat(c: AudioContext, dest: AudioNode, t: number, vol: number, dur = 0.05) {
  noise(c, dest, t, dur, 'highpass', 7500, 0.7, vol);
}

function shaker(c: AudioContext, dest: AudioNode, t: number, vol: number) {
  noise(c, dest, t, 0.09, 'bandpass', 5200, 1.2, vol);
}

function snare(c: AudioContext, dest: AudioNode, t: number, vol: number, tone = 1800) {
  noise(c, dest, t, 0.18, 'bandpass', tone, 0.8, vol);
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

/** A clap: three quick noise bursts and a tail. */
function clap(c: AudioContext, dest: AudioNode, t: number, vol: number) {
  for (const d of [0, 0.011, 0.023]) noise(c, dest, t + d, 0.03, 'bandpass', 1400, 1.5, vol);
  noise(c, dest, t + 0.03, 0.16, 'bandpass', 1200, 1, vol * 0.6);
}
