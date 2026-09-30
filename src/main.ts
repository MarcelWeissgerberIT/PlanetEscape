import { DEMO_CHALLENGES, DEMO_CHAPTERS, EDITION, IS_DESKTOP } from './game/desktop';
import { kv } from './game/storage';
import { introWanted, playIntro } from './ui/intro';
import { installFrame } from './ui/fullscreen';
import { syncAchievementsToSteam } from './game/achievements';
import './style.css';
import { assetVersion, preloadAll } from './game/assets';
import { BUILD_ORDER, ITEM_ORDER } from './game/data';
import { EXAMPLES } from './game/examples';
import { startVideo, stopVideo, tickVideo, videoHasAudio, videoLive } from './game/video';
import { Input } from './game/input';
import { Renderer } from './game/render';
import * as Save from './game/save';
import { setActivity, setBiome, sfx } from './game/sfx';
import { setMusicActivity, setMusicBiome } from './game/music';
import { biomeIdFor } from './game/scenery';
import { wireUiSounds } from './ui/uiSound';
import { Sim } from './game/sim';
import type { Blueprint, GameState, TerrainId } from './game/types';
import { challengeState, chapterState, levelState, newGame } from './game/world';
import { setLastChapter } from './game/progress';
import { t } from './i18n';
import { Hud } from './ui/hud';

const canvas = document.getElementById('game') as HTMLCanvasElement;

let sim = new Sim(Save.load() ?? newGame());
let renderer = new Renderer(canvas, sim);
let playing = false;
let launchShown = false;
let lastRepairSfx = 0;

const cbs = {
  onPlace: (type: Parameters<Sim['place']>[0], x: number, y: number, dir: Parameters<Sim['place']>[3]) => {
    const b = sim.place(type, x, y, dir);
    if (!b) return false;
    hud.recordPlacement(b);
    if (type === 'conveyor') sfx.belt();
    else sfx.place();
    if (type === 'assembler' || type === 'refinery') hud.selectBuilding(b);
    return true;
  },
  onRemove: (b: Parameters<Sim['remove']>[0]) => {
    sim.remove(b);
    sfx.remove();
    if (hud.selected === b) hud.selectBuilding(null);
  },
  onSelect: (b: Parameters<Sim['remove']>[0] | null) => {
    hud.selectBuilding(b);
    if (b) sfx.select();
  },
  onPlacementError: (reason: string) => {
    sfx.error();
    hud.toast(t(reason as 'err_cost'), 1800, 'error');
    hud.placementError();
  },
  onToolChange: (tool: Input['tool']) => hud.setTool(tool),
  onRotate: (b: Parameters<Sim['remove']>[0]) => {
    sfx.select();
    hud.selectBuilding(b);
    hud.flashOutput(b);
  },
  onRotateKey: () => hud.rotateSelected(),
  onSelectTile: (x: number, y: number) => hud.selectTile(x, y),
  onUndo: () => hud.undo(),
  onAreaSelected: (x0: number, y0: number, x1: number, y1: number) => hud.areaSelected(x0, y0, x1, y1),
  onPaste: (bp: Blueprint, x: number, y: number) => hud.pasteBlueprint(bp, x, y),
  onTogglePause: () => hud.togglePause(),
  onCycleSpeed: () => hud.cycleSpeed(),
  onBeltLine: (n: number) => hud.beltLineLaid(n),
  onBeltTapHint: () => hud.toast(t('belt_tap_hint'), 2600),
  onPaint: (x: number, y: number) => hud.paintAt(x, y),
};

let input = new Input(canvas, sim, renderer, cbs);
let speed = 1;

