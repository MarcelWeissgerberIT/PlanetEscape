// Sub page /ai/: what the MCP server offers, how to connect an agent, the playbook, and a live demo where the
// built-in auto-solver plays a story chapter in the browser.
import './style.css';
import './ai.css';
import PLAYBOOK from '../mcp/PLAYBOOK.md?raw';
import { preloadAll } from './game/assets';
import { BUILD_ORDER, ITEM_ORDER, LEVELS, MISSIONS } from './game/data';
import { Renderer } from './game/render';
import { Sim } from './game/sim';
import { solveOrder } from './game/solver';
import type { Building, Dir, GameState, ItemId, TerrainId } from './game/types';
import { chapterState } from './game/world';
import { getLang, setLang, tItem, tMission, type Lang } from './i18n';

const T = {
  de: {
    back: '← Zum Spiel',
    repo: 'GitHub',
    title: 'Lass eine <em>KI</em> spielen',
    lead: 'Planet Escape hat einen MCP‑Server: Ein Agent wie Claude kann das Spiel ohne Browser starten, die Karte lesen, bauen und einen Auto‑Solver nutzen, der Produktionsketten selbst entwirft. Unten siehst du diesen Solver live bei der Arbeit.',
    demo: 'Live‑Demo: der Auto‑Solver löst ein Kapitel',
    demo_hint: 'Derselbe Code, den der MCP‑Server benutzt, läuft hier im Browser. Kapitel wählen, starten, zuschauen.',
    chapter: 'Kapitel',
    speed: 'Tempo',
    start: 'Starten',
    restart: 'Neu starten',
    status_idle: 'Bereit',
    status_planning: 'Solver plant …',
    status_placing: 'Baut auf …',
    status_running: 'Fabrik läuft …',
    status_done: 'Auftrag erfüllt',
    status_failed: 'Nicht gelöst',
    gametime: 'Spielzeit',
    buildings: 'Gebäude',
    order: 'Auftrag',
    rounds: 'Solver‑Runden',
    power: 'Energie',
    done_in: 'Auftrag {n} erfüllt in {t}',
    failed_txt: 'Der Solver kam nicht weiter: {e}',
    setup: 'So verbindest du einen Agenten',
    setup_txt: 'Repository klonen, Server bauen und in Claude Desktop oder Claude Code eintragen. Der Server läuft lokal über stdio, es wird nichts hochgeladen.',
    claude_code: 'Claude Code (ein Befehl)',
    claude_desktop: 'Claude Desktop (claude_desktop_config.json)',
    then: 'Danach reicht ein Satz wie „Spiel Kapitel 3 von Planet Escape“. Im Repository liegt außerdem der Skill <code>play-planet-escape</code>, der den Agenten Schritt für Schritt durch eine Runde führt.',
    tools: 'Werkzeuge des Servers',
    tool: 'Werkzeug',
    what: 'Was es tut',
    playbook: 'Playbook für Agenten',
    playbook_txt: 'Diese Anleitung bekommt der Agent vom Server selbst (Tool <code>pe_playbook</code>, Prompt <code>play_chapter</code>). Sie beschreibt eine Runde, die Reaktion auf Solver‑Fehler und die Reparatur jeder Störung.',
    watch: 'Live zuschauen',
    watch_txt: 'Sag dem Agenten „starte die Zuschauer‑Seite“ oder lass ihn <code>pe_spectate</code> aufrufen. Der MCP‑Server öffnet dann auf deinem Rechner eine temporäre Live‑Seite. Solange sie läuft, wird die Simulation in Echtzeit getaktet (Standard 10× Spielzeit), und du siehst jeden Bau, jedes Band und jeden Werkzeugaufruf des Agenten, während er spielt. Wird die Seite gestoppt oder der Server beendet, ist sie wieder weg.',
    watch_open: 'Live‑Seite öffnen (läuft nur, wenn der Agent sie gestartet hat)',
    watch_share: 'Die Seite lauscht nur auf deinem Rechner. Für Zuschauer im Netz reicht ein Tunnel, zum Beispiel <code>ssh -R 7411:localhost:7411 server</code> oder ein Cloudflare‑Tunnel auf Port 7411.',
    load_save: 'Spielstand ansehen',
    load_save_txt: 'Am Ende exportiert der Agent den Spielstand mit <code>pe_save</code>. Im Spiel unter Menü → Export/Import einfügen, dann siehst du die Fabrik der KI auf deinem Gerät.',
    foot: 'Planet Escape ist Open Source. Der Solver ist in <code>src/game/solver.ts</code>, der Server in <code>mcp/</code>.',
  },
  en: {
    back: '← Back to the game',
    repo: 'GitHub',
    title: 'Let an <em>AI</em> play',
    lead: 'Planet Escape ships an MCP server: an agent such as Claude can start the game without a browser, read the map, build, and use an auto‑solver that designs production chains on its own. Below you can watch that solver work live.',
    demo: 'Live demo: the auto‑solver plays a chapter',
    demo_hint: 'The same code the MCP server uses runs here in your browser. Pick a chapter, start, watch.',
    chapter: 'Chapter',
    speed: 'Speed',
    start: 'Start',
    restart: 'Restart',
    status_idle: 'Ready',
    status_planning: 'Solver planning …',
    status_placing: 'Building …',
    status_running: 'Factory running …',
    status_done: 'Order complete',
    status_failed: 'Not solved',
    gametime: 'Game time',
    buildings: 'Buildings',
    order: 'Order',
    rounds: 'Solver rounds',
    power: 'Power',
    done_in: 'Order {n} complete in {t}',
    failed_txt: 'The solver got stuck: {e}',
    setup: 'How to connect an agent',
    setup_txt: 'Clone the repository, build the server and register it in Claude Desktop or Claude Code. It runs locally over stdio; nothing is uploaded.',
    claude_code: 'Claude Code (one command)',
    claude_desktop: 'Claude Desktop (claude_desktop_config.json)',
    then: 'Then a sentence like “play chapter 3 of Planet Escape” is enough. The repository also contains the skill <code>play-planet-escape</code> that walks the agent through a round.',
    tools: 'Server tools',
    tool: 'Tool',
    what: 'What it does',
    playbook: 'Agent playbook',
    playbook_txt: 'The agent receives this guide from the server itself (tool <code>pe_playbook</code>, prompt <code>play_chapter</code>). It describes one round, how to react to solver errors and how to repair every problem.',
    watch: 'Watch live',
    watch_txt: 'Tell the agent “start the spectator page” or let it call <code>pe_spectate</code>. The MCP server then opens a temporary live page on your machine. While it runs, the simulation is paced in real time (default 10× game speed) and you see every building, every belt and every tool call of the agent as it plays. Stop the page or the server and it is gone again.',
    watch_open: 'Open the live page (only works while the agent has it running)',
    watch_share: 'The page listens on your machine only. For remote viewers a tunnel is enough, e.g. <code>ssh -R 7411:localhost:7411 server</code> or a Cloudflare tunnel to port 7411.',
    load_save: 'Look at the result',
    load_save_txt: 'At the end the agent exports the save with <code>pe_save</code>. Paste it in the game under Menu → Export/Import and the AI’s factory appears on your device.',
    foot: 'Planet Escape is open source. The solver lives in <code>src/game/solver.ts</code>, the server in <code>mcp/</code>.',
  },
} as const;
type Key = keyof typeof T.en;
const tt = (k: Key, vars?: Record<string, string | number>) => {
  let s: string = T[getLang()][k];
  if (vars) for (const v in vars) s = s.replace(`{${v}}`, String(vars[v]));
  return s;
};

