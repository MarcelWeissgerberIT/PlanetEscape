import { buildingUrl, itemUrl, terrainUrl, uiUrl } from '../game/assets';
import { BUILDINGS, BUILD_ORDER, ITEM_ORDER, MISSIONS, ORE_PER_TILE, RECIPES, RECIPE_BY_ID, SHIP_PARTS, TERRAIN_ITEM, UPGRADES, recipesFor } from '../game/data';
import type { Input, Tool } from '../game/input';
import type { Renderer } from '../game/render';
import type { Problem, Sim } from '../game/sim';
import { setSound, sfx, soundEnabled } from '../game/sfx';
import type { Building, BuildingId, Contract, Dir, GameOptions, ItemId, UpgradeId } from '../game/types';
import { TILE } from '../game/camera';
import { getLang, setLang, t, tBuilding, tBuildingDesc, tChapter, tItem, tMission, tStatus, tStory, tTutorial, tUpgrade, type Lang } from '../i18n';
import { hasSave } from '../game/save';

export interface HudCallbacks {
  onNewGame: (seed: number | undefined, options: GameOptions) => void;
  onContinue: () => void;
  onSave: () => void;
  onCenter: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function itemImg(id: ItemId, cls = 'icon'): string {
  return `<img class="${cls}" src="${itemUrl(id)}" alt="${tItem(id)}" data-item="${id}" draggable="false">`;
}

function costHtml(cost: Partial<Record<ItemId, number>>, inv: Partial<Record<ItemId, number>>): string {
  return Object.entries(cost)
    .map(([k, n]) => {
      const have = inv[k as ItemId] ?? 0;
      return `<span class="cost ${have < n! ? 'short' : ''}">${itemImg(k as ItemId, 'icon xs')}${n}</span>`;
    })
    .join('');
}

function fmtTime(sec: number): string {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}:${String(s).padStart(2, '0')}`;
}

const DIR_ARROWS = ['▲', '▶', '▼', '◀'];

export class Hud {
  root: HTMLElement;
  title: HTMLElement;
  story: HTMLElement;
  top: HTMLElement;
  bottom: HTMLElement;
  info: HTMLElement;
  modal: HTMLElement;
  toasts: HTMLElement;
  floating: HTMLElement;
  minimapBox: HTMLElement;
  minimap: HTMLCanvasElement;
  selected: Building | null = null;
  private lastTopHtml = '';
  private lastBottomHtml = '';
  private tool: Tool = { kind: 'none' };
  private problems: Problem[] = [];
  private koraMsg = '';
  private koraMsgT = 0;
  private storyIndex = 0;
  private minimapOpen = window.innerWidth > 900;
  private panelOpenedAt = 0;

  constructor(
    public sim: Sim,
    public input: Input,
    public renderer: Renderer,
    private cb: HudCallbacks,
  ) {
    this.root = document.getElementById('ui')!;
    this.title = el('div', 'title-screen');
    this.story = el('div', 'story hidden');
    this.top = el('div', 'hud-top');
    this.bottom = el('div', 'hud-bottom');
    this.info = el('div', 'info-panel hidden');
    this.modal = el('div', 'modal hidden');
    this.toasts = el('div', 'toasts');
    this.floating = el('div', 'floating hidden');
    this.minimapBox = el('div', 'minimap-box hidden');
    this.minimap = document.createElement('canvas');
    this.minimap.width = 160;
    this.minimap.height = 160;
    this.minimapBox.append(this.minimap);
    this.root.append(this.title, this.story, this.top, this.bottom, this.info, this.floating, this.minimapBox, this.modal, this.toasts);
    this.renderTitle();
    this.renderBottom();
    this.renderTop();
    // tapping any item icon (outside buttons that use icons as labels) opens its production chain
    this.root.addEventListener('click', (e) => {
      if (this.panelJustOpened()) return;
      const img = (e.target as HTMLElement).closest('img[data-item]') as HTMLImageElement | null;
      if (!img) return;
      if (img.closest('.build-btn, .recipe, .inv-item, .r-in, .cost, .upgrade')) return;
      this.showChain(img.dataset.item as ItemId);
    });
    this.minimapBox.addEventListener('pointerdown', (e) => {
      const r = this.minimap.getBoundingClientRect();
      const tx = ((e.clientX - r.left) / r.width) * this.sim.state.width;
      const ty = ((e.clientY - r.top) / r.height) * this.sim.state.height;
      this.renderer.centerOn(tx, ty);
    });
  }

  // ---------- Title & story ----------

  showTitle() {
    this.renderTitle();
    this.title.classList.remove('hidden');
    this.top.classList.add('hidden');
    this.bottom.classList.add('hidden');
    this.info.classList.add('hidden');
    this.floating.classList.add('hidden');
    this.minimapBox.classList.add('hidden');
  }

  hideTitle() {
    this.title.classList.add('hidden');
    this.top.classList.remove('hidden');
    this.bottom.classList.remove('hidden');
    this.minimapBox.classList.toggle('hidden', !this.minimapOpen);
    if (!this.sim.state.introSeen) this.showStory();
  }

  private freeOptions: GameOptions = { mode: 'free', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: true };
  private titleView: 'main' | 'free' = 'main';

  private renderTitle() {
    const lang = getLang();
    const o = this.freeOptions;
    const seedInput = `<div class="seed-row"><input id="seed" type="text" inputmode="numeric" placeholder="${t('seed')}" maxlength="12"></div>`;
    const mainView = `
        <div class="title-buttons">
          ${hasSave() ? `<button class="btn primary" data-act="continue">${t('continue')}</button>` : ''}
          <button class="btn mode ${hasSave() ? '' : 'primary'}" data-act="story"><b>${t('mode_story')}</b><small>${t('mode_story_desc')}</small></button>
          <button class="btn mode" data-act="freeview"><b>${t('mode_free')}</b><small>${t('mode_free_desc')}</small></button>
          ${seedInput}
          <button class="btn ghost" data-act="howto">${t('how_to')}</button>
        </div>`;
    const opt = (key: keyof GameOptions, label: string, on: boolean) => `<div class="menu-row"><span>${label}</span><span><button class="chip ${on ? 'active' : ''}" data-opt="${key}" data-val="1">${t('on')}</button><button class="chip ${on ? '' : 'active'}" data-opt="${key}" data-val="0">${t('off')}</button></span></div>`;
    const freeView = `
        <div class="title-buttons">
          <div class="menu-row"><span>${t('map_size')}</span><span>${(['small', 'medium', 'large'] as const).map((sz) => `<button class="chip ${o.mapSize === sz ? 'active' : ''}" data-size="${sz}">${t(`size_${sz}` as 'size_small').split(' ')[0]}</button>`).join('')}</span></div>
          ${opt('infiniteOre', t('infinite_ore'), o.infiniteOre)}
          ${opt('allUnlocked', t('all_unlocked'), o.allUnlocked)}
          ${opt('storms', t('storms_opt'), o.storms)}
          ${seedInput}
          <button class="btn primary" data-act="free">${t('start_free')}</button>
          <button class="btn ghost" data-act="back">${t('back')}</button>
        </div>`;
    this.title.innerHTML = `
      <div class="title-bg" style="background-image:url('${uiUrl('title_bg.webp')}')"></div>
      <div class="title-content">
        <h1 class="logo"><span>PLANET</span><span class="accent">ESCAPE</span></h1>
        <p class="tagline">${t('tagline')}</p>
        ${this.titleView === 'main' ? `<p class="intro">${t('intro')}</p>` : `<p class="intro"><b>${t('mode_free')}</b> · ${t('mode_free_desc')}</p>`}
        ${this.titleView === 'main' ? mainView : freeView}
        <div class="lang-switch">
          <button class="chip ${lang === 'de' ? 'active' : ''}" data-lang="de">Deutsch</button>
          <button class="chip ${lang === 'en' ? 'active' : ''}" data-lang="en">English</button>
        </div>
        <p class="save-hint">${t('seed_hint')}<br>${t('save_hint')}</p>
      </div>`;
    this.title.onclick = (e) => {
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!target) return;
      const act = target.dataset.act;
      const lang = target.dataset.lang as Lang | undefined;
      if (lang) {
        setLang(lang);
        this.renderAll();
        return;
      }
      if (target.dataset.size) {
        this.freeOptions.mapSize = target.dataset.size as GameOptions['mapSize'];
        this.renderTitle();
        return;
      }
      if (target.dataset.opt) {
        (this.freeOptions as unknown as Record<string, boolean | string>)[target.dataset.opt] = target.dataset.val === '1';
        this.renderTitle();
        return;
      }
      const seedOf = () => {
        const v = (this.title.querySelector('#seed') as HTMLInputElement | null)?.value.trim();
        return v ? Math.abs(hashSeed(v)) : undefined;
      };
      if (act === 'continue') this.cb.onContinue();
      else if (act === 'story') {
        if (!hasSave() || confirm(t('new_game_confirm'))) this.cb.onNewGame(seedOf(), { mode: 'story', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: true });
      } else if (act === 'freeview') {
        this.titleView = 'free';
        this.renderTitle();
      } else if (act === 'back') {
        this.titleView = 'main';
        this.renderTitle();
      } else if (act === 'free') {
        if (!hasSave() || confirm(t('new_game_confirm'))) this.cb.onNewGame(seedOf(), { ...this.freeOptions, mode: 'free' });
      } else if (act === 'howto') this.showHowTo();
    };
  }

  showStory() {
    this.storyIndex = 0;
    this.story.classList.remove('hidden');
    this.renderStory();
  }

  private renderStory() {
    const texts = tStory();
    const i = this.storyIndex;
    const last = i >= texts.length - 1;
    this.story.innerHTML = `
      <div class="story-img" style="background-image:url('${uiUrl(`story_${i + 1}.webp`)}')"></div>
      <div class="story-text">
        <div class="story-kora"><img src="${uiUrl('kora.webp')}" alt=""><b>${t('kora')}</b></div>
        <p>${texts[i]}</p>
        <div class="story-dots">${texts.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
        <div class="story-buttons">
          <button class="btn ghost small" data-act="skip">${t('skip')}</button>
          <button class="btn primary small" data-act="next">${last ? t('play') : t('next')}</button>
        </div>
      </div>`;
    this.story.onclick = (e) => {
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!target) return;
      if (target.dataset.act === 'skip' || last) {
        this.sim.state.introSeen = true;
        this.story.classList.add('hidden');
        this.cb.onSave();
        this.refresh();
      } else {
        this.storyIndex++;
        this.renderStory();
      }
    };
  }

  renderAll() {
    this.renderTitle();
    this.lastTopHtml = '';
    this.lastBottomHtml = '';
    this.renderTop();
    this.renderBottom();
    if (this.selected) this.showInfo(this.selected);
  }

  // ---------- Tutorial ----------

  private tutorialCondition(step: number): boolean {
    const st = this.sim.state;
    const sim = this.sim;
    switch (step) {
      case 0:
        return sim.countBuildings('miner') >= 1;
      case 1:
        return st.buildings.some((b) => b.type === 'miner' && sim.traceFlow(b).target?.type === 'core');
      case 2:
        return st.missionIndex >= 1;
      case 3:
        return sim.countBuildings('smelter') >= 1 && (st.delivered.iron_plate ?? 0) >= 1;
      case 4:
        return st.missionIndex >= 2;
      case 5:
        return sim.countBuildings('printer') >= 1 && (st.delivered.machine_part ?? 0) >= 1;
      case 6:
        return st.missionIndex >= 3;
    }
    return true;
  }

  /** Frame the ping target and the core together inside the band between the top and bottom HUD. */
  private focusTutorial() {
    const p = this.renderer.ping;
    const core = this.sim.state.buildings[0];
    const cam = this.renderer.cam;
    const cx = core.x + 1.5, cy = core.y + 1.5;
    const topH = (this.top.getBoundingClientRect().height || 120) + 24;
    const botH = (this.bottom.getBoundingClientRect().height || 180) + 24;
    const bandH = Math.max(120, cam.height - topH - botH);
    const bandCenter = topH + bandH / 2; // screen y where the midpoint should land
    if (!p) {
      this.renderer.centerOn(cx - 0.5, cy - 0.5);
      return;
    }
    // second anchor: the core, or the first miner while the belt is being laid
    let ax = cx, ay = cy;
    const miner = this.sim.state.buildings.find((b) => b.type === 'miner');
    if (this.sim.state.tutorialStep === 1 && miner) {
      ax = miner.x + 0.5;
      ay = miner.y + 0.5;
    }
    const px = p.x + p.w / 2, py = p.y + p.h / 2;
    const spanX = Math.abs(px - ax) + 5, spanY = Math.abs(py - ay) + 5;
    const zoom = Math.max(0.3, Math.min(1.1, Math.min(cam.width / (spanX * TILE), bandH / (spanY * TILE))));
    cam.zoom = zoom;
    cam.x = ((px + ax) / 2) * TILE;
    cam.y = ((py + ay) / 2) * TILE - (bandCenter - cam.height / 2) / zoom;
    this.renderer.cancelPan();
  }

  private tutorialPing(step: number) {
    const st = this.sim.state;
    const core = st.buildings[0];
    if (step === 0) {
      // nearest iron ore tile
      let best: [number, number] | null = null, bd = 1e9;
      for (let y = 0; y < st.height; y++) for (let x = 0; x < st.width; x++) if (st.terrain[y * st.width + x] === 'iron_ore') {
        const d = Math.abs(x - core.x - 1) + Math.abs(y - core.y - 1);
        if (d < bd) { bd = d; best = [x, y]; }
      }
      this.renderer.ping = best ? { x: best[0], y: best[1], w: 1, h: 1 } : null;
    } else if (step === 1 || step === 2) this.renderer.ping = { x: core.x, y: core.y, w: 3, h: 3 };
    else this.renderer.ping = null;
  }

  private lastTutorialStep = -2;

  private tickTutorial() {
    const st = this.sim.state;
    if (st.tutorialStep < 0) {
      this.renderer.ping = null;
      return;
    }
    const steps = tTutorial();
    while (st.tutorialStep >= 0 && st.tutorialStep < steps.length && this.tutorialCondition(st.tutorialStep)) {
      st.tutorialStep++;
      sfx.select();
    }
    if (st.tutorialStep !== this.lastTutorialStep && st.tutorialStep >= 0 && st.tutorialStep < steps.length) {
      this.lastTutorialStep = st.tutorialStep;
      this.tutorialPing(st.tutorialStep);
      this.focusTutorial();
    }
    if (st.tutorialStep >= steps.length) {
      st.tutorialStep = -1;
      this.renderer.ping = null;
      this.toast(`✓ ${t('tutorial_done')}`, 5000, 'success');
      return;
    }
    this.tutorialPing(st.tutorialStep);
  }

  // ---------- Top HUD ----------

  private renderTop() {
    const st = this.sim.state;
    const m = this.sim.currentMission();
    const steps = tTutorial();
    const tut = st.tutorialStep >= 0 && st.tutorialStep < steps.length ? steps[st.tutorialStep] : null;
    let body = '';
    if (tut) {
      body = `<div class="mtitle"><span class="mnum">${t('tutorial_title')} ${st.tutorialStep + 1}/${steps.length}</span> ${tut.title}</div>
        <div class="mtext">${tut.text}</div>`;
    } else if (m) {
      const mt = tMission(m.id);
      const rows = Object.entries(m.deliver)
        .map(([k, n]) => {
          const have = Math.min(n!, Math.max(st.delivered[k as ItemId] ?? 0, st.ship[k as ItemId] ?? 0));
          return `<div class="mrow ${have >= n! ? 'done' : ''}">${itemImg(k as ItemId, 'icon sm')}<span class="mname">${tItem(k as ItemId)}</span><span class="mcount">${have}/${n}</span></div>`;
        })
        .join('');
      const builds = m.build
        ? Object.entries(m.build)
            .map(([k, n]) => {
              const have = Math.min(n!, this.sim.countBuildings(k as BuildingId));
              return `<div class="mrow ${have >= n! ? 'done' : ''}"><img class="icon sm" src="${buildingUrl(k as BuildingId)}" alt=""><span class="mname">${t('build_req')}: ${tBuilding(k)}</span><span class="mcount">${have}/${n}</span></div>`;
            })
            .join('')
        : '';
      body = `<div class="mtitle"><span class="mnum">${t('mission')} ${st.missionIndex + 1}/${MISSIONS.length}</span> ${mt.title}</div>
        <div class="mtext">${this.koraMsg && this.koraMsgT > 0 ? this.koraMsg : mt.text}</div>
        <div class="mrows">${builds}${rows}</div>`;
    } else body = `<div class="mtitle">🚀 ${t('launch_title')}</div>`;
    if (!tut && m && st.options.mode === 'free') {
      const p = Math.round(this.sim.shipProgress() * 100);
      body += `<div class="mtext">${t('ship_progress')}: ${p}%</div>`;
    }

    const supply = st.powerSupply, demand = st.powerDemand;
    const ratio = demand <= 0 ? 0 : Math.min(1, demand / Math.max(1, supply));
    const low = demand > supply;
    const nProblems = this.problems.length;
    const openContracts = st.contracts.filter((c) => !c.accepted).length;
    const topHtml = `
      <button class="kora-card" data-act="missions">
        <img class="kora-avatar ${tut ? 'talk' : ''}" src="${uiUrl('kora.webp')}" alt="KORA">
        <div class="kora-body">${body}</div>
      </button>
      <div class="top-right">
        <div class="power ${low ? 'low' : ''} ${st.storm > 0 ? 'storm' : ''}" title="${t('power')}">
          <span class="plabel">${st.storm > 0 ? '🌪' : '⚡'} ${demand}/${supply}</span>
          <div class="pbar"><div class="pfill" style="width:${ratio * 100}%"></div></div>
        </div>
        <button class="pill ${nProblems ? 'warn' : 'ok'}" data-act="diag">${nProblems ? `⚠ ${nProblems}` : '✓'}</button>
        <button class="iconbtn ${this.renderer.overlay ? 'active' : ''}" data-act="overlay" title="${t('overlay')}">◎</button>
        <button class="iconbtn ${openContracts ? 'badge' : ''}" data-act="contracts" title="${t('contracts')}" data-badge="${openContracts}">📋</button>
        <button class="iconbtn" data-act="upgrades" title="${t('upgrades')}">⬆</button>
        <button class="iconbtn ${this.minimapOpen ? 'active' : ''}" data-act="minimap" title="${t('minimap')}">▦</button>
        <button class="iconbtn" data-act="center" title="${t('reset_view')}">⌖</button>
        <button class="iconbtn" data-act="menu" title="${t('menu')}">☰</button>
      </div>`;
    if (topHtml === this.lastTopHtml) return;
    this.lastTopHtml = topHtml;
    this.top.innerHTML = topHtml;
    this.top.onclick = (e) => {
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!target) return;
      const act = target.dataset.act;
      if (act === 'missions') this.showMissions();
      else if (act === 'menu') this.showMenu();
      else if (act === 'center') this.cb.onCenter();
      else if (act === 'diag') this.showDiagnostics();
      else if (act === 'overlay') {
        this.renderer.overlay = !this.renderer.overlay;
        if (this.renderer.overlay) this.toast(t('overlay_on'), 2000);
        this.lastTopHtml = '';
        this.renderTop();
      } else if (act === 'contracts') this.showContracts();
      else if (act === 'upgrades') this.showUpgrades();
      else if (act === 'minimap') {
        this.minimapOpen = !this.minimapOpen;
        this.minimapBox.classList.toggle('hidden', !this.minimapOpen);
        this.lastTopHtml = '';
        this.renderTop();
      }
    };
  }

  koraSay(msg: string, seconds = 8) {
    this.koraMsg = msg;
    this.koraMsgT = seconds;
  }

  // ---------- Bottom HUD ----------

  private renderBottom() {
    const st = this.sim.state;
    const inv = st.inventory;
    const invHtml = ITEM_ORDER.filter((id) => (inv[id] ?? 0) > 0)
      .map((id) => `<button class="inv-item" data-chain="${id}" title="${tItem(id)}">${itemImg(id, 'icon sm')}<b>${inv[id]}</b></button>`)
      .join('');
    const tutStep = st.tutorialStep;
    const hint: BuildingId | null = tutStep === 0 ? 'miner' : tutStep === 1 ? 'conveyor' : tutStep === 3 ? 'smelter' : tutStep === 5 ? 'printer' : null;
    const buildHtml = BUILD_ORDER.map((id) => {
      const def = BUILDINGS[id];
      const unlocked = st.unlockedBuildings.includes(id);
      const affordable = this.sim.canAfford(id);
      const active = this.tool.kind === 'build' && this.tool.type === id;
      return `<button class="build-btn ${active ? 'active' : ''} ${unlocked ? '' : 'locked'} ${affordable ? '' : 'poor'} ${hint === id ? 'hint' : ''}" data-build="${id}" ${unlocked ? '' : 'disabled'}>
          <img src="${buildingUrl(id)}" alt="" draggable="false">
          <span class="bname">${tBuilding(id)}</span>
          <span class="bcost">${unlocked ? costHtml(def.cost, inv) : '🔒'}</span>
          ${def.power ? `<span class="bpower ${def.power < 0 ? 'gen' : ''}">⚡${Math.abs(def.power)}</span>` : ''}
        </button>`;
    }).join('');
    const delActive = this.tool.kind === 'delete';
    const bottomHtml = `
      <div class="inv-strip">${invHtml || `<span class="inv-empty">${t('inventory')}</span>`}</div>
      <div class="build-row">
        <div class="build-bar">${buildHtml}</div>
        <div class="tool-col">
          <button class="iconbtn big" data-act="rotate" title="${t('rotate')} (R)">⟳</button>
          <button class="iconbtn big ${delActive ? 'danger-active' : ''}" data-act="delete" title="${t('delete')} (X)">✕</button>
        </div>
      </div>`;
    if (bottomHtml === this.lastBottomHtml) return;
    this.lastBottomHtml = bottomHtml;
    const scroll = this.bottom.querySelector('.build-bar')?.scrollLeft ?? 0;
    this.bottom.innerHTML = bottomHtml;
    const bar = this.bottom.querySelector('.build-bar');
    if (bar) bar.scrollLeft = scroll;
    this.bottom.onclick = (e) => {
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!target) return;
      const build = target.dataset.build as BuildingId | undefined;
      if (build) {
        if (this.tool.kind === 'build' && this.tool.type === build) this.input.setTool({ kind: 'none' });
        else {
          this.input.setTool({ kind: 'build', type: build });
          this.selectBuilding(null);
          sfx.select();
        }
        return;
      }
      if (target.dataset.chain) {
        this.showChain(target.dataset.chain as ItemId);
        return;
      }
      const act = target.dataset.act;
      if (act === 'rotate') {
        this.rotateSelected();
      } else if (act === 'delete') {
        this.input.setTool(delActive ? { kind: 'none' } : { kind: 'delete' });
        if (!delActive) this.toast(t('delete_mode'), 2500);
        this.selectBuilding(null);
      }
    };
  }

  rotateSelected() {
    if (this.selected && BUILDINGS[this.selected.type].rotatable) {
      this.sim.rotate(this.selected, ((this.selected.dir + 1) & 3) as Dir);
      this.flashOutput(this.selected);
      this.showInfo(this.selected);
    } else this.input.rotate();
    sfx.select();
  }

  /** Briefly highlight where a building now outputs to. */
  flashOutput(b: Building) {
    const tiles = this.sim.frontTiles(b);
    if (!tiles.length) return;
    const t0 = tiles[0], t1 = tiles[tiles.length - 1];
    this.renderer.ping = { x: Math.min(t0.x, t1.x), y: Math.min(t0.y, t1.y), w: Math.abs(t1.x - t0.x) + 1, h: Math.abs(t1.y - t0.y) + 1 };
    setTimeout(() => {
      if (this.sim.state.tutorialStep < 0) this.renderer.ping = null;
    }, 900);
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.renderBottom();
  }

  // ---------- Info panel ----------

  selectBuilding(b: Building | null) {
    this.selected = b;
    this.renderer.selected = b;
    this.renderer.selectedTile = null;
    if (b) this.showInfo(b);
    else {
      this.info.classList.add('hidden');
      this.floating.classList.add('hidden');
    }
  }

  /** Clicks that land on the panel right after it opened are the tail of the tap that opened it. */
  private panelJustOpened(): boolean {
    return performance.now() - this.panelOpenedAt < 350;
  }

  /** Pan the camera so a world rect (tiles) is not hidden under the HUD or the info panel. */
  private ensureVisible(x: number, y: number, w: number, h: number) {
    const cam = this.renderer.cam;
    const [sx0, sy0] = cam.worldToScreen(x * TILE, y * TILE);
    const [sx1, sy1] = cam.worldToScreen((x + w) * TILE, (y + h) * TILE);
    const topH = (this.top.getBoundingClientRect().height || 120) + 16;
    const panel = this.info.getBoundingClientRect();
    const bottomLimit = this.info.classList.contains('hidden') ? cam.height - (this.bottom.getBoundingClientRect().height || 160) : Math.min(panel.top, cam.height - (this.bottom.getBoundingClientRect().height || 160)) - 12;
    const bandCenter = (topH + bottomLimit) / 2;
    const mid = (sy0 + sy1) / 2;
    const clearY = sy0 > topH && sy1 < bottomLimit;
    const clearX = sx0 > 8 && sx1 < cam.width - 8;
    if (clearY && clearX) return;
    this.renderer.panTo(((x + w / 2) * TILE), ((y + h / 2) * TILE), clearX ? (sx0 + sx1) / 2 : cam.width / 2, clearY ? mid : bandCenter);
  }

  /** Info for an empty tile: deposit, rock or ground. */
  selectTile(x: number, y: number) {
    const st = this.sim.state;
    const terrain = st.terrain[y * st.width + x];
    if (terrain === 'ground') {
      // plain ground: just clear the selection
      this.selectBuilding(null);
      return;
    }
    this.selected = null;
    this.renderer.selected = null;
    this.renderer.selectedTile = { x, y };
    this.floating.classList.add('hidden');
    const item = TERRAIN_ITEM[terrain];
    let body = '';
    if (item) {
      const left = this.sim.oreLeft(x, y);
      const max = ORE_PER_TILE[1];
      // what this ore turns into
      const uses = RECIPES.filter((r) => r.inputs[item]).map((r) => `<span class="buf">${itemImg(r.output, 'icon sm')}${tItem(r.output)}</span>`).join(' ');
      // size of the connected deposit
      let tiles = 0, total = 0;
      const seen = new Set<number>();
      const stack = [y * st.width + x];
      while (stack.length && tiles < 400) {
        const i = stack.pop()!;
        if (seen.has(i) || st.terrain[i] !== terrain) continue;
        seen.add(i);
        tiles++;
        total += st.ore[i] ?? 0;
        const ix = i % st.width, iy = (i - ix) / st.width;
        if (ix > 0) stack.push(i - 1);
        if (ix < st.width - 1) stack.push(i + 1);
        if (iy > 0) stack.push(i - st.width);
        if (iy < st.height - 1) stack.push(i + st.width);
      }
      body = `
        <div class="bufs"><span class="lbl">${t('remaining')}</span><span class="buf">${itemImg(item, 'icon sm')}${left}</span><span class="buf">${tiles} × · ${total}</span></div>
        <div class="pbar big"><div class="pfill" style="width:${Math.min(100, (left / max) * 100)}%"></div></div>
        <div class="bufs"><span class="lbl">${t('becomes')}</span>${uses || '–'}</div>
        <div class="status">${t('deposit_hint')}</div>`;
    } else if (terrain === 'rock') body = `<div class="status bad">${t('rock_hint')}</div>`;
    const canMine = item && st.unlockedBuildings.includes('miner');
    this.info.innerHTML = `
      <div class="info-head">
        <img src="${terrainUrl(terrain)}" alt="" draggable="false">
        <div class="info-title"><b>${item ? tItem(item) : t('rock')}</b><small>${item ? t('deposit') : t('rock')} · ${x}, ${y}</small></div>
        <button class="iconbtn" data-act="close">✕</button>
      </div>
      <div class="info-body">${body}</div>
      ${canMine ? `<div class="info-actions"><button class="btn small primary" data-act="miner">⛏ ${t('place_miner')}</button>${item ? `<button class="btn small" data-act="chain">${t('chain_for')}…</button>` : ''}</div>` : ''}`;
    const wasHidden = this.info.classList.contains('hidden');
    this.info.classList.remove('hidden');
    if (wasHidden) this.panelOpenedAt = performance.now();
    requestAnimationFrame(() => this.ensureVisible(x, y, 1, 1));
    this.info.onclick = (e) => {
      if (this.panelJustOpened()) return;
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!target) return;
      const act = target.dataset.act;
      if (act === 'close') this.selectBuilding(null);
      else if (act === 'miner') {
        this.input.setTool({ kind: 'build', type: 'miner' });
        sfx.select();
      } else if (act === 'chain' && item) this.showChain(item);
    };
  }

  /** Keep the floating rotate button glued to the selected building. Called every frame. */
  updateFloating() {
    const b = this.selected;
    if (!b || !BUILDINGS[b.type].rotatable || !this.modal.classList.contains('hidden')) {
      this.floating.classList.add('hidden');
      return;
    }
    const sz = BUILDINGS[b.type].size * TILE;
    const [sx, sy] = this.renderer.cam.worldToScreen(b.x * TILE + sz, b.y * TILE);
    if (this.floating.classList.contains('hidden')) {
      this.floating.innerHTML = `<button class="fab" title="${t('rotate')}">⟳</button>`;
      this.floating.onclick = () => this.rotateSelected();
      this.floating.classList.remove('hidden');
    }
    this.floating.style.transform = `translate(${Math.round(sx) - 4}px, ${Math.round(sy) - 40}px)`;
  }

  private infoBody(b: Building): string {
    const def = BUILDINGS[b.type];
    const st = this.sim.state;
    let body = '';
    const statusLine = (extra = '') => {
      const s = b.status ?? 'ok';
      let txt = s === 'ok' ? (b.working ? t('working') : t('idle')) : s === 'starved' ? `${tStatus(s)} ${(b.missing ?? []).map((m) => tItem(m)).join(', ')}` : tStatus(s);
      if (this.sim.powerRatio < 1 && (def.kind === 'machine' || def.kind === 'miner')) txt += ` · ${t('no_power')}`;
      return `<div class="status ${s === 'ok' ? '' : 'bad'}">${txt}${extra}</div>`;
    };
    const dirPicker = def.rotatable
      ? `<div class="dirs"><span class="lbl">${t('direction')}</span>${[0, 1, 2, 3].map((d) => `<button class="dirbtn ${b.dir === d ? 'active' : ''}" data-dir="${d}">${DIR_ARROWS[d]}</button>`).join('')}</div>`
      : '';
    if (def.kind === 'machine') {
      const recipes = recipesFor(b.type as 'smelter').filter((r) => st.unlockedRecipes.includes(r.id));
      const r = b.recipe ? RECIPE_BY_ID[b.recipe] : null;
      const inputs = r
        ? Object.entries(r.inputs)
            .map(([k, n]) => `<span class="buf">${itemImg(k as ItemId, 'icon sm')}${b.input?.[k as ItemId] ?? 0}<small>/${n}</small></span>`)
            .join('')
        : '';
      const outputs = r ? `<span class="buf">${itemImg(r.output, 'icon sm')}${b.output?.[r.output] ?? 0}</span>` : '';
      const recipeCards = recipes
        .map(
          (rc) => `<button class="recipe ${b.recipe === rc.id ? 'active' : ''}" data-recipe="${rc.id}">
            <div class="r-out">${itemImg(rc.output, 'icon')}<span class="r-n">${rc.outputCount > 1 ? '×' + rc.outputCount : ''}</span></div>
            <div class="r-name">${tItem(rc.output)}</div>
            <div class="r-in">${Object.entries(rc.inputs).map(([k, n]) => `${itemImg(k as ItemId, 'icon xs')}${n}`).join(' ')}</div>
            <div class="r-time">${rc.seconds}s</div>
          </button>`,
        )
        .join('');
      body = `${statusLine(r ? ` · ${t('rate')} ${(b.rate ?? 0).toFixed(1)}/min` : '')}
        <div class="bufs"><span class="lbl">${t('input')}</span>${inputs || '–'}<span class="lbl">${t('output')}</span>${outputs || '–'}</div>
        ${dirPicker}
        <div class="lbl">${t('recipe')}</div>
        <div class="recipes">${recipeCards}</div>`;
    } else if (def.kind === 'miner') {
      body = `${statusLine(` · ${t('rate')} ${(b.rate ?? 0).toFixed(1)}/min · ${t('ore_left')} ${this.sim.oreLeft(b.x, b.y)}`)}
        <div class="bufs"><span class="lbl">${t('output')}</span>${Object.entries(b.output ?? {}).map(([k, n]) => `<span class="buf">${itemImg(k as ItemId, 'icon sm')}${n}</span>`).join('') || '–'}</div>${dirPicker}`;
    } else if (def.kind === 'storage') {
      const items = Object.entries(b.store ?? {})
        .map(([k, n]) => `<span class="buf">${itemImg(k as ItemId, 'icon sm')}${n}</span>`)
        .join('');
      const filterable = Array.from(new Set([...Object.keys(b.store ?? {}), ...(b.recipe ? [b.recipe] : [])])) as ItemId[];
      body = `<div class="bufs"><span class="lbl">${t('stored')}</span>${items || '–'}</div>${dirPicker}
        <div class="lbl">${t('filter')}</div>
        <div class="recipes"><button class="recipe ${!b.recipe ? 'active' : ''}" data-filter="">${t('no_filter')}</button>
        ${filterable.map((k) => `<button class="recipe ${b.recipe === k ? 'active' : ''}" data-filter="${k}">${itemImg(k, 'icon')}<div class="r-name">${tItem(k)}</div></button>`).join('')}</div>`;
    } else if (b.type === 'generator') {
      body = `${statusLine()}<div class="bufs"><span class="lbl">${t('fuel_left')}</span><span class="buf">${itemImg('fuel', 'icon sm')}${b.input?.fuel ?? 0}</span> <span class="buf">${Math.ceil(b.fuelSeconds ?? 0)}s</span></div>${dirPicker}`;
    } else if (b.type === 'core') {
      const parts = Object.entries(SHIP_PARTS)
        .map(([k, n]) => {
          const have = Math.min(n!, st.ship[k as ItemId] ?? 0);
          return `<div class="mrow ${have >= n! ? 'done' : ''}">${itemImg(k as ItemId, 'icon sm')}<span class="mname">${tItem(k as ItemId)}</span><span class="mcount">${have}/${n}</span></div>`;
        })
        .join('');
      const p = Math.round(this.sim.shipProgress() * 100);
      body = `<div class="lbl">${t('ship_progress')} ${p}%</div><div class="pbar big"><div class="pfill" style="width:${p}%"></div></div><div class="mrows">${parts}</div>`;
    } else if (b.type === 'tunnel') {
      body = `${statusLine()}${dirPicker}`;
    } else body = dirPicker;
    return body;
  }

  showInfo(b: Building) {
    const def = BUILDINGS[b.type];
    this.info.innerHTML = `
      <div class="info-head">
        <img src="${buildingUrl(b.type)}" alt="" draggable="false">
        <div class="info-title"><b>${tBuilding(b.type)}</b><small>${tBuildingDesc(b.type)}</small></div>
        <button class="iconbtn" data-act="close">✕</button>
      </div>
      <div class="info-body">${this.infoBody(b)}</div>
      ${b.type !== 'core' ? `<div class="info-actions">
        ${def.rotatable ? `<button class="btn small" data-act="rotate">⟳ ${t('rotate')}</button>` : ''}
        <button class="btn small danger" data-act="remove">✕ ${t('delete')}</button>
      </div>` : ''}`;
    const wasHidden = this.info.classList.contains('hidden');
    this.info.classList.remove('hidden');
    if (wasHidden) {
      this.panelOpenedAt = performance.now();
      const sz = def.size;
      requestAnimationFrame(() => this.ensureVisible(b.x, b.y, sz, sz));
    }
    this.info.onclick = (e) => {
      if (this.panelJustOpened()) return;
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!target) return;
      const recipe = target.dataset.recipe;
      if (recipe) {
        this.sim.setRecipe(b, recipe);
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.filter !== undefined) {
        b.recipe = target.dataset.filter || null;
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.dir !== undefined) {
        this.sim.rotate(b, Number(target.dataset.dir) as Dir);
        this.flashOutput(b);
        sfx.select();
        this.showInfo(b);
        return;
      }
      const act = target.dataset.act;
      if (act === 'close') this.selectBuilding(null);
      else if (act === 'rotate') this.rotateSelected();
      else if (act === 'remove') {
        this.sim.remove(b);
        sfx.remove();
        this.selectBuilding(null);
        this.renderBottom();
      }
    };
  }

  // ---------- Modals ----------

  private openModal(html: string, onClick?: (target: HTMLButtonElement) => void) {
    this.modal.innerHTML = `<div class="modal-card">${html}</div>`;
    this.modal.classList.remove('hidden');
    this.modal.onclick = (e) => {
      if (e.target === this.modal) this.closeModal();
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!target) return;
      if (target.dataset.act === 'close') this.closeModal();
      else onClick?.(target);
    };
  }

  closeModal() {
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
  }

  showHowTo() {
    this.openModal(`<h2>${t('how_to')}</h2><p class="pre">${t('how_to_text')}</p>
      <div class="chain">
        ${itemImg('iron_ore')}→<img class="icon" src="${buildingUrl('smelter')}" alt="">→${itemImg('iron_plate')}→<img class="icon" src="${buildingUrl('printer')}" alt="">→${itemImg('machine_part')}→<img class="icon" src="${buildingUrl('assembler')}" alt="">→${itemImg('steel_frame')}→<img class="icon" src="${buildingUrl('fabricator')}" alt="">→${itemImg('hull_plate')}
      </div>
      <button class="btn primary" data-act="close">${t('ok')}</button>`);
  }

  showMissions() {
    const st = this.sim.state;
    const list = MISSIONS.map((m, i) => {
      const mt = tMission(m.id);
      const state = i < st.missionIndex ? 'done' : i === st.missionIndex ? 'current' : 'future';
      const rows =
        state === 'future'
          ? ''
          : Object.entries(m.deliver)
              .map(([k, n]) => {
                const have = state === 'done' ? n! : Math.min(n!, Math.max(st.delivered[k as ItemId] ?? 0, st.ship[k as ItemId] ?? 0));
                return `<div class="mrow ${have >= n! ? 'done' : ''}">${itemImg(k as ItemId, 'icon sm')}<span class="mname">${tItem(k as ItemId)}</span><span class="mcount">${have}/${n}</span></div>`;
              })
              .join('');
      const unlocks = [...m.unlocks.map((u) => tBuilding(u)), ...m.unlockRecipes.map((r) => tItem(RECIPE_BY_ID[r].output))];
      return `<div class="mission ${state}">
        <div class="mtitle">${state === 'done' ? '✓' : state === 'current' ? '▶' : '○'} ${i + 1}. ${mt.title}</div>
        ${state !== 'future' ? `<p>${mt.text}</p><div class="mrows">${rows}</div>` : ''}
        ${unlocks.length && state !== 'future' ? `<div class="unlocks">${t('unlocked')}: ${unlocks.join(', ')}</div>` : ''}
      </div>`;
    }).join('');
    const tutBtn = st.tutorialStep >= 0 ? `<button class="btn ghost" data-act="skiptut">${t('skip')}: ${t('tutorial_title')}</button>` : '';
    this.openModal(
      `<div class="kora-head"><img src="${uiUrl('kora.webp')}" alt=""><div><b>${t('kora')}</b><small>${t('kora_role')}</small></div></div>
      <h2>${t('missions')}</h2><div class="mission-list">${list}</div>${tutBtn}<button class="btn primary" data-act="close">${t('close')}</button>`,
      (target) => {
        if (target.dataset.act === 'skiptut') {
          st.tutorialStep = -1;
          this.renderer.ping = null;
          this.closeModal();
        }
      },
    );
  }

  showDiagnostics() {
    const probs = this.problems;
    const st = this.sim.state;
    const rows = probs.length
      ? probs
          .slice(0, 40)
          .map((p, i) => {
            const b = p.building;
            const txt = p.status === 'starved' ? `${tStatus('starved')} ${(p.missing ?? []).map((m) => itemImg(m, 'icon xs') + tItem(m)).join(', ')}` : tStatus(p.status);
            return `<div class="prob"><img class="icon sm" src="${buildingUrl(b.type)}" alt=""><span class="pname"><b>${tBuilding(b.type)}</b> ${txt}</span><button class="btn small" data-show="${i}">${t('show')}</button></div>`;
          })
          .join('')
      : `<p class="okline">✓ ${t('all_ok')}</p>`;
    const power = st.powerDemand > st.powerSupply ? `<p class="badline">⚡ ${tStatus('low_power')}: ${st.powerDemand}/${st.powerSupply}</p>` : '';
    this.openModal(
      `<h2>${t('diagnostics')}</h2>${power}<div class="prob-list">${rows}</div>
      <h3>${t('chains')}</h3>
      <div class="chain-grid">${ITEM_ORDER.filter((id) => RECIPES.some((r) => r.output === id && st.unlockedRecipes.includes(r.id))).map((id) => `<button class="chip" data-chain="${id}">${itemImg(id, 'icon xs')} ${tItem(id)}</button>`).join('')}</div>
      <button class="btn primary" data-act="close">${t('close')}</button>`,
      (target) => {
        if (target.dataset.show !== undefined) {
          const p = probs[Number(target.dataset.show)];
          if (p) {
            const sz = BUILDINGS[p.building.type].size;
            this.renderer.centerOn(p.building.x + sz / 2 - 0.5, p.building.y + sz / 2 - 0.5, Math.max(this.renderer.cam.zoom, 1));
            this.selectBuilding(p.building);
            this.renderer.overlay = true;
          }
          this.closeModal();
        } else if (target.dataset.chain) this.showChain(target.dataset.chain as ItemId);
      },
    );
  }

  /** Recursive production tree for an item. */
  showChain(item: ItemId) {
    const st = this.sim.state;
    const tree = (id: ItemId, depth: number, seen: Set<ItemId>): string => {
      const r = RECIPES.find((rc) => rc.output === id);
      const producers = st.buildings.filter((b) => (b.type === 'miner' && b.mineItem === id) || (b.recipe && RECIPE_BY_ID[b.recipe]?.output === id)).length;
      const have = st.inventory[id] ?? 0;
      let line = `<div class="tree-row" style="margin-left:${depth * 18}px">${itemImg(id, 'icon sm')}<b>${tItem(id)}</b>`;
      if (r) line += ` <small>${t('made_in')} <img class="icon xs" src="${buildingUrl(r.machine)}" alt=""> ${tBuilding(r.machine)} · ${r.seconds}s ${r.outputCount > 1 ? '×' + r.outputCount : ''}</small>`;
      else if (Object.values(TERRAIN_ITEM).includes(id)) line += ` <small>${t('mined_from')}</small>`;
      line += `<span class="tree-meta">${producers}× 🏭 · ${have}</span></div>`;
      if (r && !seen.has(id) && depth < 6) {
        seen.add(id);
        for (const k in r.inputs) line += tree(k as ItemId, depth + 1, seen).replace('<div class="tree-row"', `<div class="tree-row" data-n="${r.inputs[k as ItemId]}"`);
      }
      return line;
    };
    this.openModal(`<h2>${t('chain_for')}: ${tItem(item)}</h2><div class="tree">${tree(item, 0, new Set())}</div><button class="btn primary" data-act="close">${t('close')}</button>`);
  }

  showContracts() {
    const st = this.sim.state;
    const list = st.contracts.length
      ? st.contracts
          .map(
            (c) => `<div class="contract ${c.accepted ? 'accepted' : ''}">
          <div class="ctitle">${itemImg(c.item, 'icon')} <b>${t('contract_text', { n: c.amount, item: tItem(c.item), time: fmtTime(c.deadline - st.time) })}</b></div>
          <div class="creward">${t('contract_reward')}: ${Object.entries(c.reward).map(([k, n]) => `${itemImg(k as ItemId, 'icon xs')}${n}`).join(' ')}</div>
          ${c.accepted ? `<div class="pbar big"><div class="pfill" style="width:${(c.delivered / c.amount) * 100}%"></div></div><div class="cmeta">${c.delivered}/${c.amount} · ${t('time_left')} ${fmtTime(c.deadline - st.time)}</div>` : `<div class="cbtns"><button class="btn small primary" data-accept="${c.id}">${t('contract_accept')}</button><button class="btn small" data-decline="${c.id}">${t('contract_decline')}</button></div>`}
        </div>`,
          )
          .join('')
      : `<p>${t('contract_none')}</p>`;
    this.openModal(
      `<div class="kora-head"><img src="${uiUrl('kora.webp')}" alt=""><div><b>${t('kora')}</b><small>${t('contracts')} · ✓ ${st.contractsDone}</small></div></div><div class="contract-list">${list}</div><button class="btn primary" data-act="close">${t('close')}</button>`,
      (target) => {
        const c = st.contracts.find((x) => String(x.id) === (target.dataset.accept ?? target.dataset.decline));
        if (!c) return;
        if (target.dataset.accept) this.sim.acceptContract(c);
        else this.sim.declineContract(c);
        sfx.select();
        this.showContracts();
      },
    );
  }

  showUpgrades() {
    const st = this.sim.state;
    const rows = UPGRADES.map((u) => {
      const lvl = st.upgrades[u.id] ?? 0;
      const cost = this.sim.upgradeCost(u.id);
      const can = this.sim.canUpgrade(u.id);
      return `<div class="upgrade">
        <div class="uname"><b>${tUpgrade(u.id)}</b><small>${t('level')} ${lvl}/${u.maxLevel} · ×${u.factor(lvl).toFixed(2)}</small></div>
        ${cost ? `<div class="ucost">${costHtml(cost, st.inventory)}</div><button class="btn small ${can ? 'primary' : ''}" data-up="${u.id}" ${can ? '' : 'disabled'}>${t('upgrade_buy')}</button>` : `<span class="umax">${t('upgrade_max')}</span>`}
      </div>`;
    }).join('');
    this.openModal(`<h2>${t('upgrades')}</h2><div class="upgrade-list">${rows}</div><button class="btn primary" data-act="close">${t('close')}</button>`, (target) => {
      const id = target.dataset.up as UpgradeId | undefined;
      if (id && this.sim.buyUpgrade(id)) {
        sfx.mission();
        this.renderer.fxUpgrade();
        this.showUpgrades();
      }
    });
  }

  showMenu() {
    const lang = getLang();
    const st = this.sim.state;
    const produced = Object.entries(st.stats.produced)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 8)
      .map(([k, n]) => `<span class="buf">${itemImg(k as ItemId, 'icon xs')}${n}</span>`)
      .join(' ');
    this.openModal(
      `<h2>${t('menu')}</h2>
      <div class="menu-row"><span>${t('language')}</span>
        <span><button class="chip ${lang === 'de' ? 'active' : ''}" data-lang="de">DE</button><button class="chip ${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button></span></div>
      <div class="menu-row"><span>${t('sound')}</span>
        <span><button class="chip ${soundEnabled() ? 'active' : ''}" data-sound="on">${t('on')}</button><button class="chip ${soundEnabled() ? '' : 'active'}" data-sound="off">${t('off')}</button></span></div>
      <div class="menu-row"><span>${t('mode')}</span><span>${st.options.mode === 'story' ? t('mode_story') : t('mode_free')}</span></div>
      <div class="menu-row"><span>${t('seed')}</span><span class="mono">${st.seed}</span></div>
      <div class="menu-row"><span>${t('playtime')}</span><span>${fmtTime(st.time)}</span></div>
      <div class="menu-row"><span>${t('produced')}</span><span class="wrap">${produced || '–'}</span></div>
      <button class="btn" data-act="save">💾 ${t('save')}</button>
      <button class="btn" data-act="howto">${t('how_to')}</button>
      <button class="btn danger" data-act="new">${t('new_game')}</button>
      <button class="btn primary" data-act="close">${t('close')}</button>
      <p class="save-hint">${t('save_hint')}</p>`,
      (target) => {
        if (target.dataset.lang) {
          setLang(target.dataset.lang as Lang);
          this.renderAll();
          this.showMenu();
        } else if (target.dataset.sound) {
          setSound(target.dataset.sound === 'on');
          this.showMenu();
        } else if (target.dataset.act === 'howto') this.showHowTo();
        else if (target.dataset.act === 'save') {
          this.cb.onSave();
          this.toast(`💾 ${t('saved')}`, 1500, 'success');
        } else if (target.dataset.act === 'new') {
          this.closeModal();
          this.cb.onSave();
          this.titleView = 'main';
          this.showTitle();
        }
      },
    );
  }

  showLaunch() {
    const st = this.sim.state;
    this.openModal(
      `<div class="launch">
      <img class="ship" src="${uiUrl('ship.webp')}" alt="">
      <h2>🚀 ${t('launch_title')}</h2>
      <p>${t('launch_text', { time: fmtTime(st.time) })}</p>
      <button class="btn primary" data-act="new">${t('play_again')}</button>
      <button class="btn" data-act="close">${t('keep_playing')}</button>
    </div>`,
      (target) => {
        if (target.dataset.act === 'new') {
          this.closeModal();
          this.titleView = 'main';
          this.showTitle();
        }
      },
    );
  }

  // ---------- Toasts & events ----------

  toast(msg: string, ms = 2200, cls = '') {
    const e = el('div', `toast ${cls}`, msg);
    this.toasts.append(e);
    requestAnimationFrame(() => e.classList.add('show'));
    setTimeout(() => {
      e.classList.remove('show');
      setTimeout(() => e.remove(), 300);
    }, ms);
  }

  missionComplete(index: number) {
    const m = MISSIONS[index];
    const mt = tMission(m.id);
    const unlocks = [...m.unlocks.map((u) => tBuilding(u)), ...m.unlockRecipes.map((r) => tItem(RECIPE_BY_ID[r].output))];
    this.toast(`✓ ${t('mission_done')} <b>${mt.title}</b>${unlocks.length ? `<br><small>${t('unlocked')}: ${unlocks.join(', ')}</small>` : ''}`, 5000, 'success');
    sfx.mission();
    const next = MISSIONS[index + 1];
    const chapter = this.sim.state.options.mode === 'story' ? tChapter(index) : '';
    if (chapter) this.koraSay(chapter, 14);
    if (next) {
      const nt = tMission(next.id);
      setTimeout(() => this.koraSay(nt.text, 20), chapter ? 14000 : 0);
    }
  }

  contractOffer(c: Contract) {
    this.toast(`📋 ${t('contract_new')}: ${t('contract_text', { n: c.amount, item: tItem(c.item), time: fmtTime(c.deadline - this.sim.state.time) })}`, 6000);
    sfx.select();
  }

  contractDone() {
    this.toast(`✓ ${t('contract_done')}`, 4000, 'success');
    sfx.mission();
  }

  contractFailed() {
    this.toast(t('contract_failed'), 3000, 'error');
  }

  storm(on: boolean) {
    this.toast(on ? `🌪 ${t('storm_on')}` : t('storm_off'), 4000, on ? 'error' : '');
  }

  depleted() {
    this.toast(`∅ ${t('depleted')}`, 3500, 'error');
  }

  /** Called ~4x per second. */
  refresh(dt = 0.25) {
    if (this.koraMsgT > 0) this.koraMsgT -= dt;
    this.problems = this.sim.analyze();
    this.tickTutorial();
    this.renderBottom();
    this.renderTop();
    if (this.renderer.selectedTile && !this.info.classList.contains('hidden') && this.sim.state.buildings.length && this.sim.at(this.renderer.selectedTile.x, this.renderer.selectedTile.y)) {
      // a building was placed on the selected tile: switch to its panel
      this.selectBuilding(this.sim.at(this.renderer.selectedTile.x, this.renderer.selectedTile.y));
    }
    if (this.selected) {
      if (!this.sim.state.buildings.includes(this.selected)) this.selectBuilding(null);
      else {
        const bodyEl = this.info.querySelector('.info-body');
        if (bodyEl) {
          const html = this.infoBody(this.selected);
          if (bodyEl.innerHTML !== html) bodyEl.innerHTML = html;
        }
      }
    }
    if (this.minimapOpen) this.renderer.drawMinimap(this.minimap);
  }
}

function hashSeed(s: string): number {
  if (/^\d+$/.test(s)) return parseInt(s, 10) % 2147483647;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
