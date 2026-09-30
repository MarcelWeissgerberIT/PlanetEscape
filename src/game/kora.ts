// KORA's voice: what she says is spoken with the system's speech synthesis (German or English, tuned lower and a
// little faster, like a technical AI), framed by a radio chirp. Without a usable voice, or when the player prefers
// it, she talks in radio chirps instead; or only the text shows. The music steps back while she talks.
import { getLang } from '../i18n';
import { setVoiceDuck } from './music';
import { radio, volume } from './sfx';

export type KoraVoice = 'speech' | 'radio' | 'text';
export type KoraChat = 'often' | 'rare' | 'off';

const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    if (v && allowed.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return fallback;
};
const write = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
};

let mode: KoraVoice = read('pe_kora_voice', ['speech', 'radio', 'text'] as const, 'speech');
let chat: KoraChat = read('pe_kora_chat', ['often', 'rare', 'off'] as const, 'often');

export const koraVoice = () => mode;
export function setKoraVoice(v: KoraVoice) {
  mode = v;
  write('pe_kora_voice', v);
  if (v !== 'speech') stopKora();
}
/** How chatty KORA is: remarks and problem hints (the story and tutorial always speak). */
export const koraChat = () => chat;
export function setKoraChat(c: KoraChat) {
  chat = c;
  write('pe_kora_chat', c);
}

const synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
let voices: SpeechSynthesisVoice[] = [];
const loadVoices = () => {
  voices = synth?.getVoices() ?? [];
};
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

/** The best voice for the language: natural / neural voices first, then any of the language. */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const mine = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  if (!mine.length) return null;
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/natural|neural|online|premium|enhanced/.test(n)) s += 8;
    if (/google/.test(n)) s += 5;
    if (/microsoft/.test(n)) s += 3;
    // a clear, calm voice suits a ship AI
    if (/anna|katja|helena|hedda|vicki|petra|samantha|zira|aria|jenny|libby|sonia|female|serena|karen|moira/.test(n)) s += 2;
    if (lang === 'en' && /en-gb/i.test(v.lang)) s += 1;
    if (v.localService) s += 1;
    return s;
  };
  return mine.sort((a, b) => score(b) - score(a))[0];
}

/** Can this device speak the current language? */
export function speechAvailable(): boolean {
  return !!synth && !!pickVoice(getLang());
}

let speaking = false;
const listeners: ((on: boolean) => void)[] = [];
/** Called with true while KORA talks (the avatar animates). */
export function onKoraSpeaking(cb: (on: boolean) => void) {
  listeners.push(cb);
}
function setSpeaking(on: boolean) {
  if (on === speaking) return;
  speaking = on;
  setVoiceDuck(on);
  for (const l of listeners) l(on);
}

/** Text for the ear: no emoji, markup, symbols or brackets; units spelled the way they are read. */
export function speakable(text: string): string {
  const de = getLang() === 'de';
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[•·›→←↑↓⊘✓✗☄⏱∅]/g, ' ')
    .replace(/(\d+)\s*×/g, de ? '$1 mal' : '$1 times')
    .replace(/×/g, de ? ' mal ' : ' by ')
    .replace(/(\d+)\s*%/g, de ? '$1 Prozent' : '$1 percent')
    .replace(/\bKORA\b/g, 'Kora')
    .replace(/\s+/g, ' ')
    .trim();
}

let timer = 0;

/** A clip with sound is playing or about to (story videos): KORA does not talk over it. */
function videoBusy(): boolean {
  return [...document.querySelectorAll('video')].some((v) => !v.muted && !v.ended && (!v.paused || !!v.closest('.story-video:not(.ended)')));
}

/** KORA says something. `urgent` cuts off what she is saying; otherwise a new line waits for the current one. */
export function koraSpeak(text: string, urgent = true) {
  // speech must never get in the way of the game
  try {
    say(text, urgent);
  } catch {
    setSpeaking(false);
  }
}

function say(text: string, urgent: boolean) {
  const line = speakable(text);
  if (!line || mode === 'text' || videoBusy()) return;
  if (speaking && !urgent) return;
  stopKora();
  const lang = getLang();
  const voice = mode === 'speech' ? pickVoice(lang) : null;
  radio.open();
  if (!voice || !synth) {
    // radio talk: chirps as long as the sentence
    setSpeaking(true);
    const secs = radio.babble(line);
    timer = window.setTimeout(() => {
      radio.close();
      setSpeaking(false);
    }, secs * 1000 + 100);
    return;
  }
  const u = new SpeechSynthesisUtterance(line);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 1.06;
  u.pitch = 0.82;
  u.volume = Math.max(0, Math.min(1, volume('voice')));
  u.onstart = () => setSpeaking(true);
  const end = () => {
    if (!speaking) return;
    radio.close();
    setSpeaking(false);
  };
  u.onend = end;
  u.onerror = end;
  setSpeaking(true);
  // after the radio chirp
  timer = window.setTimeout(() => {
    if (videoBusy()) return end();
    synth.speak(u);
  }, 220);
}

export function stopKora() {
  clearTimeout(timer);
  synth?.cancel();
  setSpeaking(false);
}

export function koraSpeaking() {
  return speaking;
}

// Safari and Chrome on phones only speak after a gesture started speech once: an empty line on the first tap
if (synth) {
  const unlock = () => {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    } catch {
      /* ignore */
    }
    window.removeEventListener('pointerdown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
}
