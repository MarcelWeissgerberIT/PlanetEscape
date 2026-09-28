import { buildingUrl, itemUrl, terrainUrl, uiUrl } from '../game/assets';
import { EXAMPLES } from '../game/examples';
import { BELT_SPACING, BELT_SPEED, BUILDINGS, BUILD_ORDER, ITEMS, ITEM_ORDER, LEVELS, MINE_SECONDS, MISSIONS, MIXER_RATIOS, ORE_PER_TILE, RECIPES, RECIPE_BY_ID, SHIP_PARTS, TERRAIN_ITEM, UPGRADES, VALVE_THRESHOLDS, recipesFor } from '../game/data';
import type { Input, Tool } from '../game/input';
import type { Renderer } from '../game/render';
import { Sim, type Problem } from '../game/sim';
import { ambientEnabled, setAmbient, setSound, sfx, soundEnabled, startAmbient } from '../game/sfx';
import type { Blueprint, Building, BuildingId, Contract, Dir, GameEvent, GameOptions, GameState, ItemId, TerrainId, UpgradeId } from '../game/types';
import { TILE } from '../game/camera';
import { getLang, setLang, t, tBuilding, tBuildingDesc, tChapter, tItem, tMission, tStatus, tStory, tTutorial, tUpgrade, type Lang } from '../i18n';
import { hasSave, load as loadSave, lastDropped, serialize } from '../game/save';
import { SAVE_VERSION } from '../game/world';
import { chaptersUnlocked, loadProgress, recordChapter, recordScore, resumeChapter, starString } from '../game/progress';
import { icon } from './icons';
import { CHIP8_H, CHIP8_W, disasm } from '../game/chip8';
import { CHIP8_PALETTE, CRYSTAL_HZ, MATRIX_SIZES, OSCILLATOR_CRYSTALS, SCREEN_REGION, matrixSize } from '../game/data';
import { VIDEO_CROPS } from '../game/video';
import { CHIP8_PROGRAMS } from '../game/chip8programs';

