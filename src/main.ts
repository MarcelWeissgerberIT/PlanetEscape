import './style.css';
import { preloadAll } from './game/assets';
import { BUILD_ORDER, ITEM_ORDER } from './game/data';
import { EXAMPLES } from './game/examples';
import { startVideo, stopVideo, tickVideo, videoHasAudio, videoLive } from './game/video';
import { Input } from './game/input';
import { Renderer } from './game/render';
import * as Save from './game/save';
import { setActivity, sfx } from './game/sfx';
import { Sim } from './game/sim';
import type { Blueprint, GameState, TerrainId } from './game/types';
import { chapterState, levelState, newGame } from './game/world';
import { setLastChapter } from './game/progress';
import { t } from './i18n';
import { Hud } from './ui/hud';

const canvas = document.getElementById('game') as HTMLCanvasElement;

let sim = new Sim(Save.load() ?? newGame());
let renderer = new Renderer(canvas, sim);
let playing = false;
let launchShown = false;

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
  onLoadExample: (id: string) => {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    Save.clear();
    swapState(ex.build());
    Save.save(sim.state);
    start();
    if (sim.state.note) setTimeout(() => hud.showNote(), 400);
  },
  onPlayChapter: (chapter: number) => {
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
  if (playing) {
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
        case 'launch':
          if (!launchShown) {
            launchShown = true;
            sfx.launch();
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
    }
    saveTimer += dt;
    if (saveTimer > 8) {
      saveTimer = 0;
      Save.save(sim.state);
    }
  }
  if (playing && speed > 0) tickVideo(sim, now);
  renderer.draw(dt);
  if (playing) hud.updateFloating();
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
hud.showTitle();
requestAnimationFrame(frame);

void preloadAll(BUILD_ORDER.concat('core'), ['iron_ore', 'copper_ore', 'quartz', 'ice', 'oil', 'rock'] as TerrainId[], ITEM_ORDER);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}