const TOOLS: [string, string][] = [
  ['pe_playbook', 'The agent guide (this page’s playbook).'],
  ['pe_new_game', 'Start a story chapter (1–7) or free play with seed, map size, difficulty.'],
  ['pe_next_chapter', 'After an order completed: move to the next chapter map.'],
  ['pe_get_state', 'Order, inventory, unlocks, power, building counts.'],
  ['pe_map', 'ASCII map of a region with a legend (deposits, buildings, belt arrows).'],
  ['pe_list_buildings', 'All buildings with position, direction, recipe, status.'],
  ['pe_place / pe_remove', 'Build or remove (full refund).'],
  ['pe_configure', 'Turn, set recipe, filter, valve threshold, mixer ratio, accept contracts.'],
  ['pe_route_belt', 'Auto‑routed belt line from one building to another.'],
  ['pe_build_chain', 'Whole production chain for an item at a target rate.'],
  ['pe_solve_order', 'Build everything the current order needs, including power.'],
  ['pe_spectate', 'Start / stop the local live page so a human can watch.'],
  ['pe_tick', 'Advance game time; stops when the order completes.'],
  ['pe_analyze', 'Jams, starved machines, dead ends, power shortage.'],
  ['pe_plan', 'Machine and miner counts for a rate (throughput calculator).'],
  ['pe_save', 'Export / import saves compatible with the browser game.'],
  ['pe_chapters', 'Reference: chapters, orders, unlocks.'],
];