export interface HudCallbacks {
  onNewGame: (seed: number | undefined, options: GameOptions) => void;
  onContinue: () => void;
  onNextLevel: () => void;
  onSpeed: (speed: number) => void;
  getSpeed: () => number;
  onImport: (state: GameState) => void;
  onSave: () => void;
  onCenter: () => void;
  onPlayChapter: (chapter: number) => void;
  onNewEditor: (w: number, h: number, random: boolean, seed?: number) => void;
  onLoadExample: (id: string) => void;
  onVideo: (b: Building, kind: 'screen' | 'camera' | 'file', file?: File) => Promise<string | null>; // resolves with an error message or null
  onVideoStop: (b: Building) => void;
  videoLive: (b: Building) => 'screen' | 'camera' | 'file' | null;
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
  private koraAction: { label: string; run: () => void } | null = null;
  editor = false;
  private editorTab: 'terrain' | 'build' = 'terrain';
  private paintColor = '#22d3ee'; // LED matrix painter
  private brush = 1;
  private problemSince = new Map<number, number>(); // building id -> game time the problem was first seen
  private powerLowSince = -1;
  private lastHintAt = -1e9;
  private hintedIds = new Map<number, number>(); // building id -> game time of the last hint about it
  private storyIndex = 0;
  private minimapOpen = window.innerWidth > 900;
  private panelOpenedAt = 0;
  private undoStack: { id: number; t: number }[] = [];
  private clipboard: Blueprint | null = null;
  private chainRate = 10;
  toolChip: HTMLElement;
  tip: HTMLElement;
  private tipTimer: number | null = null;
  private tipSuppressClick = false;

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
    const zoomBar = el('div', 'zoom-bar', `<button class="zbtn" data-zoom="in" title="+">+</button><button class="zbtn" data-zoom="out" title="−">−</button><button class="zbtn" data-zoom="fit" title="⌖">${icon('center', 'sm')}</button>`);
    zoomBar.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      e.stopPropagation();
      const cam = this.renderer.cam;
      if (b.dataset.zoom === 'in') cam.zoomAt(cam.width / 2, cam.height / 2, 1.3);
      else if (b.dataset.zoom === 'out') cam.zoomAt(cam.width / 2, cam.height / 2, 1 / 1.3);
      else this.cb.onCenter();
      sfx.select();
    };
    this.minimapBox.append(this.minimap, zoomBar);
    this.toolChip = el('div', 'tool-chip hidden');
    this.tip = el('div', 'tip hidden');
    this.root.append(this.title, this.story, this.top, this.bottom, this.info, this.floating, this.minimapBox, this.toolChip, this.tip, this.modal, this.toasts);
    this.installTips();
    this.installTerminalKeys();
    this.toolChip.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (b?.dataset.act === 'rot') this.input.rotate();
      else if (b?.dataset.act === 'save') this.saveClipboard();
      else this.input.setTool({ kind: 'none' });
    };
    this.renderTitle();
    this.renderBottom();
    this.renderTop();
    // tapping any item icon (outside buttons that use icons as labels) opens its production chain
    this.root.addEventListener('click', (e) => {
      if (this.panelJustOpened()) return;
      const img = (e.target as HTMLElement).closest('img[data-item]') as HTMLImageElement | null;
      if (!img) return;
      if (img.closest('.build-btn, .inv-item, .cost, .upgrade')) return;
      if (img.closest('.recipe') && !img.closest('.r-in')) return; // the output icon selects the recipe
      e.stopPropagation();
      this.showChain(img.dataset.item as ItemId);
    });
    this.minimapBox.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.zoom-bar')) return;
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
    startAmbient();
    this.title.classList.add('hidden');
    this.top.classList.remove('hidden');
    this.bottom.classList.remove('hidden');
    this.minimapBox.classList.toggle('hidden', !this.minimapOpen);
    if (!this.sim.state.introSeen) this.showStory();
  }

  private freeOptions: GameOptions = { mode: 'free', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: true };
  private titleView: 'main' | 'free' | 'playground' = 'main';

  private renderTitle() {
    const lang = getLang();
    const o = this.freeOptions;
    const seedInput = `<div class="seed-row"><input id="seed" type="text" inputmode="numeric" placeholder="${t('seed')}" maxlength="12"></div>`;
    const resume = resumeChapter();
    const mainView = `
        <div class="title-buttons">
          ${hasSave() ? `<button class="btn primary" data-act="continue">${t('continue')}</button>` : ''}
          ${resume > 1
            ? `<button class="btn mode ${hasSave() ? '' : 'primary'}" data-act="story-resume"><b>${t('mode_story')} · ${t('story_resume', { n: resume })}</b><small>${MISSIONS[resume - 1] ? tMission(MISSIONS[resume - 1].id).title + ' · ' : ''}${t('story_resume_desc')}</small></button>
               <button class="btn ghost small-line" data-act="story">${t('story_restart')}</button>`
            : `<button class="btn mode ${hasSave() ? '' : 'primary'}" data-act="story"><b>${t('mode_story')}</b><small>${t('mode_story_desc')}</small></button>`}
          <button class="btn mode" data-act="freeview"><b>${t('mode_free')}</b><small>${t('mode_free_desc')}</small></button>
          <button class="btn mode" data-act="playview"><b>${t('mode_playground')}</b><small>${t('mode_playground_desc')}</small></button>
          ${seedInput}
          <div class="row2">
            <button class="btn ghost" data-act="chapters">${t('chapter_list')} ${this.starsSummary()}</button>
            <button class="btn ghost" data-act="howto">${t('how_to')}</button>
          </div>
          <a class="btn ghost ai-link" href="./ai/">${t('ai_page')} →</a>
        </div>`;
    const playView = `
        <div class="title-buttons">
          <button class="btn mode primary" data-act="editor"><b>✎ ${t('pg_empty')}</b><small>${t('pg_empty_desc')}</small></button>
          <div class="lbl">${t('pg_examples')}</div>
          <div class="examples">
            ${EXAMPLES.map((ex) => `<button class="btn mode example" data-example="${ex.id}"><img class="icon" src="${buildingUrl(ex.icon as BuildingId)}" alt=""><span><b>${ex.title}</b><small>${getLang() === 'de' ? ex.de : ex.en}</small></span></button>`).join('')}
          </div>
          <button class="btn ghost" data-act="back">${t('back')}</button>
        </div>`;
    const opt = (key: keyof GameOptions, label: string, on: boolean) => `<div class="menu-row"><span>${label}</span><span><button class="chip ${on ? 'active' : ''}" data-opt="${key}" data-val="1">${t('on')}</button><button class="chip ${on ? '' : 'active'}" data-opt="${key}" data-val="0">${t('off')}</button></span></div>`;
    const freeView = `
        <div class="title-buttons">
          <div class="menu-row"><span>${t('map_size')}</span><span>${(['small', 'medium', 'large', 'huge', 'giant'] as const).map((sz) => `<button class="chip ${o.mapSize === sz ? 'active' : ''}" data-size="${sz}">${t(`size_${sz}` as 'size_small').split(' ')[0]}</button>`).join('')}</span></div>
          ${opt('infiniteOre', t('infinite_ore'), o.infiniteOre)}
          ${opt('allUnlocked', t('all_unlocked'), o.allUnlocked)}
          ${opt('storms', t('storms_opt'), o.storms)}
          <div class="menu-row"><span>${t('difficulty')}</span><span><button class="chip ${(o.difficulty ?? 'normal') === 'normal' ? 'active' : ''}" data-diff="normal">${t('diff_normal')}</button><button class="chip ${o.difficulty === 'hard' ? 'active' : ''}" data-diff="hard">${t('diff_hard')}</button></span></div>
          ${o.difficulty === 'hard' ? `<p class="save-hint">${t('diff_hard_hint')}</p>` : ''}
          ${seedInput}
          <button class="btn primary" data-act="free">${t('start_free')}</button>
          <button class="btn ghost" data-act="back">${t('back')}</button>
        </div>`;
    this.title.innerHTML = `
      <div class="title-bg" style="background-image:url('${uiUrl('title_bg.webp')}')"></div>
      <div class="title-content">
        <h1 class="logo"><span>PLANET</span><span class="accent">ESCAPE</span></h1>
        <p class="tagline">${t('tagline')}</p>
        ${this.titleView === 'main' ? `<p class="intro">${t('intro')}</p>` : this.titleView === 'playground' ? `<p class="intro"><b>${t('mode_playground')}</b> · ${t('mode_playground_desc')}</p>` : `<p class="intro"><b>${t('mode_free')}</b> · ${t('mode_free_desc')}</p>`}
        ${this.titleView === 'main' ? mainView : this.titleView === 'playground' ? playView : freeView}
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
      if (target.dataset.diff) {
        this.freeOptions.difficulty = target.dataset.diff as 'normal' | 'hard';
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
        const seed = seedOf();
        void this.confirmNewGame().then((yes) => yes && this.cb.onNewGame(seed, { mode: 'story', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: true }));
      } else if (act === 'story-resume') {
        const ch = resumeChapter();
        void this.confirmNewGame().then((yes) => yes && this.cb.onPlayChapter(ch));
      } else if (act === 'freeview') {
        this.titleView = 'free';
        this.renderTitle();
      } else if (act === 'playview') {
        this.titleView = 'playground';
        this.renderTitle();
      } else if (target.closest<HTMLElement>('[data-example]')) {
        const id = target.closest<HTMLElement>('[data-example]')!.dataset.example!;
        void this.confirmNewGame().then((yes) => yes && this.cb.onLoadExample(id));
      } else if (act === 'back') {
        this.titleView = 'main';
        this.renderTitle();
      } else if (act === 'free') {
        const seed = seedOf();
        void this.confirmNewGame().then((yes) => yes && this.cb.onNewGame(seed, { ...this.freeOptions, mode: 'free' }));
      } else if (act === 'howto') this.showHowTo();
      else if (act === 'chapters') this.showChapters();
      else if (act === 'editor') this.showEditorSetup();
    };
  }

  /** Ask before a saved base is thrown away. */
  private confirmNewGame(): Promise<boolean> {
    if (!hasSave()) return Promise.resolve(true);
    return this.confirmModal(t('new_game_confirm'), t('new_game'));
  }

  private starsSummary(): string {
    const p = loadProgress();
    const total = Object.values(p.stars).reduce((a, c) => a + c, 0);
    return total ? `★ ${total}/${LEVELS.length * 3}` : '';
  }

  // ---------- Level editor ----------

  /** Title screen: choose size and start of a new editable map. */
  showEditorSetup() {
    let random = false;
    const render = () => {
      this.openModal(
        `<h2>✎ ${t('pg_empty')}</h2><p>${t('editor_desc')}</p>
        <div class="menu-row"><span>${t('ed_width')}</span><input id="edw" class="text-input num" type="number" min="24" max="320" value="96"></div>
        <div class="menu-row"><span>${t('ed_height')}</span><input id="edh" class="text-input num" type="number" min="24" max="320" value="96"></div>
        <div class="menu-row"><span>${t('ed_start')}</span><span><button class="chip ${random ? '' : 'active'}" data-rand="0">${t('ed_blank')}</button><button class="chip ${random ? 'active' : ''}" data-rand="1">${t('ed_random')}</button></span></div>
        <div class="row2"><button class="btn" data-act="close">${t('cancel')}</button><button class="btn primary" data-act="go">${t('ed_open')}</button></div>`,
        (target) => {
          if (target.dataset.rand !== undefined) {
            random = target.dataset.rand === '1';
            const w = (this.modal.querySelector('#edw') as HTMLInputElement).value, h = (this.modal.querySelector('#edh') as HTMLInputElement).value;
            render();
            (this.modal.querySelector('#edw') as HTMLInputElement).value = w;
            (this.modal.querySelector('#edh') as HTMLInputElement).value = h;
          } else if (target.dataset.act === 'go') {
            const w = Number((this.modal.querySelector('#edw') as HTMLInputElement).value) || 96;
            const h = Number((this.modal.querySelector('#edh') as HTMLInputElement).value) || 96;
            this.closeModal();
            void this.confirmNewGame().then((yes) => yes && this.cb.onNewEditor(w, h, random));
          }
        },
      );
    };
    render();
  }

  setEditor(on: boolean) {
    this.editor = on;
    this.sim.creative = on || this.sim.state.options.mode === 'playground';
    this.editorTab = 'terrain';
    this.input.setTool({ kind: 'none' });
    this.selectBuilding(null);
    this.lastBottomHtml = '';
    this.lastTopHtml = '';
    this.renderBottom();
    this.renderTop();
    this.toast(on ? `✎ ${t('ed_on')}` : `▶ ${t('ed_off')}`, 3500, on ? '' : 'success');
    this.cb.onSave();
  }

  /** Brush stroke from the input layer (paint tool). */
  paintAt(x: number, y: number) {
    if (this.tool.kind !== 'paint' || !this.editor) return;
    if (this.tool.terrain === 'core') {
      if (this.sim.moveCore(x - 1, y - 1)) sfx.select();
      return;
    }
    const changed = this.sim.paintTerrain(x, y, this.tool.terrain, this.tool.brush);
    for (const c of changed) this.renderer.terrainChanged(c.x, c.y);
  }

  /** Editor: the note players see when they load this level. */
  editNote() {
    const n = this.sim.state.note ?? {};
    const lang = getLang();
    this.openModal(
      `<h2>${t('ed_note')}</h2>
      <input id="note-title" class="text-input" type="text" maxlength="40" placeholder="${t('ed_note_title')}" value="${(n.title ?? '').replace(/"/g, '&quot;')}">
      <textarea id="note-text" class="text-input" rows="6" placeholder="${t('ed_note_text')}">${(lang === 'de' ? n.de : n.en) ?? ''}</textarea>
      <div class="row2"><button class="btn" data-act="close">${t('cancel')}</button><button class="btn primary" data-act="savenote">${t('ok')}</button></div>`,
      (target) => {
        if (target.dataset.act === 'savenote') {
          const title = (this.modal.querySelector('#note-title') as HTMLInputElement).value.trim();
          const text = (this.modal.querySelector('#note-text') as HTMLTextAreaElement).value.trim();
          const note = { ...(this.sim.state.note ?? {}), title: title || undefined, [lang]: text || undefined };
          this.sim.state.note = text || note.de || note.en ? note : undefined;
          this.closeModal();
          this.cb.onSave();
        }
      },
    );
  }

  /** Chapter select: replay any chapter reached so far, with stars and best times. */
  showChapters() {
    const p = loadProgress();
    const unlocked = chaptersUnlocked();
    const rows = LEVELS.map((lvl, i) => {
      const m = MISSIONS[i];
      const mt = tMission(m.id);
      const open = i + 1 <= unlocked;
      const stars = p.stars[i] ?? 0;
      const best = p.best[i];
      return `<div class="chapter-row ${open ? '' : 'locked'}">
        <div class="cnum">${i + 1}</div>
        <div class="cbody"><b>${mt.title}</b><small>${lvl.size}×${lvl.size} · ${best !== undefined ? `${t('best_time')} ${fmtTime(best)} · ` : ''}${t('par_time', { time: fmtTime(lvl.par) })}</small></div>
        <div class="cstars ${stars === 3 ? 'gold' : ''}">${starString(stars)}</div>
        <button class="btn small ${open ? 'primary' : ''}" data-chapter="${i + 1}" ${open ? '' : 'disabled'} title="${open ? '' : t('chapter_locked')}">${t('play')}</button>
      </div>`;
    }).join('');
    this.openModal(`<h2>${t('chapter_select')}</h2><div class="chapter-list">${rows}</div><button class="btn primary" data-act="close">${t('close')}</button>`, (target) => {
      const ch = Number(target.dataset.chapter);
      if (ch) void this.confirmNewGame().then((yes) => yes && this.cb.onPlayChapter(ch));
    });
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
      const entries = Object.entries(m.deliver);
      const compact = window.innerWidth < 900;
      const shown = compact ? entries.slice(0, 2) : entries;
      const rows =
        shown
          .map(([k, n]) => {
            const have = Math.min(n!, Math.max(st.delivered[k as ItemId] ?? 0, st.ship[k as ItemId] ?? 0));
            return `<div class="mrow ${have >= n! ? 'done' : ''}">${itemImg(k as ItemId, 'icon sm')}<span class="mname">${tItem(k as ItemId)}</span><span class="mcount">${have}/${n}</span></div>`;
          })
          .join('') + (entries.length > shown.length ? `<div class="mrow more">+${entries.length - shown.length} …</div>` : '');
      const builds = m.build
        ? Object.entries(m.build)
            .map(([k, n]) => {
              const have = Math.min(n!, this.sim.countBuildings(k as BuildingId));
              return `<div class="mrow ${have >= n! ? 'done' : ''}"><img class="icon sm" src="${buildingUrl(k as BuildingId)}" alt=""><span class="mname">${t('build_req')}: ${tBuilding(k)}</span><span class="mcount">${have}/${n}</span></div>`;
            })
            .join('')
        : '';
      body = `<div class="mtitle"><span class="mnum">${st.options.mode === 'story' ? t('chapter') : t('mission')} ${st.missionIndex + 1}/${MISSIONS.length}</span> ${mt.title}</div>
        <div class="mtext">${this.koraMsg && this.koraMsgT > 0 ? this.koraMsg : mt.text}</div>
        ${this.koraMsg && this.koraMsgT > 0 && this.koraAction ? `<div class="mact"><span class="btn small primary" data-act="kora-action">${this.koraAction.label}</span></div>` : ''}
        <div class="mrows">${builds}${rows}</div>`;
    } else body = `<div class="mtitle">🚀 ${t('launch_title')}</div>`;
    if (this.editor) body = `<div class="mtitle"><span class="mnum">✎ ${t('editor')}</span> ${st.width}×${st.height}</div><div class="mtext">${t('ed_hint')}</div>`;
    else if (st.options.mode === 'playground') body = `<div class="mtitle"><span class="mnum">${t('mode_playground')}</span> ${st.width}×${st.height}</div><div class="mtext">${st.note ? (getLang() === 'de' ? st.note.title : st.note.title) + ' · ' : ''}${t('pg_hint')}</div>`;
    if (!tut && m && st.options.mode === 'free') {
      const p = Math.round(this.sim.shipProgress() * 100);
      body += `<div class="mtext">${t('ship_progress')}: ${p}%</div>`;
    }

    const supply = st.powerSupply, demand = st.powerDemand;
    const ratio = demand <= 0 ? 0 : Math.min(1, demand / Math.max(1, supply));
    const low = demand > supply;
    const nProblems = this.problems.length;
    const openContracts = st.contracts.filter((c) => !c.accepted).length;
    const playground = st.options.mode === 'playground' && !tut;
    const topHtml = `
      ${playground && !this.editor ? '' : `<button class="kora-card" data-act="missions">
        <img class="kora-avatar ${tut ? 'talk' : ''}" src="${uiUrl('kora.webp')}" alt="KORA">
        <div class="kora-body">${body}</div>
      </button>`}
      <div class="top-right">
        <div class="power ${low ? 'low' : ''} ${st.storm > 0 ? 'storm' : ''}" title="${t('power')}">
          <span class="plabel">${st.storm > 0 ? icon('storm', 'sm') : icon('bolt', 'sm')} ${demand}/${supply}</span>
          <div class="pbar"><div class="pfill" style="width:${ratio * 100}%"></div></div>
        </div>
        <button class="pill ${nProblems ? 'warn' : 'ok'}" data-act="diag">${nProblems ? `${icon('warn')} ${nProblems}` : icon('check')}</button>
        <button class="iconbtn ${this.cb.getSpeed() === 0 ? 'active' : ''}" data-act="pause" title="${t('pause')} (Space)">${this.cb.getSpeed() === 0 ? icon('play') : icon('pause')}</button>
        <button class="iconbtn speed ${this.cb.getSpeed() > 1 ? 'active' : ''}" data-act="speed" title="${t('speed')} (F)">${this.cb.getSpeed() > 1 ? `<b>${this.cb.getSpeed()}×</b>` : icon('fast')}</button>
        <button class="iconbtn ${this.renderer.overlay ? 'active' : ''}" data-act="overlay" title="${t('overlay')}">${icon('scan')}</button>
        ${playground ? '' : `<button class="iconbtn ${openContracts ? 'badge' : ''}" data-act="contracts" title="${t('contracts')}" data-badge="${openContracts}">${icon('contracts')}</button>
        <button class="iconbtn" data-act="upgrades" title="${t('upgrades')}">${icon('research')}</button>`}
        <button class="iconbtn ${this.minimapOpen ? 'active' : ''}" data-act="minimap" title="${t('minimap')}">${icon('minimap')}</button>
        <button class="iconbtn" data-act="center" title="${t('reset_view')}">${icon('center')}</button>
        <button class="iconbtn" data-act="menu" title="${t('menu')}">${icon('menu')}</button>
      </div>`;
    if (topHtml === this.lastTopHtml) return;
    this.lastTopHtml = topHtml;
    this.top.innerHTML = topHtml;
    this.top.onclick = (e) => {
      const target = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!target) return;
      const act = target.dataset.act;
      if (act === 'kora-action') {
        e.stopPropagation();
        this.koraAction?.run();
      } else if (act === 'missions') this.showMissions();
      else if (act === 'pause') this.togglePause();
      else if (act === 'speed') this.cycleSpeed();
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

  koraSay(msg: string, seconds = 8, action: { label: string; run: () => void } | null = null) {
    this.koraMsg = msg;
    this.koraMsgT = seconds;
    this.koraAction = action;
  }

  /**
   * KORA speaks up on her own when a problem persists: a machine starved or blocked for a while, a jammed
   * belt, or a lasting power shortage. Each hint comes with a "Show" button that jumps to the spot.
   */
  private tickHints() {
    const st = this.sim.state;
    const now = st.time;
    if (st.tutorialStep >= 0 || !st.introSeen || st.launched) return;
    const PERSIST = 40, COOLDOWN = 75, REPEAT = 300;
    const seen = new Set<number>();
    for (const p of this.problems) {
      seen.add(p.building.id);
      if (!this.problemSince.has(p.building.id)) this.problemSince.set(p.building.id, now);
    }
    for (const id of [...this.problemSince.keys()]) if (!seen.has(id)) this.problemSince.delete(id);
    if (st.powerDemand > st.powerSupply) {
      if (this.powerLowSince < 0) this.powerLowSince = now;
    } else this.powerLowSince = -1;
    if (now - this.lastHintAt < COOLDOWN || (this.koraMsgT > 0 && !this.koraAction)) return;
    // power first: it slows everything
    if (this.powerLowSince >= 0 && now - this.powerLowSince > PERSIST && now - (this.hintedIds.get(-1) ?? -1e9) > REPEAT) {
      const pct = Math.round((100 * st.powerSupply) / Math.max(1, st.powerDemand));
      this.hintedIds.set(-1, now);
      this.lastHintAt = now;
      this.koraSay(`⚡ ${t('hint_low_power', { pct })}`, 14, { label: t('upgrades'), run: () => this.showUpgrades() });
      return;
    }
    // the oldest persistent problem
    let best: Problem | null = null, bestT = Infinity;
    for (const p of this.problems) {
      if (p.status === 'low_power') continue;
      const since = this.problemSince.get(p.building.id) ?? now;
      if (now - since < PERSIST) continue;
      if (now - (this.hintedIds.get(p.building.id) ?? -1e9) < REPEAT) continue;
      if (since < bestT) {
        bestT = since;
        best = p;
      }
    }
    if (!best) return;
    const b = best.building;
    const name = tBuilding(b.type);
    const items = (best.missing ?? []).map((m) => tItem(m)).join(', ');
    const key = (`hint_${best.status}`) as 'hint_starved';
    const msg = t(key, { b: name, items });
    this.hintedIds.set(b.id, now);
    this.lastHintAt = now;
    this.koraSay(`💡 ${msg}`, 16, {
      label: t('show'),
      run: () => {
        const sz = BUILDINGS[b.type].size;
        this.renderer.centerOn(b.x + sz / 2 - 0.5, b.y + sz / 2 - 0.5, Math.max(this.renderer.cam.zoom, 1));
        this.selectBuilding(b);
        this.renderer.overlay = true;
        this.koraMsgT = 0;
        this.koraAction = null;
        this.lastTopHtml = '';
        this.renderTop();
      },
    });
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
      const unlocked = this.editor || st.unlockedBuildings.includes(id);
      const affordable = this.editor || this.sim.canAfford(id);
      const active = this.tool.kind === 'build' && this.tool.type === id;
      return `<button class="build-btn ${active ? 'active' : ''} ${unlocked ? '' : 'locked'} ${affordable ? '' : 'poor'} ${hint === id ? 'hint' : ''}" data-build="${id}" ${unlocked ? '' : 'disabled'}>
          <img src="${buildingUrl(id)}" alt="" draggable="false">
          <span class="bname">${tBuilding(id)}</span>
          <span class="bcost">${unlocked ? costHtml(def.cost, inv) : '🔒'}</span>
          ${def.power ? `<span class="bpower ${def.power < 0 ? 'gen' : ''}">⚡${Math.abs(def.power)}</span>` : ''}
        </button>`;
    }).join('');
    const delActive = this.tool.kind === 'delete';
    const paintTool = this.tool.kind === 'paint' ? this.tool : null;
    const terrains: (TerrainId | 'core')[] = ['ground', 'rock', 'iron_ore', 'copper_ore', 'quartz', 'ice', 'oil', 'core'];
    const paletteHtml = terrains
      .map((tr) => {
        const active = paintTool?.terrain === tr;
        const label = tr === 'ground' ? t('ed_ground') : tr === 'rock' ? t('ed_rock') : tr === 'core' ? t('ed_core') : tItem(TERRAIN_ITEM[tr]!);
        const img = tr === 'ground' ? '' : tr === 'core' ? `<img src="${buildingUrl('core')}" alt="" draggable="false">` : `<img src="${terrainUrl(tr)}" alt="" draggable="false">`;
        return `<button class="build-btn ${active ? 'active' : ''} ${tr === 'ground' ? 'ground' : ''}" data-paint="${tr}">${img || '<span class="swatch"></span>'}<span class="bname">${label}</span></button>`;
      })
      .join('');
    const brushHtml = [1, 3, 5, 9].map((b) => `<button class="chip ${this.brush === b ? 'active' : ''}" data-brush="${b}">${b}×${b}</button>`).join('');
    const editorBar = this.editor
      ? `<div class="ed-tabs"><button class="chip ${this.editorTab === 'terrain' ? 'active' : ''}" data-tab="terrain">${t('ed_terrain')}</button><button class="chip ${this.editorTab === 'build' ? 'active' : ''}" data-tab="build">${t('ed_buildings')}</button><span class="ed-badge">✎ ${t('editor')}</span>${this.editorTab === 'terrain' ? `<span class="ed-brush">${t('ed_brush')} ${brushHtml}</span>` : ''}<button class="chip play" data-act="edplay">▶ ${t('ed_play')}</button></div>`
      : '';
    const bottomHtml = `
      ${editorBar}
      <div class="inv-strip">${this.editor ? `<span class="inv-empty">∞ ${t('ed_free')}</span>` : invHtml || `<span class="inv-empty">${t('inventory')}</span>`}</div>
      <div class="build-row">
        <div class="build-bar">${this.editor && this.editorTab === 'terrain' ? paletteHtml : buildHtml}</div>
        <div class="tool-col">
          <button class="iconbtn big" data-act="rotate" title="${t('rotate')} (R)">${icon('rotate')}</button>
          <button class="iconbtn big ${delActive ? 'danger-active' : ''}" data-act="delete" title="${t('delete')} (X)">${icon('close')}</button>
          <button class="iconbtn big ${this.undoStack.length ? '' : 'dim'}" data-act="undo" title="${t('undo')} (Z)">${icon('undo')}</button>
          <button class="iconbtn big ${this.tool.kind === 'select' ? 'active' : ''}" data-act="copy" title="${t('copy')} (C)">${icon('copy')}</button>
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
      if (target.dataset.paint) {
        const tr = target.dataset.paint as TerrainId | 'core';
        if (paintTool?.terrain === tr) this.input.setTool({ kind: 'none' });
        else this.input.setTool({ kind: 'paint', terrain: tr, brush: this.brush });
        this.selectBuilding(null);
        sfx.select();
        return;
      }
      if (target.dataset.brush) {
        this.brush = Number(target.dataset.brush);
        if (paintTool) this.input.setTool({ kind: 'paint', terrain: paintTool.terrain, brush: this.brush });
        this.lastBottomHtml = '';
        this.renderBottom();
        return;
      }
      if (target.dataset.tab) {
        this.editorTab = target.dataset.tab as 'terrain' | 'build';
        this.input.setTool({ kind: 'none' });
        this.lastBottomHtml = '';
        this.renderBottom();
        return;
      }
      if (target.dataset.act === 'edplay') {
        this.setEditor(false);
        return;
      }
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
      } else if (act === 'undo') {
        this.undo();
      } else if (act === 'copy') {
        if (this.tool.kind === 'select') this.input.setTool({ kind: 'none' });
        else if (this.clipboard && this.tool.kind !== 'paste') this.showBlueprints();
        else {
          this.input.setTool({ kind: 'select' });
          this.selectBuilding(null);
          this.toast(t('select_hint'), 3000);
        }
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
    if (tool.kind === 'build') {
      this.toolChip.innerHTML = `<img src="${buildingUrl(tool.type)}" alt=""><span>${t('build')}: <b>${tBuilding(tool.type)}</b> · ${tool.type === 'conveyor' ? t('chip_belt') : t('chip_place')}</span><span class="x">${icon('close', 'sm')}</span>`;
      this.toolChip.classList.remove('hidden');
    } else if (tool.kind === 'delete') {
      this.toolChip.innerHTML = `<span>${t('delete_mode')}</span><span class="x">${icon('close', 'sm')}</span>`;
      this.toolChip.classList.remove('hidden');
    } else if (tool.kind === 'select') {
      this.toolChip.innerHTML = `<span>${icon('copy', 'sm')} ${t('select_hint')}</span><span class="x">${icon('close', 'sm')}</span>`;
      this.toolChip.classList.remove('hidden');
    } else if (tool.kind === 'paint') {
      this.toolChip.innerHTML = `<span>✎ ${tool.terrain === 'core' ? t('ed_core_hint') : t('ed_paint_hint')}</span><span class="x">${icon('close', 'sm')}</span>`;
      this.toolChip.classList.remove('hidden');
    } else if (tool.kind === 'paste') {
      const cost = Sim.blueprintCost(tool.bp);
      this.toolChip.innerHTML = `<span>${icon('blueprint', 'sm')} <b>${tool.bp.name || t('blueprint')}</b> · ${tool.bp.items.length} · ${costHtml(cost, this.sim.state.inventory)}</span><button class="mini" data-act="rot">${icon('rotate', 'sm')}</button><button class="mini" data-act="save">${icon('save', 'sm')}</button><span class="x">${icon('close', 'sm')}</span>`;
      this.toolChip.classList.remove('hidden');
    } else this.toolChip.classList.add('hidden');
  }

  // ---------- Blueprints ----------

  areaSelected(x0: number, y0: number, x1: number, y1: number) {
    const bp = this.sim.capture(x0, y0, x1, y1);
    if (!bp) {
      this.toast(t('bp_empty'), 2000, 'error');
      return;
    }
    this.clipboard = bp;
    sfx.select();
    this.input.setTool({ kind: 'paste', bp });
    this.toast(t('bp_copied', { n: bp.items.length }), 2500, 'success');
  }

  pasteBlueprint(bp: Blueprint, x: number, y: number) {
    const r = this.sim.paste(bp, x, y);
    for (const b of r.placed) this.recordPlacement(b);
    if (r.placed.length) sfx.place();
    if (r.skipped) {
      sfx.error();
      this.toast(`${t('bp_skipped', { n: r.skipped })}${r.reason ? ' · ' + t(r.reason as 'err_cost') : ''}`, 2500, 'error');
    }
    this.input.updateGhost();
  }

  private savedBlueprints(): Blueprint[] {
    try {
      return JSON.parse(localStorage.getItem('pe_blueprints') ?? '[]') as Blueprint[];
    } catch {
      return [];
    }
  }

  private storeBlueprints(list: Blueprint[]) {
    try {
      localStorage.setItem('pe_blueprints', JSON.stringify(list.slice(0, 24)));
    } catch {
      /* ignore */
    }
  }

  saveClipboard() {
    const bp = this.tool.kind === 'paste' ? this.tool.bp : this.clipboard;
    if (!bp) return;
    void this.promptModal(t('bp_name'), bp.name || `${t('blueprint')} ${this.savedBlueprints().length + 1}`).then((name) => {
      if (!name) return;
      const list = this.savedBlueprints().filter((b) => b.name !== name);
      list.unshift({ ...bp, name });
      this.storeBlueprints(list);
      this.toast(`${icon('save', 'sm')} ${t('saved')}: ${name}`, 2000, 'success');
    });
  }

  /** Built-in blueprints: pixel displays made of lamps, with a feed line of switches. */
  private presetBlueprints(): Blueprint[] {
    const grid = (name: string, w: number, h: number): Blueprint => {
      const items: Blueprint['items'] = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) items.push({ type: 'lamp', dx: x, dy: y, dir: 0, recipe: null, mode: 'hold' });
      return { name, w, h, items };
    };
    const ttt: Blueprint = grid(t('preset_ttt'), 3, 3);
    // a switch in front of every lamp column so single items can be steered into cells
    const board: Blueprint = { name: t('preset_ttt'), w: 3, h: 5, items: [...ttt.items.map((i) => ({ ...i, dy: i.dy + 2 })), ...[0, 1, 2].map((x) => ({ type: 'switch' as const, dx: x, dy: 1, dir: 2 as const, recipe: null, open: false })), ...[0, 1, 2].map((x) => ({ type: 'conveyor' as const, dx: x, dy: 0, dir: 2 as const, recipe: null }))] };
    const matrix: Blueprint = { name: t('preset_matrix'), w: 8, h: 4, items: [] };
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) matrix.items.push({ type: 'matrix', dx: x, dy: y, dir: 0, recipe: null });
    const wall: Blueprint = { name: t('preset_wall'), w: 18, h: 8, items: [{ type: 'screen', dx: 0, dy: 0, dir: 0, recipe: null }] };
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) wall.items.push({ type: 'matrix', dx: 2 + x, dy: y, dir: 0, recipe: null, value: 16 });
    return [board, grid(t('preset_display', { w: 5, h: 7 }), 5, 7), grid(t('preset_display', { w: 8, h: 8 }), 8, 8), matrix, wall, this.displayBlueprint()];
  }

  showBlueprints() {
    const list = this.savedBlueprints();
    const presets = this.presetBlueprints();
    const presetRows = presets
      .map((bp, i) => `<div class="prob"><span class="pname"><b>${bp.name}</b><br><small>${bp.items.length} · ${bp.w}×${bp.h} · ${costHtml(Sim.blueprintCost(bp), this.sim.state.inventory)}</small></span><button class="btn small primary" data-preset="${i}">${t('bp_use')}</button></div>`)
      .join('');
    const rows = list
      .map(
        (bp, i) => `<div class="prob"><span class="pname"><b>${bp.name}</b><br><small>${bp.items.length} · ${bp.w}×${bp.h} · ${costHtml(Sim.blueprintCost(bp), this.sim.state.inventory)}</small></span>
        <button class="btn small primary" data-use="${i}">${t('bp_use')}</button><button class="btn small danger" data-del="${i}">${icon('close', 'sm')}</button></div>`,
      )
      .join('');
    this.openModal(
      `<h2>${icon('blueprint', 'sm')} ${t('blueprints')}</h2>
      ${this.clipboard ? `<div class="prob"><span class="pname"><b>${t('bp_clipboard')}</b><br><small>${this.clipboard.items.length} · ${this.clipboard.w}×${this.clipboard.h}</small></span><button class="btn small primary" data-act="useclip">${t('bp_use')}</button><button class="btn small" data-act="saveclip">${icon('save', 'sm')}</button></div>` : ''}
      <div class="prob-list">${rows || `<p>${t('bp_none')}</p>`}</div>
      <h3>${t('presets')}</h3>
      <p class="save-hint">${t('presets_hint')}</p>
      <div class="prob-list">${presetRows}</div>
      <button class="btn" data-act="select">${icon('copy', 'sm')} ${t('copy')}</button>
      <button class="btn primary" data-act="close">${t('close')}</button>`,
      (target) => {
        if (target.dataset.use !== undefined) {
          const bp = list[Number(target.dataset.use)];
          this.clipboard = bp;
          this.closeModal();
          this.input.setTool({ kind: 'paste', bp });
        } else if (target.dataset.preset !== undefined) {
          const bp = presets[Number(target.dataset.preset)];
          this.clipboard = bp;
          this.closeModal();
          this.input.setTool({ kind: 'paste', bp });
        } else if (target.dataset.del !== undefined) {
          list.splice(Number(target.dataset.del), 1);
          this.storeBlueprints(list);
          this.showBlueprints();
        } else if (target.dataset.act === 'useclip' && this.clipboard) {
          this.closeModal();
          this.input.setTool({ kind: 'paste', bp: this.clipboard });
        } else if (target.dataset.act === 'saveclip') {
          this.saveClipboard();
          this.showBlueprints();
        } else if (target.dataset.act === 'select') {
          this.closeModal();
          this.input.setTool({ kind: 'select' });
          this.selectBuilding(null);
        }
      },
    );
  }

  // ---------- Time control ----------

  togglePause() {
    const sp = this.cb.getSpeed();
    this.cb.onSpeed(sp === 0 ? 1 : 0);
    this.toast(sp === 0 ? `${icon('play', 'sm')} ${t('resume')}` : `${icon('pause', 'sm')} ${t('pause')}`, 1200);
    this.lastTopHtml = '';
    this.renderTop();
  }

  cycleSpeed() {
    const sp = this.cb.getSpeed();
    const next = sp === 0 || sp === 3 ? 1 : sp === 1 ? 2 : 3;
    this.cb.onSpeed(next);
    this.toast(`${icon('fast', 'sm')} ${next}×`, 1000);
    this.lastTopHtml = '';
    this.renderTop();
  }

  // ---------- Info panel ----------

  selectBuilding(b: Building | null) {
    this.selected = b;
    this.renderer.selected = b;
    this.input.captureKeys = b?.type === 'terminal';
    this.renderer.selectedTile = null;
    if (b) this.showInfo(b);
    else {
      this.info.classList.add('hidden');
      this.floating.classList.add('hidden');
    }
  }

  /** Has the player ever had this item? Used to mark ingredients that still need a chain. */
  private known(id: ItemId): boolean {
    const st = this.sim.state;
    return (st.inventory[id] ?? 0) > 0 || (st.stats.produced[id] ?? 0) > 0 || (st.stats.delivered[id] ?? 0) > 0;
  }

  recordPlacement(b: Building) {
    this.undoStack.push({ id: b.id, t: performance.now() });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.lastBottomHtml = '';
    this.renderBottom();
  }

  /** Remove the last placement, or the whole belt drag it belonged to. */
  undo() {
    if (!this.undoStack.length) return;
    const last = this.undoStack[this.undoStack.length - 1];
    let n = 0;
    while (this.undoStack.length && last.t - this.undoStack[this.undoStack.length - 1].t < 1500) {
      const e = this.undoStack.pop()!;
      const b = this.sim.byId(e.id);
      if (b && b.type !== 'core') {
        this.sim.remove(b);
        n++;
      }
    }
    if (n) sfx.remove();
    if (this.selected && !this.sim.state.buildings.includes(this.selected)) this.selectBuilding(null);
    this.lastBottomHtml = '';
    this.renderBottom();
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
    if (cam.width >= 900) {
      // wide screens: the panel sits at the side, so the map only moves when the selection is off screen entirely
      if (sx1 < 0 || sx0 > cam.width || sy1 < 0 || sy0 > cam.height) this.renderer.panTo((x + w / 2) * TILE, (y + h / 2) * TILE, cam.width / 2, cam.height / 2);
      return;
    }
    const topH = (this.top.getBoundingClientRect().height || 120) + 16;
    const panel = this.info.getBoundingClientRect();
    const barLimit = cam.height - (this.bottom.getBoundingClientRect().height || 160);
    // the info panel only hides what lies under it: on wide screens it sits bottom right, so a building on the
    // left may stay where it is (panning on every click was annoying)
    const underPanel = !this.info.classList.contains('hidden') && sx1 > panel.left - 8 && sx0 < panel.right + 8;
    const bottomLimit = (underPanel ? Math.min(panel.top, barLimit) : barLimit) - 12;
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
        <button class="iconbtn" data-act="close">${icon('close')}</button>
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
      this.floating.innerHTML = `<button class="fab" title="${t('rotate')}">${icon('rotate')}</button>`;
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
            <div class="r-in">${Object.entries(rc.inputs).map(([k, n]) => `<span class="${this.known(k as ItemId) ? '' : 'unknown'}">${itemImg(k as ItemId, 'icon xs')}${n}</span>`).join(' ')}</div>
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
      body = st.options.mode === 'playground'
        ? `<p class="save-hint">${t('core_playground')}</p>`
        : `<div class="lbl">${t('ship_progress')} ${p}%</div><div class="pbar big"><div class="pfill" style="width:${p}%"></div></div><div class="mrows">${parts}</div>`;
    } else if (b.type === 'terminal') {
      const cpu = this.sim.cpu(b);
      const errs = this.sim.cpuErrorsOf(b);
      const keys = ['1', '2', '3', 'C', '4', '5', '6', 'D', '7', '8', '9', 'E', 'A', '0', 'B', 'F'];
      const state = errs.length ? `<span class="bad">${t('term_error')}</span>` : cpu?.halted ? `<span class="bad">${t('term_halted')}: ${cpu.halted}</span>` : b.run ? `<span class="okline">${t('term_running')}</span>` : t('term_paused');
      const switches = this.sim.terminalSwitches(b);
      const items: ItemId[] = ['copper_wire', 'iron_plate', 'copper_plate', 'glass', 'circuit', 'quartz'];
      const mem = this.sim.terminalMemory(b);
      const cr = this.sim.terminalCrystals(b);
      const crystals = cr.quartz + cr.glass;
      const parts = `<div class="term-parts">
          <div class="tp"><span>${itemImg('circuit', 'icon xs')} ${t('term_ram')}</span><b class="${mem.have < mem.need ? 'bad' : ''}">${mem.have} B</b><small>${t('term_ram_detail', { c: mem.cells, k: mem.banks, b: mem.need })}</small></div>
          <div class="tp"><span>${itemImg('quartz', 'icon xs')} ${t('term_clock')}</span><b class="${crystals ? '' : 'bad'}">${this.sim.terminalHz(b)} Hz</b><small>${t('term_clock_detail', { q: cr.quartz, g: cr.glass })} · ${t('term_clock_hint')}</small></div>
          ${this.editor ? `<button class="btn small" data-act="term-install">${t('term_install')}</button>` : ''}
        </div>`;
      body = `<canvas class="term-screen" id="term-screen" width="${CHIP8_W * 4}" height="${CHIP8_H * 4}"></canvas>
        <div class="lbl">${state}</div>
        ${parts}
        <div class="term-btns">
          <button class="btn small ${b.run ? '' : 'primary'}" data-act="term-run">${b.run ? '⏸ ' + t('pause') : '▶ ' + t('term_start')}</button>
          <button class="btn small" data-act="term-reset">${icon('rotate', 'sm')} ${t('term_reset')}</button>
          <button class="btn small" data-act="term-edit">✎ ${t('term_program')}</button>
          <button class="btn small ${b.trace ? 'primary' : ''}" data-act="term-trace">${t('term_trace')}</button>
          <button class="btn small" data-act="term-step" ${b.run ? 'disabled' : ''}>${t('term_step')}</button>
        </div>
        <div class="cpu-state" id="cpu-state">${this.cpuStateHtml(b)}</div>
        <div class="keypad">${keys.map((k) => `<button class="key" data-key="${parseInt(k, 16)}">${k}</button>`).join('')}</div>
        <p class="save-hint">${t('term_keys_hint')}${switches.length ? ` · ${t('term_switches', { n: switches.length })}` : ''}</p>
        <div class="dirs"><span class="lbl">${t('term_pixel_item')}</span>${items.map((k) => `<button class="chip ${(b.recipe ?? 'copper_wire') === k ? 'active' : ''}" data-filter="${k}">${itemImg(k, 'icon xs')}</button>`).join('')}</div>
        <p class="save-hint">${t('term_display_hint')}</p>
        <button class="btn small" data-act="term-display">${icon('blueprint', 'sm')} ${t('term_display_bp')}</button>`;
    } else if (b.type === 'register' || b.type === 'adder' || b.type === 'subtractor' || b.type === 'multiplier' || b.type === 'divider') {
      const val = b.value ?? 0;
      const held = b.recipe ? itemImg(b.recipe as ItemId, 'icon xs') : '';
      const cellOf = b.type === 'register' ? st.buildings.map((tb) => (tb.type === 'terminal' ? { tb, i: this.sim.board(tb).cells.indexOf(b) } : null)).find((c) => c && c.i >= 0) : null;
      const addr = cellOf ? ` <small>· ${t('ram_cell', { a: '0x' + (0x200 + cellOf.i).toString(16).toUpperCase() })}</small>` : '';
      const big = b.type === 'register' ? `${held} <b class="num">${val}</b>${addr}` : b.type === 'multiplier' ? `<b class="num">× ${val}</b>` : b.type === 'divider' ? `<b class="num">÷ ${val}</b>` : b.type === 'subtractor' ? `<b class="num">−${b.debt ?? 0}</b> <small>${t('arith_pending')}</small>` : `<b class="num">${b.acc ?? 0}</b> <small>${t('arith_total')}</small>`;
      const factor = b.type === 'multiplier' || b.type === 'divider' ? `<div class="dirs wrap"><span class="lbl">${t('arith_factor')}</span>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<button class="chip ${val === k ? 'active' : ''}" data-value="${k}">${k}</button>`).join('')}</div>` : '';
      body = `<div class="arith-val">${big}${b.bufL?.length ? ` <small>· ${t('arith_queue', { n: b.bufL.length })}</small>` : ''}</div>
        <p class="save-hint">${t(`arith_${b.type}` as 'arith_register')}</p>${factor}
        <div class="term-btns"><button class="btn small" data-act="arith-clear">${t('lamp_clear')}</button></div>${dirPicker}`;
    } else if (b.type === 'tunnel') {
      body = `${statusLine()}${dirPicker}`;
    } else if (def.kind === 'logic') {
      const known = ITEM_ORDER.filter((id) => (st.inventory[id] ?? 0) > 0 || st.stats.produced[id] || RECIPES.some((r) => r.output === id && st.unlockedRecipes.includes(r.id)) || TERRAIN_ITEM[st.terrain[0]] === id || ['iron_ore', 'copper_ore', 'quartz', 'ice', 'oil'].includes(id));
      const picker = (label: string) => `<div class="lbl">${label}</div><div class="recipes"><button class="recipe ${!b.recipe ? 'active' : ''}" data-filter="">${t('any_item')}</button>${known.map((k) => `<button class="recipe ${b.recipe === k ? 'active' : ''}" data-filter="${k}">${itemImg(k, 'icon')}<div class="r-name">${tItem(k)}</div></button>`).join('')}</div>`;
      if (b.type === 'sorter') body = `${statusLine()}${dirPicker}${picker(t('sort_item'))}`;
      else if (b.type === 'lamp') {
        const item = this.sim.lampItem(b);
        body = `<div class="lbl">${t('lamp_state')}</div><div class="bufs">${item ? `${itemImg(item, 'icon')} <b>${tItem(item)}</b> <button class="btn small" data-act="clear">${t('lamp_clear')}</button>` : `<span class="dim">${t('lamp_off')}</span>`}</div>
          <div class="dirs"><span class="lbl">${t('lamp_mode')}</span><button class="chip ${(b.mode ?? 'hold') === 'hold' ? 'active' : ''}" data-mode="hold">${t('lamp_hold')}</button><button class="chip ${b.mode === 'pass' ? 'active' : ''}" data-mode="pass">${t('lamp_pass')}</button></div>
          ${b.mode === 'pass' ? dirPicker : ''}${picker(t('lamp_filter'))}`;
      } else if (b.type === 'screen') {
        const live = this.cb.videoLive(b);
        const r = this.sim.screenRect(b);
        const k = Math.max(1, Math.min(4, b.value ?? 1));
        body = `<div class="lbl">${live ? `<span class="okline">● ${t('vid_live')} · ${t(`vid_${live}` as 'vid_screen')}</span>` : `<span class="dim">○ ${t('vid_idle')}</span>`}</div>
          <div class="term-btns">
            <button class="btn small ${live === 'screen' ? 'primary' : ''}" data-act="vid-screen">${t('vid_screen')}</button>
            <button class="btn small ${live === 'camera' ? 'primary' : ''}" data-act="vid-camera">${t('vid_camera')}</button>
            <button class="btn small ${live === 'file' ? 'primary' : ''}" data-act="vid-file">${t('vid_file')}</button>
            ${live ? `<button class="btn small" data-act="vid-stop">■ ${t('vid_stop')}</button>` : ''}
            <input id="vidfile" class="file-hidden" type="file" accept="video/*">
          </div>
          <div class="dirs"><span class="lbl">${t('vid_size')}</span>${[1, 2, 3, 4].map((n) => `<button class="chip ${k === n ? 'active' : ''}" data-value="${n}">${8 * n}×${4 * n}</button>`).join('')}<small class="dim"> · ${r.w}×${r.h} px</small></div>
          <div class="dirs"><span class="lbl">${t('vid_crop')}</span>${VIDEO_CROPS.map((c, i) => `<button class="chip ${(b.ratio ?? 0) === i ? 'active' : ''}" data-crop="${i}">${c === 1 ? t('vid_fit') : c + '×'}</button>`).join('')}</div>
          <div class="dirs wrap"><span class="lbl">${t('vid_density')}</span>${MATRIX_SIZES.map((n) => `<button class="chip ${r.w / (SCREEN_REGION.w * k) === n ? 'active' : ''}" data-mxall="${n}">${n}×${n}</button>`).join('')}</div>
          <p class="save-hint">${t('vid_hint')}</p>`;
      } else if (b.type === 'matrix') {
        const s = matrixSize(b);
        const px = b.px ?? [];
        const painter = s <= 16
          ? `<div class="mx-grid" style="grid-template-columns:repeat(${s},1fr);gap:${s > 8 ? 2 : 3}px">${Array.from({ length: s * s }, (_, i) => `<button class="mx-cell" data-px="${i}" style="background:${px[i] ? '#' + px[i].toString(16).padStart(6, '0') : 'rgba(255,255,255,0.08)'}"></button>`).join('')}</div>
          <div class="dirs"><span class="lbl">${t('mx_color')}</span><input type="color" id="mxcolor" value="${this.paintColor}"><button class="chip" data-act="mx-fill">${t('mx_fill')}</button><button class="chip" data-act="clear">${t('lamp_clear')}</button></div>`
          : `<p class="save-hint">${t('mx_big')}</p><div class="term-btns"><button class="btn small" data-act="clear">${t('lamp_clear')}</button></div>`;
        body = `<div class="dirs wrap"><span class="lbl">${t('mx_size')}</span>${MATRIX_SIZES.map((n) => `<button class="chip ${s === n ? 'active' : ''}" data-mxsize="${n}">${n}×${n}</button>`).join('')}</div>
          ${painter}
          <p class="save-hint">${t('matrix_hint')}</p>`;
      } else if (b.type === 'oscillator') {
        const q = b.clock ?? 0, g = b.turbo ?? 0;
        body = `${statusLine()}<div class="arith-val">${itemImg('quartz', 'icon xs')} <b class="num">${q}</b> ${itemImg('glass', 'icon xs')} <b class="num">${g}</b> <small>· ${q + g}/${OSCILLATOR_CRYSTALS} · ${q * CRYSTAL_HZ.quartz + g * CRYSTAL_HZ.glass} Hz</small></div><p class="save-hint">${t('oscillator_hint')}</p>`;
      } else if (b.type === 'bus') {
        body = `<p class="save-hint">${t('bus_hint')}</p>`;
      } else if (b.type === 'switch') {
        body = `<div class="lbl">${b.open === false ? t('switch_off') : t('switch_on')}</div><div class="dirs"><span class="lbl">${t('switch_state')}</span><button class="chip ${b.open !== false ? 'active' : ''}" data-open="1">${t('switch_on')}</button><button class="chip ${b.open === false ? 'active' : ''}" data-open="0">${t('switch_off')}</button></div>
          <div class="dirs"><span class="lbl">${t('switch_pulse')}</span><button class="chip ${b.mode === 'pulse' ? 'active' : ''}" data-mode="pulse">${t('on')}</button><button class="chip ${b.mode !== 'pulse' ? 'active' : ''}" data-mode="hold">${t('off')}</button></div>
          <p class="save-hint">${t('switch_hint')}</p>
          ${st.buildings.some((tb) => tb.type === 'terminal' && this.sim.terminalSwitches(tb).some((x) => x.sw === b)) ? `<div class="dirs wrap"><span class="lbl">${t('switch_key')}</span>${[1, 2, 3, 0xc, 4, 5, 6, 0xd, 7, 8, 9, 0xe, 0xa, 0, 0xb, 0xf].map((k) => `<button class="chip ${b.threshold === k ? 'active' : ''}" data-threshold="${k}">${k.toString(16).toUpperCase()}</button>`).join('')}</div>` : ''}${dirPicker}`;
      }
      else if (b.type === 'valve') {
        const have = b.recipe ? (st.inventory[b.recipe as ItemId] ?? 0) : 0;
        body = `${statusLine(b.recipe ? ` · ${have}/${b.threshold ?? 50}` : '')}${dirPicker}${picker(t('watch_item'))}
          <div class="dirs"><span class="lbl">${t('threshold')}</span>${VALVE_THRESHOLDS.map((n) => `<button class="chip ${(b.threshold ?? 50) === n ? 'active' : ''}" data-threshold="${n}">${n}</button>`).join('')}</div>`;
      } else if (b.type === 'mixer') {
        body = `${statusLine()}<div class="bufs"><span class="lbl">◀</span>${(b.bufL ?? []).map((k) => itemImg(k, 'icon sm')).join('') || '–'}<span class="lbl">▶</span>${(b.bufR ?? []).map((k) => itemImg(k, 'icon sm')).join('') || '–'}</div>${dirPicker}
          <div class="dirs"><span class="lbl">${t('ratio')}</span>${MIXER_RATIOS.map((r, i) => `<button class="chip ${(b.ratio ?? 0) === i ? 'active' : ''}" data-ratio="${i}">${r[0]}:${r[1]}</button>`).join('')}</div>`;
      } else body = `${statusLine()}${dirPicker}`;
    } else body = dirPicker;
    return body;
  }

  /** 64x32 lamps: the display a terminal drives. */
  private displayBlueprint(): Blueprint {
    const items: Blueprint['items'] = [];
    for (let y = 0; y < CHIP8_H; y++) for (let x = 0; x < CHIP8_W; x++) items.push({ type: 'lamp', dx: x, dy: y, dir: 0, recipe: null, mode: 'hold' });
    return { name: `${t('preset_display', { w: CHIP8_W, h: CHIP8_H })}`, w: CHIP8_W, h: CHIP8_H, items };
  }

  /** PC, current instruction and registers of a terminal's CPU. */
  private cpuStateHtml(b: Building): string {
    const cpu = this.sim.cpu(b);
    if (!cpu) return '';
    const op = (cpu.mem[cpu.pc] << 8) | cpu.mem[cpu.pc + 1];
    const hx = (v: number, w: number) => v.toString(16).toUpperCase().padStart(w, '0');
    const regs = Array.from(cpu.v).map((v, i) => `<span><small>V${i.toString(16).toUpperCase()}</small>${hx(v, 2)}</span>`).join('');
    return `<div class="cpu-line"><span><small>PC</small>${hx(cpu.pc, 3)}</span><span><small>OP</small>${hx(op, 4)}</span><span class="mn">${disasm(op)}</span><span><small>I</small>${hx(cpu.i, 3)}</span><span><small>DT</small>${cpu.dt}</span><span><small>${t('term_cycles')}</small>${cpu.cycles}</span></div><div class="cpu-regs">${regs}</div>`;
  }

  /** Draw the selected terminal's screen into the panel canvas (called from refresh). */
  private drawTerminalScreen(b: Building) {
    const canvas = this.info.querySelector('#term-screen') as HTMLCanvasElement | null;
    const cpu = this.sim.cpu(b);
    if (!canvas || !cpu) return;
    const frame = this.sim.cpuFrameOf(b);
    if ((canvas as unknown as { _f?: number })._f === frame) return;
    (canvas as unknown as { _f?: number })._f = frame;
    const c2 = canvas.getContext('2d')!;
    c2.fillStyle = '#04141a';
    c2.fillRect(0, 0, canvas.width, canvas.height);
    const own = ITEMS[(b.recipe as ItemId) ?? 'copper_wire'].color;
    const px = canvas.width / CHIP8_W, py = canvas.height / CHIP8_H;
    for (let y = 0; y < CHIP8_H; y++)
      for (let x = 0; x < CHIP8_W; x++) {
        const v = cpu.display[y * CHIP8_W + x] & 15;
        if (!v) continue;
        const it = CHIP8_PALETTE[v];
        c2.fillStyle = it ? ITEMS[it].color : own;
        c2.fillRect(x * px, y * py, px - 0.5, py - 0.5);
      }
  }

  private installTerminalKeys() {
    const map: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 0xc, q: 4, w: 5, e: 6, r: 0xd, a: 7, s: 8, d: 9, f: 0xe, z: 0xa, y: 0xa, x: 0, c: 0xb, v: 0xf };
    const handler = (down: boolean) => (e: KeyboardEvent) => {
      const b = this.selected;
      if (!b || b.type !== 'terminal') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = map[e.key.toLowerCase()];
      if (k === undefined) return;
      e.preventDefault();
      this.sim.terminalKey(b, k, down);
    };
    window.addEventListener('keydown', handler(true));
    window.addEventListener('keyup', handler(false));
    // on-screen keypad: press while held
    const keyOf = (e: Event) => (e.target as HTMLElement).closest('.key') as HTMLElement | null;
    this.info.addEventListener('pointerdown', (e) => {
      const k = keyOf(e);
      if (!k || !this.selected || this.selected.type !== 'terminal') return;
      e.preventDefault();
      this.sim.terminalKey(this.selected, Number(k.dataset.key), true);
      k.classList.add('down');
    });
    const up = (e: Event) => {
      const b = this.selected;
      if (!b || b.type !== 'terminal') return;
      this.info.querySelectorAll('.key.down').forEach((k) => {
        k.classList.remove('down');
        this.sim.terminalKey(b, Number((k as HTMLElement).dataset.key), false);
      });
      void e;
    };
    this.info.addEventListener('pointerup', up);
    this.info.addEventListener('pointercancel', up);
    this.info.addEventListener('pointerleave', up);
  }

  /** Program editor: assembly source, built-in programs, assemble & run. */
  showProgramEditor(b: Building) {
    const src = b.prog ?? CHIP8_PROGRAMS[0].source;
    const errs = this.sim.cpuErrorsOf(b);
    this.openModal(
      `<h2>✎ ${t('term_program')}</h2>
      <div class="chips" style="margin-bottom:8px">${CHIP8_PROGRAMS.map((p) => `<button class="chip" data-prog="${p.id}">${p.name}</button>`).join('')}<button class="chip" data-act="term-help">?</button></div>
      <textarea id="prog-src" class="text-input code" rows="14" spellcheck="false">${src.replace(/</g, '&lt;')}</textarea>
      <div class="asm-errors ${errs.length ? '' : 'hidden'}" id="asm-errors">${errs.slice(0, 6).map((e) => `<div>${e}</div>`).join('')}</div>
      <div class="row2"><button class="btn" data-act="close">${t('cancel')}</button><button class="btn primary" data-act="term-assemble">▶ ${t('term_assemble')}</button></div>`,
      (target) => {
        const ta = this.modal.querySelector('#prog-src') as HTMLTextAreaElement;
        if (target.dataset.prog) {
          const p = CHIP8_PROGRAMS.find((x) => x.id === target.dataset.prog);
          if (p) ta.value = p.source;
        } else if (target.dataset.act === 'term-help') {
          this.toast(t('term_help'), 9000);
        } else if (target.dataset.act === 'term-assemble') {
          const errors = this.sim.setProgram(b, ta.value);
          const box = this.modal.querySelector('#asm-errors') as HTMLElement;
          if (errors.length) {
            box.innerHTML = errors.slice(0, 6).map((e) => `<div>${e}</div>`).join('');
            box.classList.remove('hidden');
            sfx.error();
          } else {
            this.closeModal();
            sfx.mission();
            this.showInfo(b);
          }
        }
      },
    );
  }

  showInfo(b: Building) {
    const def = BUILDINGS[b.type];
    this.info.innerHTML = `
      <div class="info-head">
        <img src="${buildingUrl(b.type)}" alt="" draggable="false">
        <div class="info-title"><b>${tBuilding(b.type)}</b><small>${tBuildingDesc(b.type)}</small></div>
        <button class="iconbtn" data-act="close">${icon('close')}</button>
      </div>
      <div class="info-body">${this.infoBody(b)}</div>
      ${b.type !== 'core' ? `<div class="info-actions">
        ${def.rotatable ? `<button class="btn small" data-act="rotate">${icon('rotate', 'sm')} ${t('rotate')}</button>` : ''}
        ${this.sim.state.unlockedBuildings.includes(b.type) ? `<button class="btn small" data-act="pick" title="Q">${icon('pipette', 'sm')} ${t('pipette')}</button>` : ''}
        <button class="btn small danger" data-act="remove">${b.status === 'depleted' ? icon('rotate', 'sm') + ' ' + t('recycle') : icon('close', 'sm') + ' ' + t('delete')}</button>
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
      if (target.dataset.threshold !== undefined) {
        b.threshold = Number(target.dataset.threshold);
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.ratio !== undefined) {
        b.ratio = Number(target.dataset.ratio);
        b.rr = 0;
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.mode !== undefined) {
        b.mode = target.dataset.mode as 'hold' | 'pass' | 'pulse';
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.open !== undefined) {
        b.open = target.dataset.open === '1';
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.act === 'term-install' && b.type === 'terminal') {
        this.sim.installAll(b);
        sfx.mission();
        this.showInfo(b);
        return;
      }
      if (target.dataset.act === 'arith-clear' && b.value !== undefined) {
        if (b.type === 'register') {
          const n = b.value ?? 0;
          if (n && b.recipe) this.sim.addInv(b.recipe as ItemId, n);
          b.value = 0;
        } else b.acc = 0;
        b.debt = 0;
        b.bufL = [];
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.value !== undefined) {
        b.value = Number(target.dataset.value);
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.act === 'term-trace' && b.type === 'terminal') {
        b.trace = !b.trace;
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.act === 'term-step' && b.type === 'terminal') {
        this.sim.stepTerminal(b);
        sfx.select();
        const el = this.info.querySelector('#cpu-state');
        if (el) el.innerHTML = this.cpuStateHtml(b);
        return;
      }
      if (target.dataset.act === 'term-run' && b.type === 'terminal') {
        b.run = !b.run;
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.act === 'term-reset' && b.type === 'terminal') {
        this.sim.resetTerminal(b);
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.act === 'term-edit' && b.type === 'terminal') {
        this.showProgramEditor(b);
        return;
      }
      if (target.dataset.act === 'term-display' && b.type === 'terminal') {
        const bp = this.displayBlueprint();
        this.clipboard = bp;
        this.input.setTool({ kind: 'paste', bp });
        const r = this.sim.terminalDisplayRect(b);
        this.toast(t('term_display_paste', { x: r.x, y: r.y }), 5000);
        return;
      }
      if (b.type === 'screen' && target.dataset.act?.startsWith('vid-')) {
        const act = target.dataset.act.slice(4);
        if (act === 'stop') {
          this.cb.onVideoStop(b);
          this.showInfo(b);
        } else if (act === 'file') {
          const input = this.info.querySelector('#vidfile') as HTMLInputElement | null;
          if (!input) return;
          input.onchange = () => {
            const f = input.files?.[0];
            if (f) void this.cb.onVideo(b, 'file', f).then((err) => (err ? this.toast(`⚠ ${err}`, 5000, 'error') : this.showInfo(b)));
          };
          input.click();
        } else {
          void this.cb.onVideo(b, act as 'screen' | 'camera').then((err) => (err ? this.toast(`⚠ ${err}`, 5000, 'error') : this.showInfo(b)));
        }
        sfx.select();
        return;
      }
      if (b.type === 'screen' && target.dataset.mxall !== undefined) {
        // switch every matrix of the wall to this resolution
        const n = Number(target.dataset.mxall);
        const k = Math.max(1, Math.min(4, b.value ?? 1));
        for (let my = 0; my < SCREEN_REGION.h * k; my++)
          for (let mx = 0; mx < SCREEN_REGION.w * k; mx++) {
            const m = this.sim.at(b.x + SCREEN_REGION.dx + mx, b.y + my);
            if (m?.type !== 'matrix') continue;
            m.value = n === 8 ? undefined : n;
            m.px = undefined;
            m.acc = (m.acc ?? 0) + 1;
          }
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (b.type === 'screen' && target.dataset.crop !== undefined) {
        b.ratio = Number(target.dataset.crop);
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (b.type === 'screen' && target.dataset.value !== undefined) {
        b.value = Number(target.dataset.value);
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.act === 'clear' && (b.type === 'lamp' || b.type === 'matrix')) {
        this.sim.clearLamp(b);
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (b.type === 'matrix' && target.dataset.mxsize !== undefined) {
        b.value = Number(target.dataset.mxsize) === 8 ? undefined : Number(target.dataset.mxsize);
        b.px = undefined;
        b.acc = (b.acc ?? 0) + 1;
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (b.type === 'matrix' && (target.dataset.px !== undefined || target.dataset.act === 'mx-fill')) {
        const input = this.info.querySelector('#mxcolor') as HTMLInputElement | null;
        if (input) this.paintColor = input.value;
        const rgb = parseInt(this.paintColor.replace('#', ''), 16) || 0;
        const s = matrixSize(b);
        const px = b.px && b.px.length === s * s ? b.px : (b.px = new Array<number>(s * s).fill(0));
        b.acc = (b.acc ?? 0) + 1;
        if (target.dataset.act === 'mx-fill') px.fill(rgb);
        else {
          const i = Number(target.dataset.px);
          px[i] = px[i] === rgb ? 0 : rgb; // same colour again = off
        }
        sfx.select();
        const cell = target.dataset.px !== undefined ? (target as HTMLElement) : null;
        if (cell) cell.style.background = px[Number(cell.dataset.px)] ? this.paintColor : 'rgba(255,255,255,0.08)';
        else this.showInfo(b);
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
      else if (act === 'pick') {
        this.input.pickTool(b);
        this.selectBuilding(null);
        sfx.select();
      } else if (act === 'rotate') this.rotateSelected();
      else if (act === 'remove') {
        this.sim.remove(b);
        sfx.remove();
        this.selectBuilding(null);
        this.renderBottom();
      }
    };
  }

  // ---------- Modals ----------

  /** A note the author of a shared save left (how to play it). */
  showNote() {
    const n = this.sim.state.note;
    if (!n) return;
    const text = (getLang() === 'de' ? n.de : n.en) ?? n.en ?? n.de ?? '';
    this.openModal(
      `<div class="kora-head"><img src="${uiUrl('kora.webp')}" alt=""><div><b>${t('kora')}</b><small>${n.title ?? t('save_note')}</small></div></div>
      <p style="white-space:pre-line">${text}</p>
      <button class="btn primary" data-act="close">${t('ok')}</button>`,
    );
  }

  // ---------- Explanations: hover (mouse) or long press (touch) on a build button / inventory item ----------

  private installTips() {
    const target = (e: Event) => (e.target as HTMLElement).closest('.build-btn, .inv-item') as HTMLElement | null;
    const clear = () => {
      if (this.tipTimer) clearTimeout(this.tipTimer);
      this.tipTimer = null;
    };
    this.bottom.addEventListener('pointerdown', (e) => {
      const b = target(e);
      clear();
      if (!b || e.pointerType === 'mouse') return;
      this.tipTimer = window.setTimeout(() => {
        this.tipSuppressClick = true;
        this.showTip(b);
        if (navigator.vibrate) navigator.vibrate(12);
      }, 700);
    });
    this.bottom.addEventListener('pointerover', (e) => {
      const b = target(e);
      if (!b || e.pointerType !== 'mouse') return;
      clear();
      this.tipTimer = window.setTimeout(() => this.showTip(b), 550);
    });
    this.bottom.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse') return;
      clear();
      this.hideTip();
    });
    // pointercancel is not in this list: Chrome cancels the pointer on a long press (context menu), which is exactly the gesture we want
    for (const ev of ['pointerup', 'pointerleave']) this.bottom.addEventListener(ev, () => clear());
    this.bottom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.bottom.addEventListener('scroll', () => clear(), true);
    // the tap that follows a long press must not select the tool; any other tap closes the tip
    this.bottom.addEventListener('click', (e) => {
      if (this.tipSuppressClick) {
        e.stopPropagation();
        e.preventDefault();
        this.tipSuppressClick = false;
        return;
      }
      this.hideTip();
    }, true);
    this.root.addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement).closest('.tip')) this.hideTip();
    }, true);
    this.tip.onclick = (e) => {
      const c = (e.target as HTMLElement).closest('[data-chain]') as HTMLElement | null;
      if (c) {
        this.hideTip();
        this.showChain(c.dataset.chain as ItemId);
      }
    };
  }

  private showTip(btn: HTMLElement) {
    const build = btn.dataset.build as BuildingId | undefined;
    const item = btn.dataset.chain as ItemId | undefined;
    const html = build ? this.buildingTipHtml(build) : item ? this.itemTipHtml(item) : '';
    if (!html) return;
    this.tip.innerHTML = html;
    this.tip.classList.remove('hidden');
    const r = btn.getBoundingClientRect();
    const w = Math.min(340, window.innerWidth - 16);
    this.tip.style.width = `${w}px`;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    this.tip.style.left = `${left}px`;
    this.tip.style.top = '';
    this.tip.style.bottom = `${window.innerHeight - r.top + 8}px`;
  }

  hideTip() {
    this.tip.classList.add('hidden');
  }

  private recipeRow(r: (typeof RECIPES)[number]): string {
    const ins = Object.entries(r.inputs).map(([k, n]) => `${itemImg(k as ItemId, 'icon xs')}${n}`).join(' + ');
    return `<div class="tip-recipe">${ins} → ${itemImg(r.output, 'icon xs')}${r.outputCount > 1 ? r.outputCount : ''} <small>${r.seconds}s</small></div>`;
  }

  private buildingTipHtml(id: BuildingId): string {
    const def = BUILDINGS[id];
    const st = this.sim.state;
    const recipes = def.kind === 'machine' ? RECIPES.filter((r) => r.machine === id) : [];
    const cost = Object.keys(def.cost).length ? costHtml(def.cost, st.inventory) : '–';
    const power = def.power ? `<span class="${def.power < 0 ? 'ok' : ''}">⚡ ${def.power < 0 ? '+' : '−'}${Math.abs(def.power)}</span>` : '';
    const rate = def.kind === 'miner' ? `${Math.round((60 / MINE_SECONDS) * this.sim.factor('miner'))}/min` : def.kind === 'conveyor' ? `${Math.round(this.sim.beltCapacity())}/min` : '';
    return `<div class="tip-head"><img src="${buildingUrl(id)}" alt=""><div><b>${tBuilding(id)}</b><small>${def.size}×${def.size} ${power} ${rate ? '· ' + rate : ''}</small></div></div>
      <p>${tBuildingDesc(id)}</p>
      <div class="tip-line"><span>${t('cost')}</span>${cost}</div>
      ${recipes.length ? `<div class="tip-line"><span>${t('recipes')}</span></div>${recipes.map((r) => this.recipeRow(r)).join('')}` : ''}
      <small class="dim">${t('tip_hint')}</small>`;
  }

  private itemTipHtml(id: ItemId): string {
    const made = RECIPES.filter((r) => r.output === id);
    const used = RECIPES.filter((r) => id in r.inputs);
    const terrain = (Object.keys(TERRAIN_ITEM) as TerrainId[]).find((k) => TERRAIN_ITEM[k] === id);
    const usedIn = used.map((r) => `${itemImg(r.output, 'icon xs')}`).join(' ');
    const costOf = BUILD_ORDER.filter((b) => id in BUILDINGS[b].cost).map((b) => tBuilding(b)).join(', ');
    return `<div class="tip-head">${itemImg(id, 'icon')}<div><b>${tItem(id)}</b><small>${SHIP_PARTS[id] ? `🚀 ${t('ship_part')} · ${SHIP_PARTS[id]}` : ''}</small></div></div>
      ${terrain ? `<p>${t('tip_mined', { m: tBuilding('miner') })}</p>` : made.map((r) => `<div class="tip-line"><span>${tBuilding(r.machine)}</span></div>${this.recipeRow(r)}`).join('')}
      ${usedIn ? `<div class="tip-line"><span>${t('tip_used_in')}</span><span>${usedIn}</span></div>` : ''}
      ${costOf ? `<div class="tip-line"><span>${t('tip_builds')}</span><span class="wrap">${costOf}</span></div>` : ''}
      <button class="btn small" data-chain="${id}">${t('chains')}</button>`;
  }

  /** Styled replacement for window.confirm. */
  confirmModal(text: string, okLabel = t('ok')): Promise<boolean> {
    return new Promise((resolve) => {
      this.openModal(
        `<div class="kora-head"><img src="${uiUrl('kora.webp')}" alt=""><div><b>${t('kora')}</b></div></div>
        <p>${text}</p>
        <div class="row2"><button class="btn" data-act="close">${t('cancel')}</button><button class="btn primary" data-act="yes">${okLabel}</button></div>`,
        (target) => {
          if (target.dataset.act === 'yes') {
            this.closeModal();
            resolve(true);
          }
        },
      );
      const prev = this.modal.onclick!;
      this.modal.onclick = (e) => {
        const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
        if (e.target === this.modal || target?.dataset.act === 'close') resolve(false);
        prev.call(this.modal, e);
      };
    });
  }

  /** Styled replacement for window.prompt. Resolves null when cancelled. */
  promptModal(text: string, value = ''): Promise<string | null> {
    return new Promise((resolve) => {
      this.openModal(
        `<h2>${text}</h2>
        <input id="prompt-input" class="text-input" type="text" maxlength="40" value="${value.replace(/"/g, '&quot;')}">
        <div class="row2"><button class="btn" data-act="close">${t('cancel')}</button><button class="btn primary" data-act="yes">${t('ok')}</button></div>`,
        (target) => {
          if (target.dataset.act === 'yes') {
            const v = (this.modal.querySelector('#prompt-input') as HTMLInputElement).value.trim();
            this.closeModal();
            resolve(v);
          }
        },
      );
      const input = this.modal.querySelector('#prompt-input') as HTMLInputElement;
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);
      input.onkeydown = (e) => {
        if (e.key === 'Enter') (this.modal.querySelector('[data-act="yes"]') as HTMLButtonElement).click();
      };
      const prev = this.modal.onclick!;
      this.modal.onclick = (e) => {
        const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
        if (e.target === this.modal || target?.dataset.act === 'close') resolve(null);
        prev.call(this.modal, e);
      };
    });
  }

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

  /** Recursive production tree for an item, with machine counts for a target rate. */
  showChain(item: ItemId) {
    const st = this.sim.state;
    const sim = this.sim;
    const rate = this.chainRate;
    const minerPerMin = (60 / MINE_SECONDS) * sim.factor('miner');
    const beltPerMin = ((BELT_SPEED * sim.factor('belt')) / BELT_SPACING) * 60;
    const tree = (id: ItemId, perMin: number, depth: number, seen: Set<ItemId>): string => {
      const r = RECIPES.find((rc) => rc.output === id);
      const producers = st.buildings.filter((b) => (b.type === 'miner' && b.mineItem === id) || (b.recipe && RECIPE_BY_ID[b.recipe]?.output === id)).length;
      const have = st.inventory[id] ?? 0;
      let machines = 0;
      let machineName = '';
      if (r) {
        const perMachine = (r.outputCount * 60) / r.seconds * sim.factor('machine');
        machines = perMin / perMachine;
        machineName = tBuilding(r.machine);
      } else if (Object.values(TERRAIN_ITEM).includes(id)) {
        machines = perMin / minerPerMin;
        machineName = tBuilding('miner');
      }
      let line = `<div class="tree-row" style="margin-left:${depth * 18}px">${itemImg(id, 'icon sm')}<b>${tItem(id)}</b><span class="rate">${perMin.toFixed(1)}/min</span>`;
      if (r) line += ` <small>${t('made_in')} <img class="icon xs" src="${buildingUrl(r.machine)}" alt=""> ${r.seconds}s ${r.outputCount > 1 ? '×' + r.outputCount : ''}</small>`;
      else if (machineName) line += ` <small>${t('mined_from')}</small>`;
      if (machineName) line += `<span class="need ${producers >= Math.ceil(machines) ? 'ok' : ''}">${Math.ceil(machines)}× ${machineName} <small>(${machines.toFixed(2)}) · ${producers} ${t('built')}</small></span>`;
      line += `<span class="tree-meta">${have}</span></div>`;
      if (perMin > beltPerMin) line += `<div class="tree-row warn" style="margin-left:${depth * 18 + 18}px">⚠ ${t('belt_limit', { n: beltPerMin.toFixed(0) })}</div>`;
      if (r && !seen.has(id) && depth < 6) {
        seen.add(id);
        for (const k in r.inputs) {
          const need = (perMin * r.inputs[k as ItemId]!) / r.outputCount;
          line += tree(k as ItemId, need, depth + 1, seen).replace('<div class="tree-row"', `<div class="tree-row" data-n="${r.inputs[k as ItemId]}"`);
        }
      }
      return line;
    };
    const rates = [5, 10, 20, 30, 60];
    this.openModal(
      `<h2>${t('chain_for')}: ${tItem(item)}</h2>
      <div class="dirs"><span class="lbl">${t('target_rate')}</span>${rates.map((r) => `<button class="chip ${r === rate ? 'active' : ''}" data-rate="${r}">${r}/min</button>`).join('')}</div>
      <div class="tree">${tree(item, rate, 0, new Set())}</div>
      <p class="save-hint">${t('calc_hint')}</p>
      <button class="btn primary" data-act="close">${t('close')}</button>`,
      (target) => {
        if (target.dataset.rate) {
          this.chainRate = Number(target.dataset.rate);
          this.showChain(item);
        }
      },
    );
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
    const row = (u: (typeof UPGRADES)[number]) => {
      const lvl = st.upgrades[u.id] ?? 0;
      const cost = this.sim.upgradeCost(u.id);
      const can = this.sim.canUpgrade(u.id);
      const open = this.sim.upgradeUnlocked(u.id);
      const pips = Array.from({ length: u.maxLevel }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      return `<div class="upgrade ${open ? '' : 'locked'}">
        <div class="uname"><b>${tUpgrade(u.id)}</b> <span class="pips">${pips}</span><small>${t(`upgrade_desc_${u.id}` as 'upgrade_desc_belt')} · ×${u.factor(lvl).toFixed(2)}${!open && u.requires ? `<br>🔒 ${t('requires', { u: tUpgrade(u.requires.id), n: u.requires.level })}` : ''}</small></div>
        ${cost ? `<div class="ucost">${costHtml(cost, st.inventory)}</div><button class="btn small ${can ? 'primary' : ''}" data-up="${u.id}" ${can ? '' : 'disabled'}>${t('upgrade_buy')}</button>` : `<span class="umax">${t('upgrade_max')}</span>`}
      </div>`;
    };
    const base = UPGRADES.filter((u) => !u.requires).map(row).join('');
    const tier2 = UPGRADES.filter((u) => u.requires).map(row).join('');
    this.openModal(`<h2>${t('research')}</h2><div class="upgrade-list">${base}</div><h3>${t('upgrades')} II</h3><div class="upgrade-list">${tier2}</div><button class="btn primary" data-act="close">${t('close')}</button>`, (target) => {
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
      `<h2>${icon('menu', 'sm')} ${t('menu')}</h2>
      <div class="mgrid">
        <div class="stat"><small>${t('mode')}</small><b>${st.options.mode === 'story' ? `${t('mode_story')} · ${t('chapter')} ${st.missionIndex + 1}/${MISSIONS.length}` : st.options.mode === 'playground' ? t('mode_playground') : t('mode_free')}</b></div>
        <div class="stat"><small>${t('playtime')}</small><b>${fmtTime(st.time)}</b></div>
        <div class="stat"><small>${t('seed')}</small><b class="mono">${st.seed}</b></div>
        <div class="stat"><small>Build</small><b class="mono">${__BUILD__}</b></div>
      </div>
      <h3>${icon('settings', 'sm')} ${t('settings')}</h3>
      <div class="mset">
        <div class="menu-row"><span>${t('language')}</span><span class="seg"><button class="chip ${lang === 'de' ? 'active' : ''}" data-lang="de">DE</button><button class="chip ${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button></span></div>
        <div class="menu-row"><span>${t('sound')}</span><span class="seg"><button class="chip ${soundEnabled() ? 'active' : ''}" data-sound="on">${t('on')}</button><button class="chip ${soundEnabled() ? '' : 'active'}" data-sound="off">${t('off')}</button></span></div>
        <div class="menu-row"><span>${t('ambience')}</span><span class="seg"><button class="chip ${ambientEnabled() ? 'active' : ''}" data-ambient="on">${t('on')}</button><button class="chip ${ambientEnabled() ? '' : 'active'}" data-ambient="off">${t('off')}</button></span></div>
      </div>
      <h3>${icon('save', 'sm')} ${t('section_save')}</h3>
      <div class="mtiles">
        <button class="tile" data-act="save">${icon('save')}<span>${t('save_now')}</span></button>
        <button class="tile" data-act="transfer">${icon('transfer')}<span>${t('transfer_short')}</span></button>
        <button class="tile" data-act="blueprints">${icon('blueprint')}<span>${t('blueprints')}</span></button>
        ${st.note && !this.editor ? `<button class="tile" data-act="note">${icon('note')}<span>${t('save_note')}</span></button>` : ''}
        ${st.options.mode === 'free' || st.options.mode === 'playground' ? (this.editor ? `<button class="tile" data-act="ednote">${icon('note')}<span>${t('ed_note')}</span></button><button class="tile primary" data-act="edtoggle">${icon('play')}<span>${t('ed_play')}</span></button>` : `<button class="tile" data-act="edtoggle">${icon('pencil')}<span>${t('editor')}</span></button>`) : ''}
        <button class="tile" data-act="howto">${icon('help')}<span>${t('how_to')}</span></button>
        <a class="tile" href="./ai/">${icon('spark')}<span>${t('ai_page')}</span></a>
      </div>
      <div class="row2"><button class="btn danger" data-act="new">${icon('plus', 'sm')} ${t('new_game')}</button><button class="btn primary" data-act="close">${t('close')}</button></div>
      <p class="save-hint">${t('save_hint')}${produced ? ` · ${t('produced')}: ${produced}` : ''}</p>`,
      (target) => {
        if (target.dataset.lang) {
          setLang(target.dataset.lang as Lang);
          this.renderAll();
          this.showMenu();
        } else if (target.dataset.sound) {
          setSound(target.dataset.sound === 'on');
          this.showMenu();
        } else if (target.dataset.ambient) {
          setAmbient(target.dataset.ambient === 'on');
          this.showMenu();
        } else if (target.dataset.act === 'howto') this.showHowTo();
        else if (target.dataset.act === 'note') this.showNote();
        else if (target.dataset.act === 'edtoggle') {
          this.closeModal();
          this.setEditor(!this.editor);
        } else if (target.dataset.act === 'ednote') this.editNote();
        else if (target.dataset.act === 'transfer') this.showTransfer();
        else if (target.dataset.act === 'blueprints') this.showBlueprints();
        else if (target.dataset.act === 'save') {
          this.cb.onSave();
          this.toast(`${icon('save', 'sm')} ${t('saved')}`, 1500, 'success');
        } else if (target.dataset.act === 'new') {
          this.closeModal();
          this.cb.onSave();
          this.titleView = 'main';
          this.showTitle();
        }
      },
    );
  }

  /** Export / import the save as text or file so it can move between devices. */
  showTransfer() {
    this.cb.onSave();
    const raw = serialize(this.sim.state);
    const encoded = 'PE1.' + btoa(unescape(encodeURIComponent(raw)));
    this.openModal(
      `<h2>${icon('transfer', 'sm')} ${t('transfer_short')}</h2>
      <div class="xcard">
        <h3>${icon('download', 'sm')} ${t('export')}</h3>
        <p>${t('export_hint')}</p>
        <div class="row2"><button class="btn primary" data-act="copy">${icon('copy', 'sm')} ${t('copy_clip')}</button><button class="btn" data-act="download">${icon('download', 'sm')} ${t('download')}</button></div>
        <div class="xmeta"><span class="mono">${(raw.length / 1024).toFixed(0)} KB</span> · ${this.sim.state.buildings.length} ${t('buildings_n')} · ${this.sim.state.width}×${this.sim.state.height}</div>
      </div>
      <div class="xcard" id="importcard">
        <h3>${icon('upload', 'sm')} ${t('import')}</h3>
        <p>${t('import_hint')}</p>
        <textarea id="importbox" rows="3" placeholder="PE1.…  /  { JSON }"></textarea>
        <div class="row2"><button class="btn primary" data-act="import">${icon('upload', 'sm')} ${t('import')}</button><button class="btn" data-act="pickfile">${t('import_file')}</button><input id="importfile" class="file-hidden" type="file" accept=".json,.txt,application/json,text/plain"></div>
      </div>
      <button class="btn ghost" data-act="close">${t('close')}</button>`,
      (target) => {
        const act = target.dataset.act;
        if (act === 'copy') {
          navigator.clipboard?.writeText(encoded).then(() => this.toast(`✓ ${t('copied')}`, 1500, 'success')).catch(() => this.toast(encoded.slice(0, 40) + '…', 3000));
        } else if (act === 'download') {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
          a.download = `planet-escape-${this.sim.state.seed}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } else if (act === 'import') {
          const box = this.modal.querySelector('#importbox') as HTMLTextAreaElement;
          this.importText(box.value);
        }
      },
    );
    const file = this.modal.querySelector('#importfile') as HTMLInputElement | null;
    (this.modal.querySelector('[data-act="pickfile"]') as HTMLButtonElement | null)?.addEventListener('click', () => file?.click());
    file?.addEventListener('change', () => {
      const f = file.files?.[0];
      if (!f) return;
      f.text().then((txt) => this.importText(txt));
    });
    // drag a save file onto the import card
    const card = this.modal.querySelector('#importcard') as HTMLElement | null;
    card?.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('drop');
    });
    card?.addEventListener('dragleave', () => card.classList.remove('drop'));
    card?.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drop');
      const f = e.dataTransfer?.files?.[0];
      if (f) f.text().then((txt) => this.importText(txt));
    });
  }

  private importText(txt: string) {
    try {
      let raw = txt.trim();
      if (raw.startsWith('PE1.')) raw = decodeURIComponent(escape(atob(raw.slice(4))));
      const st = JSON.parse(raw) as GameState;
      if (!st || !Array.isArray(st.buildings) || !Array.isArray(st.terrain)) throw new Error('bad');
      // run through the normal loader for migrations
      localStorage.setItem('pe_save_v1', JSON.stringify(st));
      const loaded = loadSave();
      if (!loaded) throw new Error('version');
      this.closeModal();
      this.cb.onImport(loaded);
      this.toast(`✓ ${t('imported')}`, 2500, 'success');
      if (lastDropped > 0) setTimeout(() => this.toast(`⚠ ${t('import_dropped', { n: lastDropped })}`, 9000, 'error'), 600);
      else if (loaded.note) setTimeout(() => this.showNote(), 400);
    } catch (e) {
      const why = e instanceof SyntaxError ? 'JSON' : (e as Error)?.message === 'version' ? `v${SAVE_VERSION}` : String((e as Error)?.message ?? e).slice(0, 60);
      this.toast(`${t('import_failed')} (${why})`, 4000, 'error');
    }
  }

  showLaunch() {
    const st = this.sim.state;
    const sc = this.sim.score();
    const record = recordScore(sc.total, sc.hard);
    if (st.options.mode === 'story') recordChapter(MISSIONS.length - 1, st.time - (st.chapterStart ?? 0));
    const best = loadProgress().bestScore[sc.hard ? 'hard' : 'normal'];
    const line = (label: string, v: number) => `<div class="menu-row"><span>${label}</span><span class="mono">${v}</span></div>`;
    this.openModal(
      `<div class="launch">
      <img class="ship" src="${uiUrl('ship.webp')}" alt="">
      <h2>🚀 ${t('launch_title')}</h2>
      <p>${t('launch_text', { time: fmtTime(st.time) })}</p>
      <div class="score-box">
        <div class="score-total">${t('score')}: <b>${sc.total}</b>${record ? ` <span class="rec">${t('new_record')}</span>` : ''}</div>
        ${line(t('score_time'), sc.time)}${line(t('score_parts'), sc.parts)}${line(t('score_thrift'), sc.thrift)}${line(t('score_contracts'), sc.contracts)}${sc.hard ? line(t('score_hard'), Math.round(sc.total / 1.5 * 0.5)) : ''}
        <div class="menu-row"><span>${t('best_score')}</span><span class="mono">${best}</span></div>
      </div>
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
    return e;
  }

  /** After a belt line: a toast with an undo button, so accidental lines are one tap away from gone. */
  beltLineLaid(n: number) {
    this.toasts.querySelectorAll('.toast.action').forEach((x) => x.remove());
    const e = this.toast(`${t('belts_laid', { n })} <button class="btn small" data-act="undo">${icon('undo', 'sm')} ${t('undo')}</button>`, 4500, 'action');
    e.onclick = (ev) => {
      if ((ev.target as HTMLElement).closest('[data-act="undo"]')) {
        this.undo();
        e.remove();
      }
    };
  }

  missionComplete(index: number) {
    const m = MISSIONS[index];
    const mt = tMission(m.id);
    const unlocks = [...m.unlocks.map((u) => tBuilding(u)), ...m.unlockRecipes.map((r) => tItem(RECIPE_BY_ID[r].output))];
    if (m.reward) for (const k in m.reward) unlocks.push(`${m.reward[k as ItemId]}× ${tItem(k as ItemId)}`);
    sfx.mission();
    const st = this.sim.state;
    if (st.options.mode === 'story' && index < MISSIONS.length - 1) {
      // story: every order is a chapter on its own map -> hand over to the next map
      const next = MISSIONS[index + 1];
      const nt = tMission(next.id);
      const lvl = LEVELS[Math.min(index + 1, LEVELS.length - 1)];
      const seconds = st.time - (st.chapterStart ?? 0);
      const rec = recordChapter(index, seconds);
      this.openModal(
        `<div class="kora-head"><img src="${uiUrl('kora.webp')}" alt=""><div><b>${t('kora')}</b><small>${t('chapter_done', { n: index + 1 })}</small></div></div>
        <h2>✓ ${mt.title}</h2>
        <div class="stars-big ${rec.stars === 3 ? 'gold' : ''}">${starString(rec.stars)}</div>
        <p class="stars-line">${t('stars_earned', { time: fmtTime(seconds), stars: `${rec.stars}/3` })}${rec.improved ? ` · ${t('new_record')}` : ''}<br><small>${t('par_time', { time: fmtTime(LEVELS[Math.min(index, LEVELS.length - 1)].par) })}</small></p>
        <p>${tChapter(index)}</p>
        ${unlocks.length ? `<div class="unlocks">${t('unlocked')}: ${unlocks.join(', ')}</div>` : ''}
        <h3>${t('chapter')} ${index + 2}: ${nt.title}</h3>
        <p>${nt.text}</p>
        <p class="save-hint">${t('chapter_next_hint', { size: `${lvl.size}×${lvl.size}` })}</p>
        <button class="btn primary" data-act="next">${t('chapter_next', { n: index + 2 })}</button>`,
        (target) => {
          if (target.dataset.act === 'next') {
            this.closeModal();
            this.cb.onNextLevel();
          }
        },
      );
      // the story modal has no close: clicking the backdrop must not dismiss it
      this.modal.onclick = (e) => {
        const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
        if (target?.dataset.act === 'next') {
          this.closeModal();
          this.cb.onNextLevel();
        }
      };
      return;
    }
    this.toast(`✓ ${t('mission_done')} <b>${mt.title}</b>${unlocks.length ? `<br><small>${t('unlocked')}: ${unlocks.join(', ')}</small>` : ''}`, 5000, 'success');
    const next = MISSIONS[index + 1];
    const chapter = this.sim.state.options.mode === 'story' ? tChapter(index) : '';
    if (chapter) this.koraSay(chapter, 14);
    if (next) {
      const nt = tMission(next.id);
      setTimeout(() => this.koraSay(nt.text, 20), chapter ? 14000 : 0);
    }
  }

  /** Called when a new chapter map has been loaded. */
  chapterStart() {
    const st = this.sim.state;
    const m = MISSIONS[st.missionIndex];
    if (m) {
      const mt = tMission(m.id);
      this.koraSay(mt.text, 20);
      this.toast(`▶ ${t('chapter')} ${st.missionIndex + 1}: <b>${mt.title}</b>`, 4000);
    }
    this.lastTutorialStep = -2;
    this.lastTopHtml = '';
    this.lastBottomHtml = '';
    this.undoStack = [];
    this.refresh();
  }

  /** KORA reports a situation; the player decides (or the safe option happens when the timer runs out). */
  eventOffer(ev: GameEvent) {
    sfx.select();
    const st = this.sim.state;
    const item = ev.terrain ? tItem(TERRAIN_ITEM[ev.terrain]!) : '';
    const text = t(`event_${ev.kind}_text` as 'event_wreck_text', { item });
    const aOk = this.sim.eventOptionAvailable(ev, 'a');
    this.openModal(
      `<div class="kora-head"><img src="${uiUrl('kora.webp')}" alt=""><div><b>${t('kora')}</b><small>${t('event_title')}</small></div></div>
      <p>${text}</p>
      <p class="save-hint">${t('event_decide_in', { time: fmtTime(ev.until - st.time) })}</p>
      <button class="btn primary" data-choice="a" ${aOk ? '' : 'disabled'}>${t(`event_${ev.kind}_a` as 'event_wreck_a')}</button>
      <button class="btn" data-choice="b">${t(`event_${ev.kind}_b` as 'event_wreck_b')}</button>
      ${ev.kind === 'meteorite' && ev.x !== undefined ? `<button class="btn ghost small" data-act="look">${t('show')}</button>` : ''}`,
      (target) => {
        const c = target.dataset.choice as 'a' | 'b' | undefined;
        if (c) {
          this.sim.resolveEvent(c);
          this.closeModal();
        } else if (target.dataset.act === 'look' && ev.x !== undefined && ev.y !== undefined) {
          this.renderer.centerOn(ev.x, ev.y, Math.max(this.renderer.cam.zoom, 0.8));
          this.renderer.ping = { x: ev.x - 1, y: ev.y - 1, w: 3, h: 3 };
        }
      },
    );
    // keep the card open when tapping the backdrop; the decision can also be postponed via the KORA card
    this.koraSay(`📡 ${t('event_title')}: ${text}`, 60, { label: t('decide'), run: () => this.eventOffer(ev) });
  }

  eventDone(ev: GameEvent, choice: 'a' | 'b', auto: boolean) {
    if (this.sim.state.event === null && this.modal.querySelector('[data-choice]')) this.closeModal();
    if (auto) this.toast(t('event_auto'), 3500);
    else this.toast(`✓ ${t(`event_${ev.kind}_${choice}` as 'event_wreck_a')}`, 3500, 'success');
    this.renderer.ping = null;
    if (this.koraAction) {
      this.koraMsgT = 0;
      this.koraAction = null;
    }
  }

  meteorLanded(x: number, y: number) {
    this.toast(`☄ ${t('event_meteor_landed')}`, 4000, 'success');
    this.renderer.fxMeteor(x, y);
  }

  contractOffer(c: Contract) {
    this.toast(`${icon('contracts', 'sm')} ${t('contract_new')}: ${t('contract_text', { n: c.amount, item: tItem(c.item), time: fmtTime(c.deadline - this.sim.state.time) })}`, 6000);
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
    // phones: keep the tool chip just above the (variable height) bottom HUD
    if (window.innerWidth < 900) this.toolChip.style.bottom = `${this.bottom.offsetHeight + 8}px`;
    else this.toolChip.style.bottom = '';
    if (this.koraMsgT > 0) {
      this.koraMsgT -= dt;
      if (this.koraMsgT <= 0) this.koraAction = null;
    }
    this.problems = this.sim.analyze();
    this.tickTutorial();
    this.tickHints();
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
        if (bodyEl && this.selected.type !== 'terminal') {
          const html = this.infoBody(this.selected);
          if (bodyEl.innerHTML !== html) bodyEl.innerHTML = html;
        }
        if (this.selected.type === 'terminal') {
          this.drawTerminalScreen(this.selected);
          const el = this.info.querySelector('#cpu-state');
          if (el) {
            const html = this.cpuStateHtml(this.selected);
            if (el.innerHTML !== html) el.innerHTML = html;
          }
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