const hud = new Hud(sim, input, renderer, {
  onNewGame: (seed, options) => {
    Save.clear();
    swapState(newGame(seed, options));
    Save.save(sim.state);
    start();
  },
  onContinue: () => start(),
  onNextLevel: () => {
    const next = levelState(sim.state, sim.state.missionIndex, sim.state.options);
    swapState(next);
    Save.save(sim.state);
    start();
    hud.chapterStart();
  },
  onSave: () => Save.save(sim.state),
  onCenter: () => renderer.centerOnCore(),
  onSpeed: (sp: number) => {
    speed = sp;
    renderer.paused = sp === 0;
  },
  getSpeed: () => speed,
  onImport: (state: GameState) => {
    swapState(state);
    Save.save(sim.state);
    start();
  },
  onNewEditor: (w: number, h: number, random: boolean, seed?: number) => {
    Save.clear();
    swapState(newGame(seed ?? Math.floor(Math.random() * 1e9), { mode: 'playground', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false }, { w, h, blank: !random }));
    Save.save(sim.state);
    start();
    hud.setEditor(true);
  },
  onVideo: async (b, kind, file) => {
    try {
      await startVideo(b.id, kind, file);
      return null;
    } catch (e) {
      const name = (e as Error)?.name ?? '';
      return name === 'NotAllowedError' ? t('vid_denied') : name === 'NotFoundError' || (e as Error)?.message === 'unsupported' ? t('vid_unsupported') : String((e as Error)?.message ?? e);
    }
  },
  onVideoStop: (b) => stopVideo(b.id),
  videoLive: (b) => videoLive(b.id),
  videoHasAudio: (b) => videoHasAudio(b.id),
  onLoadExample: async (id: string): Promise<void> => {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    let st: GameState | null = null;
    if (ex.file) {
      // ready-made map (megafactories): a few hundred KB, fetched when chosen
      hud.toast(`⏳ ${t('loading')}`, 1500);
      try {
        st = Save.migrate(await (await fetch(`${import.meta.env.BASE_URL}${ex.file}${assetVersion()}`)).json());
      } catch {
        st = null;
      }
      if (!st) {
        hud.toast(t('import_failed'), 3000, 'error');
        return;
      }
    } else st = ex.build!();
    Save.clear();
    swapState(st);
    Save.save(sim.state);
    start();
    if (sim.state.note) setTimeout(() => hud.showNote(), 400);
  },
  onPlayChallenge: (id: string) => {
    if (EDITION === 'demo' && !DEMO_CHALLENGES.includes(id)) return hud.showDemoEnd();
    Save.clear();
    swapState(challengeState(id));
    Save.save(sim.state);
    start();
    hud.challengeStart();
  },
  onPlayChapter: (chapter: number) => {
    if (EDITION === 'demo' && chapter > DEMO_CHAPTERS) return hud.showDemoEnd();
    Save.clear();
    swapState(chapterState(chapter, { mode: 'story', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: true }));
    Save.save(sim.state);
    start();
    hud.chapterStart();
  },
});

// Debug / automation hook (used by the smoke test).
function exposeDebug() {
  (window as unknown as { __pe: unknown }).__pe = { get sim() { return sim; }, get renderer() { return renderer; }, get input() { return input; }, hud, start, swapState };
}

function swapState(state: GameState) {
  sim = new Sim(state);
  renderer = new Renderer(canvas, sim);
  renderer.resize();
  input = new Input(canvas, sim, renderer, cbs);
  hud.sim = sim;
  hud.input = input;
  hud.renderer = renderer;
  hud.selectBuilding(null);
  launchShown = false;
  renderer.centerOnCore();
  exposeDebug();
}

function start() {
  playing = true;
  const f = sim.state.focus;
  if (f) setTimeout(() => renderer.centerOn(f.x, f.y, f.zoom), 0);
  if (sim.state.options.mode === 'story' && !sim.state.launched) setLastChapter(sim.state.missionIndex + 1);
  hud.hideTitle();
  if (!sim.state.focus) renderer.centerOnCore();
  if (sim.state.launched) launchShown = true;
}

// ---------- Loop ----------

const STEP = 1 / 30;
let acc = 0;
let last = performance.now();
let saveTimer = 0;
let hudTimer = 0;

