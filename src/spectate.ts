// Live spectator page: connects to the MCP spectator server (Server-Sent Events) and renders whatever the
// agent is doing with the real game renderer, plus the agent's tool calls.
import './style.css';
import './ai.css';
import { preloadAll } from './game/assets';
import { BUILD_ORDER, ITEM_ORDER, MISSIONS } from './game/data';
import { Renderer } from './game/render';
import { Sim } from './game/sim';
import type { GameState, ItemId, TerrainId } from './game/types';
import { getLang, setLang, tItem, tMission, type Lang } from './i18n';

interface ToolCall {
  t: number;
  name: string;
  args: string;
  ok: boolean;
  note?: string;
}
interface Snapshot {
  ts: number;
  speed: number;
  state: GameState;
  tools: ToolCall[];
  events: string[];
}

const T = {
  de: {
    title: 'Live: die KI spielt',
    connecting: 'Verbinde mit dem Zuschauer‑Server …',
    offline: 'Kein Server erreichbar. Lass den Agenten <code>pe_spectate</code> aufrufen oder prüfe die Adresse.',
    server: 'Server',
    live: 'LIVE',
    idle: 'wartet auf den Agenten',
    ticking: 'Simulation läuft {s}×',
    order: 'Auftrag',
    chapter: 'Kapitel',
    time: 'Spielzeit',
    buildings: 'Gebäude',
    power: 'Energie',
    tools: 'Werkzeugaufrufe des Agenten',
    events: 'Ereignisse',
    follow: 'Kamera folgt',
    overlay: 'Scan',
    back: '← Zum Spiel',
    about: 'Was ist das?',
  },
  en: {
    title: 'Live: the AI is playing',
    connecting: 'Connecting to the spectator server …',
    offline: 'No server reachable. Ask the agent to call <code>pe_spectate</code> or check the address.',
    server: 'Server',
    live: 'LIVE',
    idle: 'waiting for the agent',
    ticking: 'simulation running {s}×',
    order: 'Order',
    chapter: 'Chapter',
    time: 'Game time',
    buildings: 'Buildings',
    power: 'Power',
    tools: 'Agent tool calls',
    events: 'Events',
    follow: 'Camera follows',
    overlay: 'Scan',
    back: '← Back to the game',
    about: 'What is this?',
  },
} as const;
type Key = keyof typeof T.en;
const tt = (k: Key, vars?: Record<string, string | number>) => {
  let s: string = T[getLang()][k];
  if (vars) for (const v in vars) s = s.replace(`{${v}}`, String(vars[v]));
  return s;
};

const params = new URLSearchParams(location.search);
// the page is normally served by the spectator server itself; ?server= allows another origin
const serverBase = (params.get('server') ?? '').replace(/\/$/, '');

const view = {
  sim: null as Sim | null,
  renderer: null as Renderer | null,
  snap: null as Snapshot | null,
  connected: false,
  follow: true,
  overlay: true,
  lastSnapAt: 0,
  lastBuildings: 0,
};

function fmt(sec: number) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function applySnapshot(snap: Snapshot) {
  const first = !view.sim;
  view.snap = snap;
  view.lastSnapAt = performance.now();
  const sim = new Sim(snap.state);
  view.sim = sim;
  const canvas = document.getElementById('live-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  if (!view.renderer || view.renderer.canvas !== canvas) {
    view.renderer = new Renderer(canvas, sim);
    fit();
    view.renderer.centerOnCore();
  } else {
    view.renderer.sim = sim;
    view.renderer.selected = null;
  }
  view.renderer.overlay = view.overlay;
  // follow: pan to the newest building when the agent placed something
  if (view.follow && snap.state.buildings.length !== view.lastBuildings && !first) {
    const b = snap.state.buildings[snap.state.buildings.length - 1];
    if (b) view.renderer.centerOn(b.x, b.y, view.renderer.cam.zoom);
  }
  view.lastBuildings = snap.state.buildings.length;
  if (first) view.renderer.centerOnCore();
  renderSide();
}

function fit() {
  const stage = document.querySelector('.stage') as HTMLElement | null;
  if (!stage || !view.renderer) return;
  const z = view.renderer.cam.zoom;
  view.renderer.resize(stage.clientWidth, stage.clientHeight);
  view.renderer.cam.zoom = z || 0.6;
}

function connect() {
  const es = new EventSource(`${serverBase}/events`);
  es.onopen = () => {
    view.connected = true;
    renderSide();
  };
  es.onmessage = (e) => {
    try {
      applySnapshot(JSON.parse(e.data) as Snapshot);
    } catch {
      /* ignore malformed frames */
    }
  };
  es.onerror = () => {
    view.connected = false;
    renderSide();
    // EventSource retries on its own
  };
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const { sim, renderer, snap } = view;
  if (sim && renderer && snap) {
    // between snapshots keep belts moving at the server's pace (client-side prediction, resynced on the next frame)
    if (snap.speed > 0 && now - view.lastSnapAt < 1500) {
      let acc = dt * snap.speed, guard = 0;
      while (acc >= 1 / 30 && guard++ < 30) {
        sim.tick(1 / 30);
        acc -= 1 / 30;
      }
      for (const ev of sim.events) if (ev.type === 'craft') renderer.fxCraft(ev.b);
      sim.events.length = 0;
    }
    renderer.draw(dt);
  }
  requestAnimationFrame(frame);
}