const REPO = 'https://github.com/MarcelWeissgerberIT/PlanetEscape';

/** Minimal Markdown → HTML for the playbook (headings, lists, tables, code, bold, links). */
function md(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+)\*/g, '<i>$1</i>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^#{1,3} /.test(l)) {
      const lvl = l.match(/^#+/)![0].length;
      out.push(`<h${lvl}>${inline(l.slice(lvl + 1))}</h${lvl}>`);
      i++;
    } else if (l.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|\s*-/.test(lines[i])) rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      const [h, ...body] = rows;
      out.push(`<table><thead><tr>${h.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else if (/^(\d+\.|-) /.test(l)) {
      const ordered = /^\d+\./.test(l);
      const items: string[] = [];
      while (i < lines.length && (/^(\d+\.|-) /.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        if (/^(\d+\.|-) /.test(lines[i])) items.push(lines[i].replace(/^(\d+\.|-) /, ''));
        else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
    } else if (l.trim() === '') i++;
    else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,3} |\||- |\d+\. )/.test(lines[i])) para.push(lines[i++]);
      out.push(`<p>${inline(para.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

// ---------- Live demo ----------

type Phase = 'idle' | 'planning' | 'placing' | 'running' | 'done' | 'failed';
interface Placement {
  type: Building['type'];
  x: number;
  y: number;
  dir: Dir;
  recipe?: string | null;
  rotateId?: number; // existing building to turn instead of placing
}

const demo = {
  chapter: 1,
  speed: 4,
  phase: 'idle' as Phase,
  sim: null as Sim | null,
  renderer: null as Renderer | null,
  queue: [] as Placement[],
  placeTimer: 0,
  rounds: 0,
  lastOk: true,
  roundStart: 0,
  lastError: '',
  sameErrorTwice: false,
  lines: [] as { cls: string; text: string }[],
  startedAt: 0,
  finalOrder: '' as string,
};

function fmt(sec: number) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function logLine(text: string, cls = '') {
  demo.lines.push({ cls, text });
  if (demo.lines.length > 200) demo.lines.shift();
  const el = document.getElementById('log');
  if (el) {
    el.innerHTML = demo.lines.map((l) => `<div class="${l.cls}">${l.text}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  }
}

function startDemo() {
  const canvas = document.getElementById('demo-canvas') as HTMLCanvasElement;
  const st = chapterState(demo.chapter);
  demo.sim = new Sim(st);
  demo.renderer = new Renderer(canvas, demo.sim);
  demo.renderer.overlay = true;
  fitCanvas();
  demo.rounds = 0;
  demo.lines = [];
  demo.lastError = '';
  demo.sameErrorTwice = false;
  demo.startedAt = st.time;
  demo.finalOrder = '';
  const m = MISSIONS[st.missionIndex];
  logLine(`${tt('chapter')} ${demo.chapter}: ${tMission(m.id).title} — ${Object.entries(m.deliver).map(([k, n]) => `${n}× ${tItem(k)}`).join(', ')}`, 'hint');
  planRound();
}

function fitCanvas() {
  const stage = document.querySelector('.stage') as HTMLElement;
  const canvas = document.getElementById('demo-canvas') as HTMLCanvasElement;
  if (!demo.renderer || !stage) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  demo.renderer.resize(w, h);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  demo.renderer.centerOnCore();
  const s = demo.sim!.state;
  // frame the area around the core where the solver builds (about 14 tiles tall), never beyond the map
  void s;
  demo.renderer.cam.zoom = Math.max(0.3, Math.min(1, Math.min(w, h) / (64 * 14)));
}

/** Run the solver on a copy of the state, then replay its placements on the visible sim one by one. */
function planRound() {
  if (!demo.sim) return;
  demo.phase = 'planning';
  demo.rounds++;
  const clone = new Sim(JSON.parse(JSON.stringify(demo.sim.state)) as GameState);
  const log = solveOrder(clone, 8);
  demo.lastOk = log.ok;
  for (const s of log.steps) logLine('· ' + s);
  if (!log.ok) {
    const e = log.error ?? '';
    logLine('✗ ' + e, 'err');
    demo.sameErrorTwice = e === demo.lastError;
    demo.lastError = e;
  } else logLine('✓ plan complete', 'ok');
  // diff: new buildings (by id order) and turned belts
  const before = new Map(demo.sim.state.buildings.map((b) => [b.id, b]));
  const q: Placement[] = [];
  for (const b of [...clone.state.buildings].sort((a, c) => a.id - c.id)) {
    const old = before.get(b.id);
    if (!old) q.push({ type: b.type, x: b.x, y: b.y, dir: b.dir, recipe: b.recipe ?? null });
    else if (old.dir !== b.dir) q.push({ type: b.type, x: b.x, y: b.y, dir: b.dir, rotateId: b.id });
  }
  demo.queue = q;
  demo.roundStart = demo.sim.state.time;
  demo.phase = q.length ? 'placing' : 'running';
  if (!q.length && !log.ok && demo.sameErrorTwice) demo.phase = 'failed';
}

function placeNext() {
  const sim = demo.sim!;
  const p = demo.queue.shift();
  if (!p) return;
  if (p.rotateId) {
    const b = sim.byId(p.rotateId);
    if (b) sim.rotate(b, p.dir);
    return;
  }
  const b = sim.place(p.type, p.x, p.y, p.dir);
  if (b && p.recipe) sim.setRecipe(b, p.recipe);
  if (b) demo.renderer!.fxCraft(b);
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const sim = demo.sim, r = demo.renderer;
  if (sim && r) {
    if (demo.phase === 'placing') {
      demo.placeTimer += dt;
      const per = 0.045 / Math.max(1, demo.speed / 4);
      while (demo.placeTimer > per && demo.queue.length) {
        demo.placeTimer -= per;
        placeNext();
      }
      if (!demo.queue.length) demo.phase = 'running';
    } else if (demo.phase === 'running') {
      const startOrder = sim.state.missionIndex;
      let acc = dt * demo.speed;
      let guard = 0;
      while (acc >= 1 / 30 && guard++ < 40) {
        sim.tick(1 / 30);
        acc -= 1 / 30;
        if (sim.state.missionIndex !== startOrder) break;
      }
      for (const ev of sim.events) {
        if (ev.type === 'craft') r.fxCraft(ev.b);
        else if (ev.type === 'delivered') r.fxDelivered(ev.item);
      }
      sim.events.length = 0;
      if (sim.state.missionIndex !== startOrder) {
        demo.phase = 'done';
        const m = MISSIONS[startOrder];
        demo.finalOrder = Object.entries(m.deliver).map(([k, n]) => `${n}/${n} ${tItem(k)}`).join(', ');
        logLine(tt('done_in', { n: demo.chapter, t: fmt(sim.state.time - demo.startedAt) }), 'ok');
      } else if (!demo.lastOk && sim.state.time - demo.roundStart > 240) {
        if (demo.rounds >= 8) {
          demo.phase = 'failed';
          logLine(tt('failed_txt', { e: demo.lastError }), 'err');
        } else planRound();
      } else if (demo.lastOk && sim.state.time - demo.roundStart > 900) {
        // the plan was complete but the order is not: something jams; let the solver look again
        planRound();
      }
    }
    r.draw(dt);
  }
  renderStats();
  requestAnimationFrame(frame);
}

let lastStats = '';
function renderStats() {
  const sim = demo.sim;
  const el = document.getElementById('stats');
  const badge = document.getElementById('badge');
  const res = document.getElementById('result');
  if (!el) return;
  const status = tt(`status_${demo.phase}` as Key);
  let html = `<div class="stat"><span>Status</span><b>${status}</b></div>`;
  if (sim) {
    const st = sim.state;
    const m = sim.currentMission();
    const order = demo.phase === 'done' ? demo.finalOrder : m ? Object.entries(m.deliver).map(([k, n]) => `${Math.min(n!, Math.max(st.delivered[k as ItemId] ?? 0, st.ship[k as ItemId] ?? 0))}/${n} ${tItem(k)}`).join(', ') : '—';
    html += `<div class="stat"><span>${tt('order')}</span><b>${order}</b></div>
      <div class="stat"><span>${tt('gametime')}</span><b>${fmt(st.time - demo.startedAt)}</b></div>
      <div class="stat"><span>${tt('buildings')}</span><b>${st.buildings.length - 1}</b></div>
      <div class="stat"><span>${tt('power')}</span><b>${st.powerDemand}/${st.powerSupply}</b></div>
      <div class="stat"><span>${tt('rounds')}</span><b>${demo.rounds}</b></div>`;
  }
  if (html !== lastStats) {
    lastStats = html;
    el.innerHTML = html;
  }
  if (badge) badge.textContent = `${tt('chapter')} ${demo.chapter} · ${status}`;
  if (res) {
    res.classList.toggle('hidden', demo.phase !== 'done' && demo.phase !== 'failed');
    res.classList.toggle('bad', demo.phase === 'failed');
    res.textContent = demo.phase === 'done' ? `✓ ${tt('done_in', { n: demo.chapter, t: fmt((demo.sim?.state.time ?? 0) - demo.startedAt) })}` : demo.phase === 'failed' ? `✗ ${tt('status_failed')}` : '';
  }
}

// ---------- Page ----------

function render() {
  const lang = getLang();
  document.documentElement.lang = lang;
  const app = document.getElementById('app')!;
  const chapters = LEVELS.map((_, i) => `<button class="chip ${demo.chapter === i + 1 ? 'active' : ''}" data-ch="${i + 1}">${i + 1}</button>`).join('');
  const speeds = [1, 4, 10, 30].map((s) => `<button class="chip ${demo.speed === s ? 'active' : ''}" data-speed="${s}">${s}×</button>`).join('');
  app.innerHTML = `
  <div class="aiwrap">
    <div class="topbar">
      <a class="brand" href="../">PLANET <span>ESCAPE</span></a>
      <nav>
        <button class="chip ${lang === 'de' ? 'active' : ''}" data-lang="de">DE</button>
        <button class="chip ${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
        <a class="chip" href="${REPO}" target="_blank" rel="noopener">${tt('repo')}</a>
        <a class="chip" href="../">${tt('back')}</a>
      </nav>
    </div>
    <h1>${tt('title')}</h1>
    <p class="lead">${tt('lead')}</p>

    <h2>${tt('demo')}</h2>
    <p class="lead" style="font-size:14px">${tt('demo_hint')}</p>
    <div class="demo">
      <div class="stage"><canvas id="demo-canvas"></canvas><div class="badge" id="badge"></div><div class="result hidden" id="result"></div></div>
      <div class="panel card">
        <div><h3>${tt('chapter')}</h3><div class="chips">${chapters}</div></div>
        <div><h3>${tt('speed')}</h3><div class="chips">${speeds}</div></div>
        <button class="btn primary" data-act="start">${demo.sim ? tt('restart') : tt('start')}</button>
        <div id="stats"></div>
        <div class="log" id="log"></div>
      </div>
    </div>

    <h2>${tt('setup')}</h2>
    <p class="lead" style="font-size:15px">${tt('setup_txt')}</p>
    <pre><code>git clone ${REPO}.git
cd PlanetEscape
npm install
npm run mcp:build</code></pre>
    <div class="grid2">
      <div><h3>${tt('claude_code')}</h3><pre><code>claude mcp add planet-escape -- node "$PWD/mcp/dist/index.mjs"</code></pre></div>
      <div><h3>${tt('claude_desktop')}</h3><pre><code>{
  "mcpServers": {
    "planet-escape": {
      "command": "node",
      "args": ["/path/to/PlanetEscape/mcp/dist/index.mjs"]
    }
  }
}</code></pre></div>
    </div>
    <p>${tt('then')}</p>

    <h2>${tt('tools')}</h2>
    <table><thead><tr><th>${tt('tool')}</th><th>${tt('what')}</th></tr></thead><tbody>
      ${TOOLS.map(([n, d]) => `<tr><td><code>${n}</code></td><td>${d}</td></tr>`).join('')}
    </tbody></table>

    <h2>${tt('watch')}</h2>
    <p>${tt('watch_txt')}</p>
    <p><a class="btn primary" href="http://localhost:7411/spectate/" target="_blank" rel="noopener">▶ ${tt('watch_open')}</a></p>
    <p class="lead" style="font-size:14px">${tt('watch_share')}</p>

    <h2>${tt('load_save')}</h2>
    <p>${tt('load_save_txt')}</p>

    <h2>${tt('playbook')}</h2>
    <p>${tt('playbook_txt')}</p>
    <div class="card playbook">${md(PLAYBOOK)}</div>

    <p class="foot">${tt('foot')} · <a href="${REPO}" target="_blank" rel="noopener">${REPO.replace('https://', '')}</a></p>
  </div>`;
  app.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b) return;
    if (b.dataset.lang) {
      setLang(b.dataset.lang as Lang);
      render();
      remount();
    } else if (b.dataset.ch) {
      demo.chapter = Number(b.dataset.ch);
      render();
      remount();
      startDemo();
    } else if (b.dataset.speed) {
      demo.speed = Number(b.dataset.speed);
      render();
      remount();
    } else if (b.dataset.act === 'start') {
      startDemo();
      render();
      remount();
    }
  };
  lastStats = '';
  const log = document.getElementById('log');
  if (log) log.innerHTML = demo.lines.map((l) => `<div class="${l.cls}">${l.text}</div>`).join('');
}

/** After a re-render the canvas element is new: rebind the renderer to it. */
function remount() {
  if (!demo.sim) return;
  const canvas = document.getElementById('demo-canvas') as HTMLCanvasElement;
  const zoom = demo.renderer?.cam.zoom;
  demo.renderer = new Renderer(canvas, demo.sim);
  demo.renderer.overlay = true;
  fitCanvas();
  if (zoom) demo.renderer.cam.zoom = zoom;
}

render();
window.addEventListener('resize', () => fitCanvas());
requestAnimationFrame(frame);
void preloadAll(BUILD_ORDER.concat('core'), ['iron_ore', 'copper_ore', 'quartz', 'ice', 'oil', 'rock'] as TerrainId[], ITEM_ORDER);