function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  // in the main menu the game stands still and is not drawn: the menu is all there is (and costs nothing)
  const inGame = playing && !hud.titleOpen;
  if (inGame) {
    acc += dt * speed;
    let guard = 0;
    while (acc >= STEP && guard++ < 12) {
      sim.tick(STEP);
      acc -= STEP;
    }
    if (speed === 0) acc = 0;
    for (const ev of sim.events) {
      switch (ev.type) {
        case 'mission': hud.missionComplete(ev.index); break;
        case 'flight': hud.flightDone(ev.n); break;
        case 'challenge_done': hud.challengeDone(ev.seconds); break;
        case 'launch':
          if (!launchShown) {
            launchShown = true;
            sfx.launch();
            hud.koraRemark('launch');
            setTimeout(() => hud.showLaunch(), 600);
          }
          break;
        case 'craft': renderer.fxCraft(ev.b); break;
        case 'delivered': renderer.fxDelivered(ev.item); break;
        case 'depleted': renderer.fxDepleted(ev.x, ev.y); hud.depleted(); break;
        case 'contract_offer': hud.contractOffer(ev.contract); break;
        case 'contract_done': hud.contractDone(); break;
        case 'contract_failed': hud.contractFailed(); break;
        case 'storm': hud.storm(ev.on); break;
        case 'event': hud.eventOffer(ev.event); break;
        case 'repaired':
          // at most one ratchet every two seconds, and only for machines on screen
          if (performance.now() - lastRepairSfx > 2000 && renderer.isVisible(ev.b)) {
            lastRepairSfx = performance.now();
            sfx.repair();
          }
          break;
        case 'event_done': hud.eventDone(ev.event, ev.choice, sim.state.time >= ev.event.until); break;
        case 'meteor': hud.meteorLanded(ev.x, ev.y); break;
        case 'beep': sfx.beep(); break;
      }
    }
    sim.events.length = 0;
    hudTimer += dt;
    if (hudTimer > 0.25) {
      hudTimer = 0;
      hud.refresh();
      let working = 0;
      for (const b of sim.state.buildings) if (b.working && b.type !== 'miner') working++;
      setActivity(speed === 0 ? 0 : working);
      setMusicActivity(speed === 0 ? 0 : working);
      const biome = biomeIdFor(sim.state.seed);
      setBiome(biome);
      setMusicBiome(biome);
    }
    saveTimer += dt;
    if (saveTimer > 8) {
      saveTimer = 0;
      Save.save(sim.state);
    }
  }
  if (inGame && speed > 0) tickVideo(sim, now);
  if (inGame) {
    renderer.draw(dt);
    hud.updateFloating();
  }
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 100));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) Save.save(sim.state);
  last = performance.now();
});
window.addEventListener('pagehide', () => {
  if (playing) Save.save(sim.state);
});
// prevent iOS double-tap zoom / rubber banding on the UI layer
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

renderer.resize();
renderer.centerOnCore();
exposeDebug();
// the cinematic intro on the first start (skippable, again from the menu); the menu is ready behind it, its video
// waits until the intro ends
const INTRO_KEY = 'pe_intro_seen';
installFrame();
wireUiSounds();
const intro = introWanted() && (new URLSearchParams(location.search).has('intro') || !kv.get(INTRO_KEY));
hud.holdMenuVideo = intro;
hud.showTitle();
syncAchievementsToSteam();
if (intro)
  void playIntro().then(() => {
    kv.set(INTRO_KEY, '1');
    hud.holdMenuVideo = false;
    if (!document.querySelector('.title-screen.hidden')) hud.menuVideo(true);
  });
// the desktop app saves when the window closes
window.addEventListener('beforeunload', () => { if (playing) Save.save(sim.state); });
// a shared challenge link (?ch=PE-C1-…): show the comparison over the title screen, then drop it from the address
{
  const code = new URLSearchParams(location.search).get('ch');
  if (code) {
    setTimeout(() => hud.showChallengeCode(code), 300);
    history.replaceState(null, '', location.pathname + location.hash);
  }
}
requestAnimationFrame(frame);

void preloadAll(BUILD_ORDER.concat('core'), ['iron_ore', 'copper_ore', 'quartz', 'ice', 'oil', 'rock'] as TerrainId[], ITEM_ORDER);

// the desktop app loads its files from disk: no offline cache there
if ('serviceWorker' in navigator && import.meta.env.PROD && !IS_DESKTOP) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(__BUILD__)}`).catch(() => undefined);
  });
}
