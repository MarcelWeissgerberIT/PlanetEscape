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

export const sfx = {
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
  launch: () => {
    tone(90, 2.5, 'sawtooth', 0.1, 400);
    setTimeout(() => tone(523, 0.3, 'triangle', 0.08), 600);
    setTimeout(() => tone(784, 0.3, 'triangle', 0.08), 900);
    setTimeout(() => tone(1046, 0.8, 'triangle', 0.08), 1200);
  },
};