let lastSide = '';
function renderSide() {
  const el = document.getElementById('side');
  const badge = document.getElementById('badge');
  if (!el) return;
  const snap = view.snap;
  let html = '';
  if (!view.connected && !snap) html = `<p class="lead" style="font-size:14px">${tt('connecting')}</p><p class="lead" style="font-size:13px">${tt('offline')}</p>`;
  if (snap) {
    const st = snap.state;
    const idx = st.missionIndex;
    const m = MISSIONS[idx];
    const order = m ? Object.entries(m.deliver).map(([k, n]) => `${Math.min(n!, Math.max(st.delivered[k as ItemId] ?? 0, st.ship[k as ItemId] ?? 0))}/${n} ${tItem(k)}`).join(', ') : '🚀';
    const title = m ? tMission(m.id).title : '';
    html += `<div class="stat"><span>${tt('chapter')}</span><b>${idx + 1}/${MISSIONS.length} ${title}</b></div>
      <div class="stat"><span>${tt('order')}</span><b>${order}</b></div>
      <div class="stat"><span>${tt('time')}</span><b>${fmt(st.time)}</b></div>
      <div class="stat"><span>${tt('buildings')}</span><b>${st.buildings.length - 1}</b></div>
      <div class="stat"><span>${tt('power')}</span><b>${st.powerDemand}/${st.powerSupply}</b></div>
      <h3>${tt('tools')}</h3>
      <div class="log tools">${[...snap.tools].reverse().map((c) => `<div class="${c.ok ? '' : 'err'}"><b>${c.name}</b> <span class="dim">${escapeHtml(c.args)}</span>${c.note ? `<div class="err">${escapeHtml(c.note)}</div>` : ''}</div>`).join('') || '—'}</div>
      <h3>${tt('events')}</h3>
      <div class="log events">${[...snap.events].reverse().map((e) => `<div>${escapeHtml(e)}</div>`).join('') || '—'}</div>`;
  }
  if (html !== lastSide) {
    lastSide = html;
    el.innerHTML = html;
  }
  if (badge) {
    const live = view.connected;
    badge.className = `badge ${live ? 'on' : 'off'}`;
    badge.textContent = live ? `● ${tt('live')} · ${snap && snap.speed > 0 ? tt('ticking', { s: snap.speed }) : tt('idle')}` : '○ offline';
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function render() {
  const lang = getLang();
  document.documentElement.lang = lang;
  const app = document.getElementById('app')!;
  app.innerHTML = `
  <div class="aiwrap live">
    <div class="topbar">
      <a class="brand" href="../">PLANET <span>ESCAPE</span></a>
      <nav>
        <button class="chip ${lang === 'de' ? 'active' : ''}" data-lang="de">DE</button>
        <button class="chip ${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
        <button class="chip ${view.follow ? 'active' : ''}" data-act="follow">${tt('follow')}</button>
        <button class="chip ${view.overlay ? 'active' : ''}" data-act="overlay">${tt('overlay')}</button>
        <a class="chip" href="../ai/">${tt('about')}</a>
        <a class="chip" href="../">${tt('back')}</a>
      </nav>
    </div>
    <h1 style="font-size:24px;margin:0 0 10px">${tt('title')}</h1>
    <div class="demo">
      <div class="stage tall"><canvas id="live-canvas"></canvas><div class="badge" id="badge"></div></div>
      <div class="panel card" id="side"></div>
    </div>
  </div>`;
  app.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b) return;
    if (b.dataset.lang) {
      setLang(b.dataset.lang as Lang);
      render();
      rebind();
    } else if (b.dataset.act === 'follow') {
      view.follow = !view.follow;
      render();
      rebind();
    } else if (b.dataset.act === 'overlay') {
      view.overlay = !view.overlay;
      if (view.renderer) view.renderer.overlay = view.overlay;
      render();
      rebind();
    }
  };
  lastSide = '';
  renderSide();
}

/** After a re-render the canvas is new: rebind the renderer to it, keeping the camera. */
function rebind() {
  const canvas = document.getElementById('live-canvas') as HTMLCanvasElement | null;
  if (!canvas || !view.sim) return;
  const cam = view.renderer?.cam;
  view.renderer = new Renderer(canvas, view.sim);
  view.renderer.overlay = view.overlay;
  fit();
  if (cam) {
    view.renderer.cam.x = cam.x;
    view.renderer.cam.y = cam.y;
    view.renderer.cam.zoom = cam.zoom;
  } else view.renderer.centerOnCore();
}

// mouse wheel zoom + drag pan on the live canvas
document.addEventListener('wheel', (e) => {
  const canvas = document.getElementById('live-canvas');
  if (!view.renderer || !canvas || !(e.target === canvas)) return;
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  view.renderer.cam.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
let drag: { x: number; y: number } | null = null;
document.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).id === 'live-canvas') drag = { x: e.clientX, y: e.clientY };
});
document.addEventListener('pointermove', (e) => {
  if (!drag || !view.renderer) return;
  view.renderer.cam.x -= (e.clientX - drag.x) / view.renderer.cam.zoom;
  view.renderer.cam.y -= (e.clientY - drag.y) / view.renderer.cam.zoom;
  drag = { x: e.clientX, y: e.clientY };
  view.follow = false;
});
document.addEventListener('pointerup', () => (drag = null));

render();
connect();
window.addEventListener('resize', fit);
requestAnimationFrame(frame);
void preloadAll(BUILD_ORDER.concat('core'), ['iron_ore', 'copper_ore', 'quartz', 'ice', 'oil', 'rock'] as TerrainId[], ITEM_ORDER);
