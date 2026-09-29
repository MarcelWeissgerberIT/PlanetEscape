import { achievementUrl, buildingUrl, decoUrl, terrainUrl, uiUrl } from '../game/assets';
import { playIntro } from './intro';
import { fullscreenAvailable, toggleFullscreen } from './fullscreen';
import { MenuVideo } from './menuVideo';
import { storyVideoHtml, wireStoryVideos } from './storyVideo';
import { EXAMPLES } from '../game/examples';
import { SERVICE_RANGE, SERVICE_STOCK, CHALLENGES, challengeMedal, PROJECTS, PROJECT_BY_ID, STAR_EFFICIENCY, HALL_SLOT_CAP, isHall, PLANT_FUEL, CRATE_SIZE, itemColor, DEPOT_ROBOTS_MAX, DOCK_CAP, BATTERY_CAP, BUILDINGS, BUILD_GROUPS, BUILD_ORDER, RADIO_CHANNELS, TIMER_PERIODS, ITEM_ORDER, LEVELS, MISSIONS, MIXER_RATIOS, ORE_PER_TILE, RECIPES, RECIPE_BY_ID, SHIP_PARTS, TERRAIN_ITEM, UPGRADES, VALVE_THRESHOLDS, recipesFor } from '../game/data';
import type { Input, Tool } from '../game/input';
import { Renderer } from '../game/render';
import { Sim, type Problem } from '../game/sim';
import { ambientEnabled, setAmbient, setSound, sfx, soundEnabled, startAmbient } from '../game/sfx';
import type { Blueprint, Building, BuildingId, Contract, Dir, GameEvent, GameOptions, GameState, ItemId, TerrainId, UpgradeId } from '../game/types';
import { TILE } from '../game/camera';
import { getLang, setLang, t, tBuilding, tBuildingDesc, tChapter, tItem, tMission, tStatus, tStory, tTutorial, tUpgrade, type Lang } from '../i18n';
import { hasSave, migrate as migrateSave, lastDropped, serialize } from '../game/save';
import { SAVE_VERSION } from '../game/world';
import { MEDALS, challengeBest, challengeRival, playerName, recordRival, setPlayerName, recordChallenge, chaptersUnlocked, exportProgress, importProgress, loadProgress, recordChapter, recordScore, resumeChapter, starString } from '../game/progress';
import { icon } from './icons';
import { ACHIEVEMENTS, checkAchievements, earned, syncAchievementsToSteam, unlock as unlockAchievement } from '../game/achievements';
import { CAN_UNLOCK, DEMO_CHALLENGES, DEMO_CHAPTERS, EDITION, IS_DESKTOP, STORE_URL, WEB_URL, desktop } from '../game/desktop';
import { CODE_LENGTH, normalizeCode, tryUnlock } from '../game/unlock';
import { kv } from '../game/storage';
import { tutorialStepDone } from '../game/tutorial';
import { cleanName, decodeResult, encodeResult, resultMedal, shareLink } from '../game/share';
import { DIR_ARROWS, costHtml, el, fmtTime, itemImg } from './dom';
import { buildingTipHtml, itemTipHtml } from './tips';
import { siteLine, printerHtml } from './printer';
import { contractText, contractProgress } from './contracts';
import { challengeRules, medalSummary } from './challenges';
import { wearHtml, cpuStateHtml } from './panels';
import { blueprintContent } from './blueprint';
import { CHIP8_H, CHIP8_W, HIRES_H, HIRES_W } from '../game/chip8';
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
  onPlayChallenge: (id: string) => void;
  onNewEditor: (w: number, h: number, random: boolean, seed?: number) => void;
  onLoadExample: (id: string) => void | Promise<void>;
  onVideo: (b: Building, kind: 'screen' | 'camera' | 'file', file?: File) => Promise<string | null>; // resolves with an error message or null
  onVideoStop: (b: Building) => void;
  videoLive: (b: Building) => 'screen' | 'camera' | 'file' | null;
  videoHasAudio: (b: Building) => boolean;
}


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
  private buildTab: string = (() => { try { return localStorage.getItem('pe_buildtab') ?? 'logistics'; } catch { return 'logistics'; } })();
  private brush = 1;
  private problemSince = new Map<number, number>(); // building id -> game time the problem was first seen
  private powerLowSince = -1;
  private lastHintAt = -1e9;
  private hintedIds = new Map<number, number>(); // building id -> game time of the last hint about it
  private storyIndex = 0;
  private minimapOpen = window.innerWidth > 900;
  /** header: the mission card below it and the drawer with view switches, controls and the whole store (remembered) */
  private missionOpen = true;
  private drawerOpen = false;
  private lastInv: Partial<Record<ItemId, number>> = {};
  private hudAnim: 'drawer' | 'mission' | null = null;
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
    this.loadHudPrefs();
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.title.classList.contains('hidden') || !this.modal.classList.contains('hidden')) return;
        if (/^[1-9]$/.test(e.key) && !this.pauseOpen && !this.input.captureKeys && !(e.target as HTMLElement)?.closest?.('input, textarea') && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const btn = this.bottom.querySelectorAll<HTMLButtonElement>('.build-bar .build-btn[data-build]')[Number(e.key) - 1];
          if (btn && !btn.disabled) btn.click();
          return;
        }
        if (e.key !== 'Escape') return;
        if (this.pauseOpen) {
          e.stopPropagation();
          this.resumeGame();
        } else if (this.tool.kind === 'none' && !this.selected) this.showMenu();
      },
      true,
    );
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
      const bpb = (e.target as HTMLElement).closest('[data-bp-building]') as HTMLElement | null;
      if (bpb && !bpb.closest('.modal')) {
        e.stopPropagation();
        this.hideTip(true);
        this.showBuildingBlueprint(bpb.dataset.bpBuilding as BuildingId);
        return;
      }
      const bimg = (e.target as HTMLElement).closest('img[data-building]') as HTMLImageElement | null;
      if (bimg && !bimg.closest('.build-btn, .modal')) {
        e.stopPropagation();
        this.hideTip(true);
        this.showBuildingBlueprint(bimg.dataset.building as BuildingId);
        return;
      }
      const img = (e.target as HTMLElement).closest('img[data-item]') as HTMLImageElement | null;
      if (!img) return;
      if (img.closest('.build-btn, .inv-item')) return;
      if (img.closest('.recipe') && !img.closest('.r-in')) return; // the output icon selects the recipe
      if (img.closest('button:not(.recipe):not(.kora-card)') && !img.closest('.tip')) return; // an icon inside an action button is its label (the mission card links its items)
      e.stopPropagation();
      this.hideTip(true);
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
    this.menuVideo(!this.holdMenuVideo);
    this.top.classList.add('hidden');
    this.bottom.classList.add('hidden');
    this.info.classList.add('hidden');
    this.floating.classList.add('hidden');
    this.minimapBox.classList.add('hidden');
  }

  get titleOpen(): boolean {
    return !this.title.classList.contains('hidden');
  }

  hideTitle() {
    startAmbient();
    this.title.classList.add('hidden');
    this.menuVideo(false);
    this.top.classList.remove('hidden');
    this.bottom.classList.remove('hidden');
    this.minimapBox.classList.toggle('hidden', !this.minimapOpen);
    if (!this.sim.state.introSeen) this.showStory();
  }

  /** The menu's background (a silent looping factory shot) stays in place while the menu itself re-renders. */
  private titleHost: HTMLElement | null = null;
  /** true while the intro plays: the menu video waits so it does not compete for the download */
  holdMenuVideo = false;

  private bgVideo: MenuVideo | null = null;

  private titleShell(): HTMLElement {
    if (!this.titleHost) {
      this.title.innerHTML = `<div class="title-bg" style="background-image:url('${uiUrl('menu_bg.webp')}')"></div><div class="title-host"></div>${fullscreenAvailable() ? `<button class="iconbtn title-fs" data-act="fullscreen" title="${t('fullscreen')}" aria-label="${t('fullscreen')}">${icon('fullscreen')}</button>` : ''}`;
      this.titleHost = this.title.querySelector('.title-host') as HTMLElement;
      this.title.insertAdjacentHTML('beforeend', `<div class="title-frame" aria-hidden="true"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i><span class="title-build">${EDITION === 'demo' ? 'DEMO · ' : ''}BUILD ${__BUILD__}</span></div>`);
      // menu entries: a soft tick on hover, arrow keys move between them (Enter / Space press the focused one)
      let lastHover: Element | null = null;
      this.title.addEventListener('pointerover', (e) => {
        const b = (e.target as HTMLElement).closest('.aaa-item, .aaa-alt');
        if (b && b !== lastHover) sfx.hover();
        lastHover = b;
      });
      window.addEventListener('keydown', (e) => {
        if (this.title.classList.contains('hidden') || !this.modal.classList.contains('hidden')) return;
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const items = [...this.title.querySelectorAll<HTMLButtonElement>('.aaa-item, .aaa-alt')];
        if (!items.length) return;
        e.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = at < 0 ? 0 : (at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
        items[next].focus();
        sfx.hover();
      });
      // with reduced motion the still picture stays
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.bgVideo = new MenuVideo(this.title.querySelector('.title-bg') as HTMLElement);
    }
    return this.titleHost;
  }

  /** Run or pause the menu background video (loaded on first use, in the size that fits the screen). */
  menuVideo(on: boolean) {
    if (on) this.bgVideo?.start();
    else this.bgVideo?.stop();
  }

  /** The intro again, from the menu (a click: it starts with sound right away). */
  private replayIntro() {
    this.menuVideo(false);
    this.holdMenuVideo = true;
    void playIntro().then(() => {
      this.holdMenuVideo = false;
      if (!this.title.classList.contains('hidden')) this.menuVideo(true);
    });
  }

  /** What "continue" leads back to: mode, chapter or challenge, play time. */
  private saveLine(): string {
    const st = this.sim.state;
    const m = MISSIONS[st.missionIndex];
    const what =
      st.options.mode === 'story' ? `${t('mode_story')} · ${t('chapter')} ${st.missionIndex + 1}${m ? `: ${tMission(m.id).title}` : ''}`
      : st.options.mode === 'playground' ? t('mode_playground')
      : st.options.mode === 'challenge' && st.challenge ? `${t('mode_challenge')} · ${t(`ch_${st.challenge}` as 'ch_c_drills')}`
      : `${t('mode_free')}${m ? ` · ${tMission(m.id).title}` : ''}`;
    return `${what} · ${fmtTime(st.time)}`;
  }

  private freeOptions: GameOptions = { mode: 'free', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: true };
  private titleView: 'main' | 'free' | 'playground' | 'challenges' = 'main';
  private exampleCat: 'all' | 'mega' | 'computer' | 'logic' = 'all';

  private renderTitle() {
    const lang = getLang();
    const o = this.freeOptions;
    const seedInput = `<div class="seed-row"><input id="seed" type="text" inputmode="numeric" placeholder="${t('seed')}" maxlength="12"></div>`;
    const resume = resumeChapter();
    // main menu: big numbered entries without boxes, a glass slab slides in behind the one in focus; the rest in a footer
    let n = 0;
    const item = (act: string, title: string, desc: string, cls = '') =>
      `<button class="aaa-item ${cls}" data-act="${act}" style="--i:${n}"><span class="aaa-num">${String(++n).padStart(2, '0')}</span><span class="aaa-label"><b>${title}</b><small>${desc}</small></span><span class="aaa-chev" aria-hidden="true">›</span></button>`;
    const resumeTitle = MISSIONS[resume - 1] ? tMission(MISSIONS[resume - 1].id).title : '';
    const mainView = `
        <nav class="aaa-nav main-menu">
          ${hasSave() ? item('continue', t('continue'), this.saveLine(), 'primary') : ''}
          ${resume > 1
            ? item('story-resume', t('mode_story'), `${t('story_resume', { n: resume })}${resumeTitle ? ` · ${resumeTitle}` : ''}`, hasSave() ? '' : 'primary') + `<button class="aaa-alt" data-act="story" style="--i:${n}">↺ ${t('story_restart')}</button>`
            : item('story', t('mode_story'), t('mode_story_desc'), hasSave() ? '' : 'primary')}
          ${EDITION === 'demo' ? item('demo-locked', `🔒 ${t('mode_free')}`, t('demo_full_only'), 'locked') : item('freeview', t('mode_free'), t('mode_free_desc'))}
          ${item('playview', t('mode_playground'), t('mode_playground_desc'))}
          ${item('challview', `${t('mode_challenge')} ${medalSummary()}`, t('mode_challenge_desc'))}
          ${EDITION === 'demo' && STORE_URL ? item('store', `${t('demo_store')} →`, '', 'accent2') : ''}
        </nav>
        <div class="aaa-foot">
          <button data-act="chapters">${t('chapter_list')} ${this.starsSummary()}</button>
          <button data-act="howto">${t('how_to')}</button>
          <button data-act="replay-intro">🎬 ${t('intro_watch')}</button>
          ${EDITION === 'demo' && CAN_UNLOCK ? `<button data-act="unlock">🔑 ${t('unlock_full')}</button>` : ''}
          ${EDITION !== 'demo' && IS_DESKTOP && !Object.keys(loadProgress().stars).length ? `<button data-act="progress-import">${t('progress_import_title')}</button>` : ''}
          ${IS_DESKTOP ? '' : `<a class="ai-link" href="./ai/">${t('ai_page')} →</a>`}
          <span class="aaa-lang"><button class="${lang === 'de' ? 'active' : ''}" data-lang="de">DE</button><button class="${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button></span>
        </div>`;
    const exTitle = (ex: (typeof EXAMPLES)[number]) => (ex.bi ? ex.title.split(' · ')[getLang() === 'de' ? 0 : 1] ?? ex.title : ex.title);
    const cats = ['all', 'mega', 'computer', 'logic'] as const;
    const shown = EXAMPLES.filter((ex) => this.exampleCat === 'all' || ex.cat === this.exampleCat);
    const playView = `
        <div class="title-buttons">
          <button class="ex-empty" data-act="editor"><span class="ex-plus">+</span><span><b>${t('pg_empty')}</b><small>${t('pg_empty_desc')}</small></span></button>
          <div class="ex-filter">${cats.map((c) => `<button class="${this.exampleCat === c ? 'active' : ''}" data-excat="${c}">${t(`excat_${c}` as 'excat_all')}<i>${c === 'all' ? EXAMPLES.length : EXAMPLES.filter((ex) => ex.cat === c).length}</i></button>`).join('')}</div>
          <div class="ex-grid">
            ${shown.map((ex, k) => `<button class="ex-card cat-${ex.cat}" data-example="${ex.id}" style="--i:${k}"><img src="${buildingUrl(ex.icon as BuildingId)}" alt=""><span class="ex-body"><b>${exTitle(ex)}</b><small>${getLang() === 'de' ? ex.de : ex.en}</small><span class="ex-tags"><i class="ex-cat">${t(`excat_${ex.cat}` as 'excat_all')}</i><i>${ex.map}</i></span></span></button>`).join('')}
          </div>
          <button class="btn ghost" data-act="back">${t('back')}</button>
        </div>`;
    const challView = `
        <div class="title-buttons">
          <div class="examples">
            ${CHALLENGES.map((c) => {
              const best = challengeBest(c.id);
              const medal = best !== undefined ? MEDALS[challengeMedal(c.id, best)] || '✓' : '';
              if (EDITION === 'demo' && !DEMO_CHALLENGES.includes(c.id)) return `<button class="btn mode example locked" data-act="demo-locked"><img class="icon" src="${buildingUrl(c.icon)}" alt=""><span><b>🔒 ${t(`ch_${c.id}` as 'ch_c_drills')}</b><small>${t('demo_full_only')}</small></span></button>`;
              return `<button class="btn mode example" data-challenge="${c.id}"><img class="icon" src="${buildingUrl(c.icon)}" alt=""><span><b>${medal} ${t(`ch_${c.id}` as 'ch_c_drills')}</b><small>${t(`ch_${c.id}_desc` as 'ch_c_drills_desc')}</small><small class="ch-meta">${challengeRules(c.id)}${best !== undefined ? ` · ${t('ch_best')} ${fmtTime(best)}` : ''}</small>${this.rivalLine(c.id)}</span></button>`;
            }).join('')}
          </div>
          <button class="btn" data-act="ch-code">⚔ ${t('ch_enter_code')}</button>
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
    const main = this.titleView === 'main';
    this.titleShell().innerHTML = `
      <div class="title-content aaa ${main ? '' : 'sub'}">
        <h1 class="logo"><span>PLANET</span><span class="accent">ESCAPE</span></h1>
        <p class="tagline">${t('tagline')}</p>
        ${main ? mainView : `<section class="aaa-panel">
          <header class="aaa-panel-head">${this.titleView === 'challenges' ? `<b>${t('mode_challenge')}</b><small>${t('ch_intro')}</small>` : this.titleView === 'playground' ? `<b>${t('mode_playground')}</b><small>${t('mode_playground_desc')}</small>` : `<b>${t('mode_free')}</b><small>${t('mode_free_desc')}</small>`}</header>
          ${this.titleView === 'playground' ? playView : this.titleView === 'challenges' ? challView : freeView}
          ${this.titleView === 'free' ? `<p class="save-hint">${t('seed_hint')}</p>` : ''}
        </section>`}
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
      if (target.dataset.excat) {
        this.exampleCat = target.dataset.excat as typeof this.exampleCat;
        this.renderTitle();
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
      } else if (act === 'demo-locked') {
        this.showDemoEnd();
      } else if (act === 'store') {
        this.openLink(STORE_URL);
      } else if (act === 'fullscreen') {
        toggleFullscreen();
      } else if (act === 'unlock') {
        this.showUnlock();
      } else if (act === 'progress-import') {
        this.showProgressImport();
      } else if (act === 'ch-code') {
        this.showChallengeCode();
      } else if (act === 'challview') {
        this.titleView = 'challenges';
        this.renderTitle();
      } else if (target.closest<HTMLElement>('[data-challenge]')) {
        const id = target.closest<HTMLElement>('[data-challenge]')!.dataset.challenge!;
        void this.confirmNewGame().then((yes) => yes && this.cb.onPlayChallenge(id));
      } else if (act === 'playview') {
        this.titleView = 'playground';
        this.renderTitle();
      } else if (target.closest<HTMLElement>('[data-example]')) {
        const id = target.closest<HTMLElement>('[data-example]')!.dataset.example!;
        void this.confirmNewGame().then((yes) => yes && void this.cb.onLoadExample(id));
      } else if (act === 'back') {
        this.titleView = 'main';
        this.renderTitle();
      } else if (act === 'free') {
        const seed = seedOf();
        void this.confirmNewGame().then((yes) => yes && this.cb.onNewGame(seed, { ...this.freeOptions, mode: 'free' }));
      } else if (act === 'howto') this.showHowTo();
      else if (act === 'replay-intro') this.replayIntro();
      else if (act === 'chapters') this.showChapters();
      else if (act === 'editor') this.showEditorSetup();
    };
  }

  /** Ask before a saved base is thrown away. */
  private confirmNewGame(): Promise<boolean> {
    if (!hasSave()) return Promise.resolve(true);
    return this.confirmModal(t('new_game_confirm'), t('new_game'));
  }



  /** A challenge was loaded. */
  challengeStart() {
    const c = this.sim.challenge();
    if (!c) return;
    this.lastTopHtml = '';
    this.lastBottomHtml = '';
    this.undoStack = [];
    this.openModal(`<h2>🏁 ${t(`ch_${c.id}` as 'ch_c_drills')}</h2><p>${t(`ch_${c.id}_desc` as 'ch_c_drills_desc')}</p><p class="save-hint">${challengeRules(c.id)}</p><p class="save-hint">${t('ch_how')}</p>
      <div class="bufs">${Object.entries(c.deliver).map(([k, n]) => `<span class="buf">${itemImg(k as ItemId, 'icon sm')}${n}</span>`).join('')}</div>
      <div class="medal-row">${c.medals.map((s, i) => `<span>${MEDALS[3 - i]} ${fmtTime(s)}</span>`).join('')}</div>
      <button class="btn primary" data-act="close">${t('ch_go')}</button>`, () => {});
    this.refresh();
  }

  /** The challenge goal was met. */
  challengeDone(seconds: number) {
    const c = this.sim.challenge();
    if (!c) return;
    const r = recordChallenge(c.id, seconds);
    sfx.medal(r.medal);
    this.openModal(`<div class="launch"><h2>🏁 ${t('ch_done')}</h2>
      <p class="medal-big">${MEDALS[r.medal] || '✓'}</p>
      <p>${t('ch_time', { time: fmtTime(seconds) })}${r.improved ? ` <span class="rec">${t('new_record')}</span>` : ''}</p>
      <div class="medal-row">${c.medals.map((s, i) => `<span>${MEDALS[3 - i]} ${fmtTime(s)}</span>`).join('')}</div>
      <p class="save-hint">${t('ch_best')} ${fmtTime(r.best)}</p>
      ${this.rivalLine(c.id, seconds)}
      <button class="btn primary" data-act="ch-share">🔗 ${t('ch_share')}</button>
      <button class="btn" data-act="ch-again">${t('ch_again')}</button>
      <button class="btn" data-act="ch-list">${t('ch_list')}</button>
      <button class="btn ghost" data-act="close">${t('keep_playing')}</button></div>`, (target) => {
      if (target.dataset.act === 'ch-share') {
        void this.shareChallenge(c.id, seconds);
      } else if (target.dataset.act === 'ch-again') {
        this.closeModal();
        this.cb.onPlayChallenge(c.id);
      } else if (target.dataset.act === 'ch-list') {
        this.closeModal();
        this.titleView = 'challenges';
        this.showTitle();
      }
    });
  }

  /** "Anna: 2:14 🥇 · you are 0:26 faster" under a result, when someone shared a time for this challenge. */
  private rivalLine(id: string, mine?: number): string {
    const rv = challengeRival(id);
    if (!rv) return '';
    const medal = MEDALS[challengeMedal(id, rv.time)] || '✓';
    const who = rv.name || t('ch_someone');
    if (mine === undefined) return `<small class="ch-rival">⚔ ${who} ${fmtTime(rv.time)} ${medal}</small>`;
    const d = Math.round(mine - rv.time);
    const cmp = d < 0 ? t('ch_faster', { d: fmtTime(-d) }) : d > 0 ? t('ch_slower', { d: fmtTime(d) }) : t('ch_tie');
    return `<p class="ch-rival">⚔ ${who}: ${fmtTime(rv.time)} ${medal} · ${cmp}</p>`;
  }

  /** Share window: the code, a link and copy / share buttons; asks for a name once. */
  private async shareChallenge(id: string, seconds: number) {
    let name = playerName();
    if (!name) {
      const typed = await this.promptModal(t('ch_name_prompt'), '');
      if (typed === null) return;
      name = cleanName(typed);
      setPlayerName(name);
    }
    const res = { id, time: Math.round(seconds), name };
    const code = encodeResult(res);
    const link = shareLink(res, IS_DESKTOP ? WEB_URL : location.href);
    if (unlockAchievement('SHARE')) this.achievementToast('SHARE');
    const text = t('ch_share_text', { c: t(`ch_${id}` as 'ch_c_drills'), time: fmtTime(seconds), m: MEDALS[challengeMedal(id, seconds)] || '✓' });
    this.openModal(`<h2>🔗 ${t('ch_share')}</h2><p>${text}</p>
      <div class="lbl">${t('ch_code')}</div><input class="text-input mono" id="ch-code" readonly value="${code}">
      <div class="lbl">${t('ch_link')}</div><input class="text-input mono" id="ch-link" readonly value="${link}">
      <div class="row2"><button class="btn primary" data-act="copy-link">${t('ch_copy_link')}</button>${typeof navigator.share === 'function' ? `<button class="btn" data-act="native-share">${t('ch_share_more')}</button>` : `<button class="btn" data-act="copy-code">${t('ch_copy_code')}</button>`}</div>
      <p class="save-hint">${t('ch_share_hint')}</p>
      <button class="btn ghost" data-act="close">${t('close')}</button>`, (target) => {
      const act = target.dataset.act;
      const copy = (s: string) => {
        void navigator.clipboard?.writeText(s).then(() => this.toast(`✓ ${t('ch_copied')}`, 1600, 'success'), () => undefined);
        (this.modal.querySelector(act === 'copy-link' ? '#ch-link' : '#ch-code') as HTMLInputElement | null)?.select();
      };
      if (act === 'copy-link') copy(`${text} ${link}`);
      else if (act === 'copy-code') copy(code);
      else if (act === 'native-share') void navigator.share({ title: 'Planet Escape', text, url: link }).catch(() => undefined);
    });
  }

  private achievementToast(id: string) {
    sfx.mission();
    this.toast(`🏆 ${t('ach_unlocked')}: <b>${t(`ach_${id}` as 'ach_FIRST_PLATE')}</b><br><small>${t(`ach_${id}_desc` as 'ach_FIRST_PLATE_desc')}</small>`, 5000, 'success');
  }

  /** Achievements window (menu). */
  showAchievements() {
    const have = earned();
    const rows = ACHIEVEMENTS.map((a) => `<div class="ach ${have[a.id] ? 'got' : ''}"><img class="ach-icon" src="${achievementUrl(a.id)}" alt=""><div><b>${t(`ach_${a.id}` as 'ach_FIRST_PLATE')}</b><small>${t(`ach_${a.id}_desc` as 'ach_FIRST_PLATE_desc')}</small></div></div>`).join('');
    this.openModal(`<h2>🏆 ${t('achievements')} · ${Object.keys(have).length}/${ACHIEVEMENTS.length}</h2><div class="ach-list">${rows}</div><button class="btn primary" data-act="close">${t('close')}</button>`);
  }

  /** Demo: the end of what it contains, with the way to the full game. */
  showDemoEnd(finished = 0) {
    // the Steam demo and the full game share their save folder; from the web the progress goes along as a code
    const carry = IS_DESKTOP
      ? `<p>${t('demo_carry_desktop')}</p>`
      : `<p>${t('demo_carry_web')}</p><div class="row2"><button class="btn" data-act="progress-copy">${icon('copy', 'sm')} ${t('progress_copy')}</button><button class="btn" data-act="progress-file">${icon('download', 'sm')} ${t('progress_file')}</button></div>`;
    this.openModal(`<div class="launch">${finished ? storyVideoHtml(finished, 'done') : ''}<h2>${t('demo_end_title')}</h2><p>${t('demo_end_text', { n: DEMO_CHAPTERS })}</p>${carry}
      ${STORE_URL ? `<button class="btn primary" data-act="store">${t('demo_store')}</button>` : `<p><b>${t('demo_soon')}</b></p>`}
      ${CAN_UNLOCK ? `<button class="btn" data-act="unlock">🔑 ${t('unlock_full')}</button>` : ''}
      <button class="btn" data-act="close">${t('close')}</button></div>`, (target) => {
      const act = target.dataset.act;
      if (act === 'unlock') return this.showUnlock();
      if (act === 'store') this.openLink(STORE_URL);
      else if (act === 'progress-copy') {
        const code = exportProgress();
        navigator.clipboard?.writeText(code).then(() => this.toast(`✓ ${t('copied')}`, 1500, 'success')).catch(() => this.toast(code.slice(0, 40) + '…', 3000));
      } else if (act === 'progress-file') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([exportProgress()], { type: 'text/plain' }));
        a.download = 'planet-escape-progress.txt';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    });
  }

  private unlockTries: number[] = [];

  /** Web demo: a 5-character code turns it into the full game on this device (then the page reloads). */
  showUnlock() {
    this.openModal(
      `<div class="unlock"><h2>🔑 ${t('unlock_full')}</h2>
      <p>${t('unlock_hint', { n: CODE_LENGTH })}</p>
      <input id="unlock-code" class="unlock-input" type="text" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="•••••" aria-label="${t('unlock_full')}">
      <p class="unlock-msg" id="unlock-msg"></p>
      <button class="btn primary" data-act="unlock-go">${t('unlock_go')}</button>
      <button class="btn ghost" data-act="close">${t('close')}</button></div>`,
      (target) => {
        if (target.dataset.act === 'unlock-go') void this.submitUnlock();
      },
    );
    const input = this.modal.querySelector('#unlock-code') as HTMLInputElement;
    input.addEventListener('input', () => {
      const v = normalizeCode(input.value);
      if (input.value !== v) input.value = v;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.submitUnlock();
    });
    setTimeout(() => input.focus(), 50);
  }

  private async submitUnlock() {
    const input = this.modal.querySelector('#unlock-code') as HTMLInputElement | null;
    const msg = this.modal.querySelector('#unlock-msg') as HTMLElement | null;
    if (!input || !msg) return;
    // a few tries, then a pause (it does not stop anyone determined, it stops guessing by hand)
    const now = Date.now();
    this.unlockTries = this.unlockTries.filter((t0) => now - t0 < 60000);
    if (this.unlockTries.length >= 5) {
      const wait = Math.ceil((60000 - (now - this.unlockTries[0])) / 1000);
      msg.textContent = t('unlock_wait', { s: wait });
      msg.className = 'unlock-msg bad';
      return;
    }
    const ok = await tryUnlock(input.value).catch(() => false);
    if (!ok) {
      this.unlockTries.push(now);
      msg.textContent = t('unlock_bad');
      msg.className = 'unlock-msg bad';
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
      return;
    }
    msg.textContent = `✓ ${t('unlock_ok')}`;
    msg.className = 'unlock-msg good';
    sfx.medal(3);
    setTimeout(() => location.reload(), 1400); // the edition is decided when the game loads
  }

  /** Full game: take over the progress code from the web demo (pasted or as the saved file). */
  showProgressImport() {
    this.openModal(
      `<h2>${t('progress_import_title')}</h2>
      <div class="xcard">
        <p>${t('progress_import_hint')}</p>
        <textarea id="progressbox" rows="3" placeholder="PEP1.…"></textarea>
        <div class="row2"><button class="btn primary" data-act="apply">${icon('upload', 'sm')} ${t('import')}</button><button class="btn" data-act="pickfile">${t('import_file')}</button><input id="progressfile" class="file-hidden" type="file" accept=".txt,text/plain"></div>
      </div>
      <button class="btn ghost" data-act="close">${t('close')}</button>`,
      (target) => {
        if (target.dataset.act === 'apply') this.applyProgress((this.modal.querySelector('#progressbox') as HTMLTextAreaElement).value);
      },
    );
    const file = this.modal.querySelector('#progressfile') as HTMLInputElement | null;
    (this.modal.querySelector('[data-act="pickfile"]') as HTMLButtonElement | null)?.addEventListener('click', () => file?.click());
    file?.addEventListener('change', () => void file.files?.[0]?.text().then((txt) => this.applyProgress(txt)));
  }

  private applyProgress(code: string) {
    if (!importProgress(code)) {
      this.toast(t('progress_invalid'), 4000, 'error');
      return;
    }
    this.closeModal();
    syncAchievementsToSteam();
    this.toast(`✓ ${t('progress_imported')}`, 2500, 'success');
    if (!this.title.classList.contains('hidden')) this.renderTitle();
  }

  /** Links leave the desktop app through the system browser. */
  openLink(url: string) {
    const d = desktop();
    if (d) d.openExternal(url);
    else window.open(url, '_blank', 'noopener');
  }

  /** A pasted code or an opened link: show who played what, keep the best rival time, offer to play it. */
  showChallengeCode(input?: string) {
    const open = (code: string) => {
      const r = decodeResult(code);
      if (!r) {
        this.toast(t('ch_code_bad'), 2500, 'error');
        return;
      }
      const isNew = recordRival(r.id, r.name, r.time);
      const best = challengeBest(r.id);
      const medal = MEDALS[resultMedal(r)] || '✓';
      const who = r.name || t('ch_someone');
      const vs = best === undefined ? t('ch_not_played') : best < r.time ? t('ch_you_ahead', { d: fmtTime(r.time - best) }) : best > r.time ? t('ch_you_behind', { d: fmtTime(best - r.time) }) : t('ch_tie');
      this.openModal(`<div class="launch"><h2>⚔ ${t('ch_challenge_from', { n: who })}</h2>
        <p><b>${t(`ch_${r.id}` as 'ch_c_drills')}</b></p>
        <p class="medal-big">${medal}</p>
        <p>${t('ch_time', { time: fmtTime(r.time) })}</p>
        <p class="save-hint">${vs}${isNew ? '' : ` · ${t('ch_rival_kept')}`}</p>
        <button class="btn primary" data-act="ch-play">${t('ch_beat_it')}</button>
        <button class="btn ghost" data-act="close">${t('close')}</button></div>`, (target) => {
        if (target.dataset.act === 'ch-play') {
          this.closeModal();
          void this.confirmNewGame().then((yes) => yes && this.cb.onPlayChallenge(r.id));
        }
      });
      if (this.titleView === 'challenges') this.renderTitle();
    };
    if (input) open(input);
    else void this.promptModal(t('ch_enter_code'), '').then((v) => v && open(v));
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
      const open = i + 1 <= unlocked && (EDITION !== 'demo' || i < DEMO_CHAPTERS);
      const stars = p.stars[i] ?? 0;
      const best = p.best[i];
      return `<div class="chapter-row ${open ? '' : 'locked'}">
        <div class="cnum">${i + 1}</div>
        <div class="cbody"><b>${mt.title}</b><small>${lvl.size}×${lvl.size} · ${best !== undefined ? `${t('best_time')} ${fmtTime(best)} · ` : ''}${t('par_time', { time: fmtTime(lvl.par) })}</small></div>
        <div class="cstars ${stars === 3 ? 'gold' : ''}">${starString(stars)}</div>
        ${open ? `<button class="btn small ghost" data-clips="${i + 1}" title="${t('chapter_clips')}">🎬</button>` : ''}
        <button class="btn small ${open ? 'primary' : ''}" data-chapter="${i + 1}" ${open ? '' : 'disabled'} title="${open ? '' : t('chapter_locked')}">${t('play')}</button>
      </div>`;
    }).join('');
    this.openModal(`<h2>${t('chapter_select')}</h2><div class="chapter-list">${rows}</div><button class="btn primary" data-act="close">${t('close')}</button>`, (target) => {
      const clips = Number(target.dataset.clips);
      if (clips) return this.showChapterClips(clips);
      const ch = Number(target.dataset.chapter);
      if (ch) void this.confirmNewGame().then((yes) => yes && this.cb.onPlayChapter(ch));
    });
  }

  /** The chapter's two clips again: the explanation, and the reward once the chapter has been finished. */
  private showChapterClips(ch: number) {
    const done = (loadProgress().stars[ch - 1] ?? 0) > 0;
    this.openModal(
      `<h2>${t('chapter')} ${ch}: ${tMission(MISSIONS[ch - 1].id).title}</h2>
      <div class="video-pair"><h3>${t('clip_intro')}</h3>${storyVideoHtml(ch, 'intro')}
      ${done ? `<h3>${t('clip_done')}</h3>${storyVideoHtml(ch, 'done')}` : `<p class="save-hint">${t('clip_done_locked')}</p>`}</div>
      <button class="btn" data-act="back">‹ ${t('back')}</button>`,
      (target) => {
        if (target.dataset.act === 'back') this.showChapters();
      },
    );
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
        if (this.sim.state.options.mode === 'story') this.showBriefing();
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
    return tutorialStepDone(this.sim, step);
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
    // order rows (amounts, buildings, rate and its clock): under the tutorial text as well, it refers to them
    let mrows = '';
    if (m) {
        const entries = Object.entries(m.deliver);
        const compact = window.innerWidth < 900;
        const shown = compact ? entries.slice(0, 2) : entries;
        const rows =
          shown
            .map(([k, n]) => {
              const have = Math.min(n!, st.launched ? st.delivered[k as ItemId] ?? 0 : Math.max(st.delivered[k as ItemId] ?? 0, st.ship[k as ItemId] ?? 0));
              return `<div class="mrow ${have >= n! ? 'done' : ''}" style="--p:${Math.round((have / n!) * 100)}%">${itemImg(k as ItemId, 'icon sm')}<span class="mname">${tItem(k as ItemId)}</span><span class="mcount">${have}/${n}</span></div>`;
            })
            .join('') + (entries.length > shown.length ? `<div class="mrow more">+${entries.length - shown.length} …</div>` : '');
        const builds = m.build
          ? Object.entries(m.build)
              .map(([k, n]) => {
                const have = Math.min(n!, this.sim.countBuildings(k as BuildingId));
                return `<div class="mrow ${have >= n! ? 'done' : ''}" style="--p:${Math.round((have / n!) * 100)}%"><img class="icon sm" src="${buildingUrl(k as BuildingId)}" alt=""><span class="mname">${t('build_req')}: ${tBuilding(k)}</span><span class="mcount">${have}/${n}</span></div>`;
              })
              .join('')
          : '';
        const rs = this.sim.rateStatus();
        const rateRows = rs && m.rate
          ? Object.entries(m.rate).map(([k, n]) => {
              const r = this.sim.deliveryRate(k as ItemId);
              return `<div class="mrow rate ${r >= n! ? 'done' : ''}" style="--p:${Math.min(100, Math.round((r / n!) * 100))}%">${itemImg(k as ItemId, 'icon sm')}<span class="mname">${t('rate_row', { item: tItem(k as ItemId) })}</span><span class="mcount">${r}/${n}</span></div>`;
            }).join('') + `<div class="mrow rate ${rs.held >= rs.hold ? 'done' : ''}" style="--p:${Math.min(100, Math.round((rs.held / rs.hold) * 100))}%"><span class="mname">⏱ ${t('rate_hold')}</span><span class="mcount">${Math.floor(Math.min(rs.held, rs.hold))}/${rs.hold} s</span></div>`
          : '';
      mrows = `<div class="mrows">${builds}${rows}${rateRows}</div>`;
    }
    if (tut) {
      body = `<div class="mtitle"><span class="mnum">${t('tutorial_title')} ${st.tutorialStep + 1}/${steps.length}</span> ${tut.title}</div>
        <div class="mtext">${tut.text}</div>${mrows}`;
    } else if (m) {
      const mt = this.sim.challenge() ? { title: t(`ch_${m.id}` as 'ch_c_drills'), text: challengeRules(m.id) } : tMission(m.id);
      const num = this.sim.challenge() ? `🏁 ${st.challengeDone !== undefined ? `${MEDALS[challengeMedal(st.challenge!, st.challengeDone)] || '✓'} ${fmtTime(st.challengeDone)}` : `⏱ ${fmtTime(st.time)}`}` : st.launched ? `🚀 ${t('flight')} ${(st.flights ?? 0) + 1}` : `${st.options.mode === 'story' ? t('chapter') : t('mission')} ${st.missionIndex + 1}/${MISSIONS.length}`;
      body = `<div class="mtitle"><span class="mnum">${num}</span> ${mt.title}</div>
        <div class="mtext ${this.koraMsg && this.koraMsgT > 0 ? 'kora-says' : 'clamp1'}">${this.koraMsg && this.koraMsgT > 0 ? this.koraMsg : mt.text}</div>
        ${this.koraMsg && this.koraMsgT > 0 && this.koraAction ? `<div class="mact"><span class="btn small primary" data-act="kora-action">${this.koraAction.label}</span></div>` : ''}
        ${mrows}`;
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
    const playground = (st.options.mode === 'playground' || st.options.mode === 'challenge') && !tut;
    const hasCard = !(playground && !this.editor && st.options.mode !== 'challenge');
    const missionShown = hasCard && (this.missionOpen || !!tut);
    // the header chip: chapter and title, with how many goals are done
    const chipTop = tut ? `${t('tutorial_title')} ${st.tutorialStep + 1}/${steps.length}` : this.editor ? t('editor') : m ? (this.sim.challenge() ? t('mode_challenge') : st.launched ? t('flight') : `${st.options.mode === 'story' ? t('chapter') : t('mission')} ${st.missionIndex + 1}/${MISSIONS.length}`) : '';
    const chipTitle = tut ? tut.title : this.editor ? `${st.width}×${st.height}` : m ? (this.sim.challenge() ? t(`ch_${m.id}` as 'ch_c_drills') : tMission(m.id).title) : t('launch_title');
    let goalsDone = 0, goalsAll = 0;
    if (m) for (const [k, n] of Object.entries(m.deliver)) {
      goalsAll++;
      if ((st.launched ? st.delivered[k as ItemId] ?? 0 : Math.max(st.delivered[k as ItemId] ?? 0, st.ship[k as ItemId] ?? 0)) >= n!) goalsDone++;
    }
    const inv = st.inventory;
    const invIds = ITEM_ORDER.filter((id) => (inv[id] ?? 0) > 0);
    const resHtml = this.editor
      ? `<span class="inv-empty">∞ ${t('ed_free')}</span>`
      : invIds.map((id) => {
          // a count that just changed flashes once (green up, amber down)
          const prev = this.lastInv[id];
          const ch = prev === undefined || prev === inv[id] ? '' : inv[id]! > prev ? 'up' : 'down';
          return `<button class="inv-item ${ch}" data-chain="${id}" title="${tItem(id)}">${itemImg(id, 'icon sm')}<b>${inv[id]}</b></button>`;
        }).join('') || `<span class="inv-empty">${t('inventory')}</span>`;
    this.lastInv = { ...inv };
    const tog = (act: string, ico: string, label: string, on: boolean) => `<button class="hd-toggle ${on ? 'on' : ''}" data-act="${act}">${icon(ico, 'sm')}<span>${label}</span><i>${on ? t('on') : t('off')}</i></button>`;
    const drawerHtml = !this.drawerOpen ? '' : `<div class="hud-drawer ${this.hudAnim === 'drawer' ? 'anim' : ''}">
        <section><h4>${t('hud_view')}</h4>
          ${hasCard ? tog('toggle-mission', 'flag', t('hud_goals'), this.missionOpen) : ''}
          ${tog('minimap', 'minimap', t('minimap'), this.minimapOpen)}
          ${tog('overlay', 'scan', t('overlay'), this.renderer.overlay)}
        </section>
        <section><h4>${t('hud_controls')}</h4>
          ${playground ? '' : `<button class="hd-btn ${openContracts ? 'badge' : ''}" data-act="contracts" data-badge="${openContracts}">${icon('contracts', 'sm')}<span>${t('contracts')}</span></button>
          <button class="hd-btn" data-act="upgrades">${icon('research', 'sm')}<span>${t('upgrades')}</span></button>`}
          <button class="hd-btn" data-act="speed">${icon('fast', 'sm')}<span>${t('speed')} ${Math.max(1, this.cb.getSpeed())}×</span></button>
          <button class="hd-btn" data-act="center">${icon('center', 'sm')}<span>${t('reset_view')}</span></button>
          ${fullscreenAvailable() ? `<button class="hd-btn" data-act="fullscreen">${icon('fullscreen', 'sm')}<span>${t('fullscreen')}</span></button>` : ''}
          <button class="hd-btn" data-act="menu">${icon('menu', 'sm')}<span>${t('menu')}</span></button>
        </section>
        ${this.editor ? '' : `<section class="wide"><h4>${t('inventory')}</h4>${this.printStripHtml()}<div class="hd-store">${invIds.map((id) => `<button class="hd-item" data-chain="${id}">${itemImg(id, 'icon sm')}<span>${tItem(id)}</span><b>${inv[id]}</b></button>`).join('') || `<span class="inv-empty">—</span>`}</div></section>`}
      </div>`;
    const topHtml = `
      <div class="hud-bar">
        ${hasCard ? `<button class="hb-mission ${missionShown ? 'open' : ''} ${!missionShown && this.koraMsgT > 0 ? 'talk' : ''}" data-act="toggle-mission" title="${t('hud_goals')}">
          <img src="${uiUrl('kora.webp')}" alt="">
          <span class="hb-mtext"><small>${chipTop}</small><b>${chipTitle}</b></span>
          <em class="hb-short">${tut ? `${st.tutorialStep + 1}/${steps.length}` : m && !this.sim.challenge() && !st.launched ? `${st.missionIndex + 1}/${MISSIONS.length}` : goalsAll ? `${goalsDone}/${goalsAll}` : ''}</em>
          ${goalsAll ? `<span class="hb-prog ${goalsDone === goalsAll ? 'done' : ''}">${goalsDone}/${goalsAll}</span>` : ''}
          <span class="hb-chev">${icon('chevron', 'sm')}</span>
        </button>` : `<span class="hb-mode">${t('mode_playground')} <small>${st.width}×${st.height}</small></span>`}
        <div class="hb-res">${resHtml}${this.printStripHtml()}</div>
        <div class="hb-right">
          <div class="power ${low ? 'low' : ''} ${st.storm > 0 ? 'storm' : ''}" title="${t('power')}">
            <span class="plabel">${st.storm > 0 ? icon('storm', 'sm') : icon('bolt', 'sm')} ${demand}/${supply}</span>
            <div class="pbar"><div class="pfill" style="width:${ratio * 100}%"></div></div>
          </div>
          <button class="pill ${nProblems ? 'warn' : 'ok'}" data-act="diag">${nProblems ? `${icon('warn')} ${nProblems}` : icon('check')}</button>
          <span class="hb-clock" title="${t('playtime')}"></span>
          <div class="hb-pod">
            <button class="iconbtn ${this.cb.getSpeed() === 0 ? 'active' : ''}" data-act="pause" title="${t('pause')} (Space)">${this.cb.getSpeed() === 0 ? icon('play') : icon('pause')}</button>
            <button class="iconbtn speed ${this.cb.getSpeed() > 1 ? 'active' : ''}" data-act="speed" title="${t('speed')} (F)">${this.cb.getSpeed() > 1 ? `<b>${this.cb.getSpeed()}×</b>` : icon('fast')}</button>
            <button class="iconbtn hb-menu" data-act="menu" title="${t('menu')} (Esc)">${icon('menu')}</button>
            <button class="iconbtn hb-expand ${this.drawerOpen ? 'active' : ''}" data-act="drawer" title="${t('hud_more')}">${icon('chevron')}</button>
          </div>
        </div>
      </div>
      ${drawerHtml}
      ${missionShown ? `<button class="kora-card ${this.hudAnim === 'mission' ? 'anim' : ''}" data-act="missions">
        <img class="kora-avatar ${tut ? 'talk' : ''}" src="${uiUrl('kora.webp')}" alt="KORA">
        <div class="kora-body">${body}</div>
      </button>` : ''}`;
    this.hudAnim = null;
    if (topHtml === this.lastTopHtml) return;
    this.lastTopHtml = topHtml;
    this.top.innerHTML = topHtml;
    // looping glows (KORA, warnings) continue on the same beat instead of starting over with the new elements
    const now = performance.now() / 1000;
    this.top.querySelectorAll<HTMLElement>('.kora-avatar, .hb-mission img, .pill.warn').forEach((e) => {
      const dur = parseFloat(getComputedStyle(e).animationDuration) || 0;
      if (dur > 0) e.style.animationDelay = `-${(now % dur).toFixed(3)}s`;
    });
    this.top.onclick = (e) => {
      const target = (e.target as HTMLElement).closest('[data-act], [data-chain]') as HTMLElement | null;
      if (!target) return;
      const act = target.dataset.act;
      if (!act && target.dataset.chain) return this.showChain(target.dataset.chain as ItemId);
      if (act === 'kora-action') {
        e.stopPropagation();
        this.koraAction?.run();
      } else if (act === 'missions') { if (this.sim.challenge()) this.challengeStart(); else this.showMissions(); }
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
        this.saveHudPrefs();
        this.lastTopHtml = '';
        this.renderTop();
      } else if (act === 'toggle-mission' || act === 'drawer') {
        if (act === 'drawer') this.drawerOpen = !this.drawerOpen;
        else this.missionOpen = !this.missionOpen;
        this.hudAnim = act === 'drawer' ? 'drawer' : 'mission'; // slides in once, not on every refresh
        sfx.select();
        this.saveHudPrefs();
        this.lastTopHtml = '';
        this.renderTop();
      } else if (act === 'fullscreen') toggleFullscreen();
      else if (act === 'printer') this.openPrinter();
      else if (target.dataset.chain) this.showChain(target.dataset.chain as ItemId);
    };
  }

  private saveHudPrefs() {
    try {
      localStorage.setItem('pe_hud', JSON.stringify({ mission: this.missionOpen, drawer: this.drawerOpen, minimap: this.minimapOpen }));
    } catch {
      /* private mode: the defaults next time */
    }
  }

  private loadHudPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('pe_hud') ?? 'null') as { mission?: boolean; drawer?: boolean; minimap?: boolean } | null;
      if (!p) return;
      this.missionOpen = p.mission ?? true;
      this.drawerOpen = p.drawer ?? false;
      this.minimapOpen = p.minimap ?? this.minimapOpen;
    } catch {
      /* ignore */
    }
  }

  koraSay(msg: string, seconds = 8, action: { label: string; run: () => void } | null = null) {
    this.koraMsg = msg;
    this.koraMsgT = seconds;
    this.koraAction = action;
  }

  private lastIntroAt = -1e9;

  /**
   * First-time explanations: the first time a newer mechanic shows up in a game, KORA explains it once and
   * offers to show it. Returns true when she said something.
   */
  private introHint(): boolean {
    const st = this.sim.state;
    const now = st.time;
    if (now - this.lastIntroAt < 25 || this.koraMsgT > 0) return false;
    const seen = (st.hintsSeen ??= []);
    const story = st.options.mode !== 'playground' && st.options.mode !== 'challenge';
    const focus = (b: Building) => () => {
      const sz = BUILDINGS[b.type].size;
      this.renderer.centerOn(b.x + sz / 2 - 0.5, b.y + sz / 2 - 0.5, Math.max(this.renderer.cam.zoom, 1));
      this.selectBuilding(b);
      this.koraMsgT = 0;
    };
    const machine = (b: Building) => BUILDINGS[b.type].kind === 'machine' || BUILDINGS[b.type].kind === 'miner';
    const far = st.buildings.find((b) => b.site && b.deliver);
    const worn = st.buildings.find((b) => machine(b) && (b.wear ?? 0) >= 0.75);
    const auto = st.contracts.find((c) => c.kind && c.kind !== 'amount');
    const list: { id: string; when: () => boolean; label: string; run: () => void }[] = [
      { id: 'kits', when: () => st.options.mode !== 'playground' && st.buildings.length >= 3 && now > 15, label: t('intro_show_printer'), run: () => { this.koraMsgT = 0; this.openPrinter(); } },
      { id: 'far', when: () => !!far, label: t('show'), run: () => far && focus(far)() },
      { id: 'research', when: () => story && PROJECTS.some((p) => this.sim.projectState(p.id) === 'open'), label: t('research'), run: () => { this.koraMsgT = 0; this.showUpgrades(); } },
      { id: 'wear', when: () => !!worn, label: t('show'), run: () => worn && focus(worn)() },
      { id: 'automation', when: () => !!auto, label: t('contracts'), run: () => { this.koraMsgT = 0; this.showContracts(); } },
      { id: 'merger', when: () => story && st.unlockedBuildings.includes('merger') && !st.options.allUnlocked, label: t('bp_title'), run: () => { this.koraMsgT = 0; this.showBuildingBlueprint('merger'); } },
    ];
    for (const h of list) {
      if (seen.includes(h.id) || !h.when()) continue;
      seen.push(h.id);
      this.lastIntroAt = now;
      this.lastHintAt = Math.max(this.lastHintAt, now - 45); // problem hints wait a little after an explanation
      this.koraSay(`💡 ${t(`intro_${h.id}` as 'intro_kits')}`, 22, { label: h.label, run: h.run });
      this.lastTopHtml = '';
      return true;
    }
    return false;
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
    if (this.introHint()) return;
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
    const tutStep = st.tutorialStep;
    const hint: BuildingId | null = tutStep === 0 ? 'miner' : tutStep === 1 ? 'conveyor' : tutStep === 3 ? 'smelter' : tutStep === 5 ? 'printer' : null;
    // tabs: only groups with something unlocked; the flat list stays when a single group is available
    const groups = BUILD_GROUPS.filter((g) => g.items.some((id) => this.editor || st.unlockedBuildings.includes(id)));
    if (!groups.some((g) => g.id === this.buildTab) && groups.length) this.buildTab = groups[0].id;
    const tabItems = groups.length > 1 ? new Set(groups.find((g) => g.id === this.buildTab)!.items) : null;
    const tabsHtml = groups.length > 1 ? `<div class="build-tabs">${groups.map((g) => `<button class="chip ${g.id === this.buildTab ? 'active' : ''}" data-btab="${g.id}">${t(`group_${g.id}` as 'group_logistics')}</button>`).join('')}</div>` : '';
    let slot = 0; // number keys 1–9 pick the first nine parts of the open tab
    const buildHtml = BUILD_ORDER.filter((id) => !tabItems || tabItems.has(id)).map((id) => {
      const def = BUILDINGS[id];
      const unlocked = this.editor || st.unlockedBuildings.includes(id);
      const affordable = this.editor || this.sim.canBuild(id);
      const kitN = this.editor || this.sim.creative ? 0 : st.kits?.[id] ?? 0;
      const active = this.tool.kind === 'build' && this.tool.type === id;
      const key = ++slot <= 9 ? `<kbd class="bkey">${slot}</kbd>` : '';
      return `<button class="build-btn ${active ? 'active' : ''} ${unlocked ? '' : 'locked'} ${affordable ? '' : 'poor'} ${hint === id ? 'hint' : ''}" data-build="${id}" ${unlocked ? '' : 'disabled'}>
          ${key}<img src="${buildingUrl(id)}" alt="" draggable="false">
          <span class="bname">${tBuilding(id)}</span>
          <span class="bcost">${unlocked ? costHtml(def.cost, inv) : '🔒'}</span>
          ${def.power ? `<span class="bpower ${def.power < 0 ? 'gen' : ''}">⚡${Math.abs(def.power)}</span>` : ''}
          ${kitN ? `<span class="bkit" title="${t('printer_kits')}">×${kitN}</span>` : ''}
        </button>`;
    }).join('');
    const delActive = this.tool.kind === 'delete';
    const paintTool = this.tool.kind === 'paint' ? this.tool : null;
    const terrains: (TerrainId | 'core')[] = ['ground', 'rock', 'iron_ore', 'copper_ore', 'quartz', 'ice', 'oil', ...(this.sim.coreHidden ? [] : ['core' as const])];
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
      ${this.editor && this.editorTab === 'terrain' ? '' : tabsHtml}
      <div class="build-row">
        <div class="build-bar">${this.editor && this.editorTab === 'terrain' ? paletteHtml : buildHtml}</div>
        <div class="tool-col">
          <button class="iconbtn big" data-act="rotate" title="${t('rotate')} (R)">${icon('rotate')}<kbd>R</kbd></button>
          <button class="iconbtn big ${delActive ? 'danger-active' : ''}" data-act="delete" title="${t('delete')} (X)">${icon('close')}<kbd>X</kbd></button>
          <button class="iconbtn big ${this.undoStack.length ? '' : 'dim'}" data-act="undo" title="${t('undo')} (Z)">${icon('undo')}<kbd>Z</kbd></button>
          <button class="iconbtn big ${this.tool.kind === 'select' ? 'active' : ''}" data-act="copy" title="${t('copy')} (C)">${icon('copy')}<kbd>C</kbd></button>
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
      if (target.dataset.act === 'printer') {
        this.openPrinter();
        return;
      }
      if (target.dataset.btab) {
        this.buildTab = target.dataset.btab;
        try { localStorage.setItem('pe_buildtab', this.buildTab); } catch { /* ignore */ }
        sfx.select();
        this.renderBottom();
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
      return JSON.parse(kv.get('pe_blueprints') ?? '[]') as Blueprint[];
    } catch {
      return [];
    }
  }

  private storeBlueprints(list: Blueprint[]) {
    kv.set('pe_blueprints', JSON.stringify(list.slice(0, 24)));
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
    const wall: Blueprint = { name: t('preset_wall'), w: 18, h: 9, items: [{ type: 'screen', dx: 0, dy: 0, dir: 0, recipe: null }, { type: 'speaker', dx: 0, dy: 1, dir: 0, recipe: null }, { type: 'speaker', dx: 0, dy: 2, dir: 0, recipe: null }, { type: 'oscillator', dx: 0, dy: 3, dir: 0, recipe: null }] };
    for (let y = 0; y < 8; y++) wall.items.push({ type: 'bus', dx: 1, dy: y, dir: 0, recipe: null });
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) wall.items.push({ type: 'matrix', dx: 2 + x, dy: y, dir: 0, recipe: null, value: 16 });
    for (let x = 0; x < 8; x++) wall.items.push({ type: 'register', dx: 1 + x, dy: 8, dir: 1, recipe: null });
    // keypad: 4 rows of 4 keys, a bus trace between the rows and one column joining them; wire the column to a terminal
    const keypad: Blueprint = { name: t('preset_keypad'), w: 5, h: 8, items: [] };
    const keys = [[1, 2, 3, 0xc], [4, 5, 6, 0xd], [7, 8, 9, 0xe], [0xa, 0, 0xb, 0xf]];
    for (let r = 0; r < 4; r++) {
      for (let x = 0; x < 5; x++) keypad.items.push({ type: 'bus', dx: x, dy: r * 2, dir: 0, recipe: null });
      keypad.items.push({ type: 'bus', dx: 4, dy: r * 2 + 1, dir: 0, recipe: null });
      keys[r].forEach((k, x) => keypad.items.push({ type: 'switch', dx: x, dy: r * 2 + 1, dir: 0, recipe: null, threshold: k, mode: 'pulse', open: false }));
    }
    return [board, grid(t('preset_display', { w: 5, h: 7 }), 5, 7), grid(t('preset_display', { w: 8, h: 8 }), 8, 8), matrix, wall, keypad, this.displayBlueprint()];
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
  /** A tap on the landscape: what it is, a line about it, and for rivers, lakes and volcanoes that nothing stands there. */
  private showScenery(x: number, y: number, s: { key: string; kind: string; feature?: boolean }) {
    this.selected = null;
    this.renderer.selected = null;
    this.renderer.selectedTile = { x, y };
    this.renderer.fxScenery(s.key, x, y);
    this.floating.classList.add('hidden');
    const liquid = s.kind === 'lava' || s.kind === 'metal' || s.kind === 'water';
    const img = liquid && s.feature ? `<span class="liquid-swatch ${s.kind}"></span>` : `<img src="${decoUrl(s.kind)}" alt="" draggable="false">`;
    const blocked = s.feature ? `<div class="status bad">${t(s.key.endsWith('_lake') || s.key === 'volcano' ? 'sc_blocked' : 'sc_blocked_river')}</div>` : '';
    this.info.innerHTML = `
      <div class="info-head">
        ${img}
        <div class="info-title"><b>${t(`sc_${s.key}` as 'sc_volcano')}</b><small>${t('sc_landscape')} · ${x}, ${y}</small></div>
        <button class="iconbtn" data-act="close">${icon('close')}</button>
      </div>
      <div class="info-body"><p class="sc-text">${t(`sc_${s.key}_d` as 'sc_volcano_d')}</p>${blocked}</div>`;
    const wasHidden = this.info.classList.contains('hidden');
    this.info.classList.remove('hidden');
    if (wasHidden) this.panelOpenedAt = performance.now();
    requestAnimationFrame(() => this.ensureVisible(x, y, 1, 1));
    this.info.onclick = (e) => {
      if (this.panelJustOpened()) return;
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (target?.dataset.act === 'close') this.selectBuilding(null);
    };
  }

  selectTile(x: number, y: number) {
    const st = this.sim.state;
    const scenery = this.renderer.sceneryAt(x, y);
    if (scenery) {
      this.showScenery(x, y, scenery);
      return;
    }
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
      return `<div class="status ${s === 'ok' ? '' : 'bad'}">${txt}${extra}</div>${wearHtml(this.sim, b)}`;
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
      const hall = isHall(b.type);
      const hallHead = hall
        ? `<div class="lbl">${t('hall_slots', { used: this.sim.hallUsed(b), n: this.sim.hallSlots(b) })} · ${t('hall_items', { n: Object.values(b.store ?? {}).reduce((a, c) => a + (c ?? 0), 0), cap: this.sim.hallSlots(b) * HALL_SLOT_CAP })}</div>
          <div class="dirs"><span class="lbl">${t('hall_mode')}</span><button class="chip ${b.mode !== 'pass' ? 'active' : ''}" data-mode="hold">${t('hall_hold')}</button><button class="chip ${b.mode === 'pass' ? 'active' : ''}" data-mode="pass">${t('hall_pass')}</button></div>
          <p class="save-hint">${t('hall_hint')}</p>`
        : '';
      const items = Object.entries(b.store ?? {})
        .map(([k, n]) => `<span class="buf">${itemImg(k as ItemId, 'icon sm')}${n}</span>`)
        .join('');
      const filterable = Array.from(new Set([...Object.keys(b.store ?? {}), ...(b.recipe ? [b.recipe] : [])])) as ItemId[];
      body = `${hallHead}<div class="bufs"><span class="lbl">${t('stored')}</span>${items || '–'}</div>${dirPicker}
        <div class="lbl">${t('filter')}</div>
        <div class="recipes"><button class="recipe ${!b.recipe ? 'active' : ''}" data-filter="">${t('no_filter')}</button>
        ${filterable.map((k) => `<button class="recipe ${b.recipe === k ? 'active' : ''}" data-filter="${k}">${itemImg(k, 'icon')}<div class="r-name">${tItem(k)}</div></button>`).join('')}</div>`;
    } else if (b.type === 'mast') {
      const net = this.sim.radioNet();
      const n = this.sim.state.buildings.filter((x) => (x.type === 'radio' || x.type === 'mast') && x !== b && net.get(x.id) === net.get(b.id)).length;
      body = `${statusLine(` · ${t('mast_links', { n })}`)}<p class="save-hint">${t('mast_hint')}</p>`;
    } else if (b.type === 'battery') {
      const frac = Math.min(1, (b.value ?? 0) / BATTERY_CAP);
      body = `<div class="lbl">${t('battery_charge')} ${Math.round(b.value ?? 0)} / ${BATTERY_CAP}</div><div class="pbar big"><div class="pfill" style="width:${frac * 100}%"></div></div><p class="save-hint">${t('battery_hint')}</p>`;
    } else if (b.type === 'wind') {
      const w = this.sim.windFactor();
      body = `${statusLine()}<div class="lbl">${t('wind_now', { p: Math.round(w * 100), w: Math.round(-BUILDINGS.wind.power * this.sim.factor('power') * w) })}</div><div class="pbar big"><div class="pfill" style="width:${Math.min(100, w * 100)}%"></div></div><p class="save-hint">${t('wind_hint')}</p>`;
    } else if (PLANT_FUEL[b.type]) {
      const fuel = PLANT_FUEL[b.type]!.item;
      body = `${statusLine()}<div class="bufs"><span class="lbl">${t('fuel_left')}</span><span class="buf">${itemImg(fuel, 'icon sm')}${b.input?.[fuel] ?? 0}</span> <span class="buf">${Math.ceil(b.fuelSeconds ?? 0)}s</span></div>${dirPicker}`;
    } else if (b.type === 'core') {
      const parts = Object.entries(SHIP_PARTS)
        .map(([k, n]) => {
          const have = Math.min(n!, st.ship[k as ItemId] ?? 0);
          return `<div class="mrow ${have >= n! ? 'done' : ''}" style="--p:${Math.round((have / n!) * 100)}%">${itemImg(k as ItemId, 'icon sm')}<span class="mname">${tItem(k as ItemId)}</span><span class="mcount">${have}/${n}</span></div>`;
        })
        .join('');
      const p = Math.round(this.sim.shipProgress() * 100);
      body = st.options.mode === 'playground'
        ? `<p class="save-hint">${t('core_playground')}</p>`
        : `<div class="term-btns"><button class="btn small primary" data-act="printer">${icon('print', 'sm')} ${t('printer_title')}</button></div><div class="lbl">${t('ship_progress')} ${p}%</div><div class="pbar big"><div class="pfill" style="width:${p}%"></div></div><div class="mrows">${parts}</div>`;
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
          ${mem.have < mem.need ? `<button class="btn small primary" data-act="term-wire">${icon('plus', 'sm')} ${t('term_wire', { n: mem.need - mem.have })}</button>` : ''}
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
        <div class="cpu-state" id="cpu-state">${cpuStateHtml(this.sim, b)}</div>
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
      else if (b.type === 'kitport') {
        const types = Array.from(new Set(this.sim.state.buildings.filter((x) => x.site && x.deliver).map((x) => x.type)));
        body = `${statusLine(` · ${b.acc ?? 0} ${t('kitport_sent')}`)}<p class="save-hint">${t('kitport_hint')}</p>${dirPicker}
          <div class="lbl">${t('kitport_only')}</div><div class="recipes"><button class="recipe ${!b.recipe ? 'active' : ''}" data-kitfilter="">${t('any_item')}</button>${[...new Set([...(b.recipe ? [b.recipe as BuildingId] : []), ...types])].map((k) => `<button class="recipe ${b.recipe === k ? 'active' : ''}" data-kitfilter="${k}"><img class="icon" src="${buildingUrl(k)}" alt=""><div class="r-name">${tBuilding(k)}</div></button>`).join('')}</div>`;
      } else if (b.type === 'stacker') {
        const unpack = b.mode === 'unpack', n = b.bufL?.length ?? 0;
        body = `${statusLine(` · ${n}/${CRATE_SIZE}${b.bufL?.length ? ` ${itemImg(b.bufL[0], 'icon sm')}` : ''} · ${b.acc ?? 0} ${t('stacker_crates')}`)}
          <div class="dirs"><span class="lbl">${t('stacker_mode')}</span><button class="chip ${unpack ? '' : 'active'}" data-mode="pack">${t('stacker_pack')}</button><button class="chip ${unpack ? 'active' : ''}" data-mode="unpack">${t('stacker_unpack')}</button></div>
          <p class="save-hint">${t(unpack ? 'stacker_hint_unpack' : 'stacker_hint_pack')}</p>${dirPicker}`;
      } else if (b.type === 'service') {
        const store = b.store ?? {};
        const area = this.sim.serviceArea(b);
        const worn = area.filter((m) => (m.wear ?? 0) >= 0.75).length;
        body = `${statusLine()}
          <div class="bufs"><span class="lbl">${t('service_stock')}</span>${Object.entries(SERVICE_STOCK).map(([k, cap]) => `<span class="buf">${itemImg(k as ItemId, 'icon sm')}${store[k as ItemId] ?? 0}<small>/${cap}</small></span>`).join('')}</div>
          <div class="lbl">${t('service_area', { n: area.length, w: worn, r: SERVICE_RANGE, d: b.acc ?? 0 })}</div>
          <p class="save-hint">${t('service_hint')}</p>`;
      } else if (b.type === 'recycler') {
        const q = b.bufR ?? [], out = b.bufL ?? [];
        body = `${statusLine()}
          <div class="bufs"><span class="lbl">${t('recycler_in')}</span>${q.map((k) => itemImg(k, 'icon sm')).join('') || '–'}<span class="lbl">${t('recycler_out')}</span>${out.slice(0, 8).map((k) => itemImg(k, 'icon sm')).join('') || '–'}</div>
          <div class="lbl">${t('recycler_done', { n: b.acc ?? 0 })}</div>
          <p class="save-hint">${t('recycler_hint')}</p>${dirPicker}`;
      } else if (b.type === 'dock') {
        const unload = b.mode === 'unload', buf = b.bufL ?? [];
        const counts: Partial<Record<string, number>> = {};
        for (const it of buf) counts[it] = (counts[it] ?? 0) + 1;
        body = `${statusLine(` · ${buf.length}/${DOCK_CAP}`)}
          <div class="dirs"><span class="lbl">${t('dock_mode')}</span><button class="chip ${unload ? '' : 'active'}" data-mode="load">${t('dock_load')}</button><button class="chip ${unload ? 'active' : ''}" data-mode="unload">${t('dock_unload')}</button></div>
          <div class="bufs"><span class="lbl">${t('dock_buffer')}</span>${Object.entries(counts).map(([k, n]) => `<span class="buf">${itemImg(k as ItemId, 'icon sm')}${n}</span>`).join('') || '–'}</div>
          ${unload ? '' : `<div class="dirs"><span class="lbl">${t('dock_min')}</span>${[1, 2, 4, 6, 8].map((n) => `<button class="chip ${(b.threshold ?? 1) === n ? 'active' : ''}" data-dockmin="${n}">${n}</button>`).join('')}</div>`}
          <p class="save-hint">${t(unload ? 'dock_hint_unload' : 'dock_hint_load')}${unload ? '' : ` ${t('dock_min_hint')}`}</p>${unload ? dirPicker : ''}${picker(t('dock_filter'))}`;
      } else if (b.type === 'depot') {
        const mine = this.sim.robots().filter((r) => r.depot === b.id);
        const want = b.threshold ?? 2, owned = this.sim.depotRobots(b), stock = st.inventory.robot ?? 0;
        const ownedLine = this.sim.creative ? '' : `<div class="lbl">${t('depot_owned', { n: owned, max: DEPOT_ROBOTS_MAX })}</div>
          ${owned < DEPOT_ROBOTS_MAX ? `<div class="term-btns"><button class="btn small ${stock ? 'primary' : ''}" data-act="depot-add" ${stock ? '' : 'disabled'}>${itemImg('robot', 'icon sm')} ${t('depot_add', { n: stock })}</button></div>` : ''}
          ${owned ? '' : `<p class="save-hint">${t('depot_none')}</p>`}`;
        body = `${statusLine(` · ${mine.length} ${t('depot_robots')}`)}${ownedLine}
          <div class="dirs"><span class="lbl">${t('depot_fleet')}</span>${Array.from({ length: DEPOT_ROBOTS_MAX }, (_, i) => i + 1).map((n) => `<button class="chip ${want === n ? 'active' : ''}" data-threshold="${n}">${n}</button>`).join('')}</div>
          <div class="bufs">${mine.map((r) => `<span class="buf">${r.items.length ? itemImg(r.items[0], 'icon sm') : '🤖'} ${t(`robot_${r.state}` as 'robot_idle')}${r.items.length ? ` ×${r.items.length}` : ''} · 🔋${Math.round((r.charge ?? 1) * 100)}%</span>`).join('') || '–'}</div>
          <p class="save-hint">${t('depot_hint')}</p>`;
      } else if (b.type === 'picker') {
        const reach = b.threshold === 2 ? 2 : 1;
        body = `${statusLine(` · ${b.acc ?? 0} ${t('picker_moved')}`)}
          <div class="dirs"><span class="lbl">${t('picker_reach')}</span><button class="chip ${reach === 1 ? 'active' : ''}" data-threshold="1">1</button><button class="chip ${reach === 2 ? 'active' : ''}" data-threshold="2">2</button></div>
          <p class="save-hint">${t('picker_hint')}</p>${dirPicker}${picker(t('picker_filter'))}`;
      }
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
          ${(() => {
            const s = this.sim.screenStats(b);
            const k = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : n >= 1000 ? (n / 1000).toFixed(0) + ' k' : String(Math.round(n)));
            const okCap = s.capPx >= s.needPx, okMem = s.rows >= s.h, okBud = s.budget > 0;
            return `<div class="term-parts">
              <div class="tp"><span>${itemImg((b.recipe as ItemId | null) ?? 'copper_wire', 'icon xs')} ${t('vid_phosphor')}</span><b class="${okBud ? '' : 'bad'}">${(s.budget / 1e6).toFixed(1)} / ${s.budgetMax / 1e6} M px</b><small>${t('vid_phosphor_hint')}</small></div>
              <div class="tp"><span>${t('vid_lanes')}</span><b class="${okCap ? '' : 'bad'}">${s.lanes} × ${s.hz >= 1000 ? (s.hz / 1000).toFixed(1) + ' kHz' : s.hz + ' Hz'} = ${k(s.capPx)} px/s</b><small>${t('vid_lanes_hint', { need: k(s.needPx) })}</small></div>
              <div class="tp"><span>${t('vid_memory')}</span><b class="${okMem ? '' : 'bad'}">${s.cells} × 4096 px = ${s.rows}/${s.h} ${t('vid_rows')}</b><small>${t('vid_memory_hint')}</small></div>
            </div>`;
          })()}
          ${(() => { const m = this.sim.screenMissing(b); return m.cells + m.lanes + m.oscillators ? `<div class="term-btns"><button class="btn small primary" data-act="vid-wire">${icon('plus', 'sm')} ${t('vid_wire', { c: m.cells, l: m.lanes, o: m.oscillators })}</button></div>` : ''; })()}
          <div class="dirs wrap"><span class="lbl">${t('vid_sample')}</span>${(['scan', 'avg', 'centre', 'off'] as const).map((m) => `<button class="chip ${(b.mode ?? 'scan') === m ? 'active' : ''}" data-smode="${m}">${t(`vid_sample_${m}` as 'vid_sample_scan')}</button>`).join('')}</div>
          <p class="save-hint">${t('vid_sample_hint')}</p>
          <div class="lbl">${(() => { const n = this.sim.speakersOf(b).length; return live ? (this.cb.videoHasAudio(b) ? (n ? `🔊 ${t('vid_sound_on', { n })}` : `🔇 ${t('vid_sound_nospeaker')}`) : `🔇 ${t('vid_sound_none')}`) : `🔈 ${t('vid_sound_idle', { n })}`; })()}</div>
          <p class="save-hint">${t('vid_hint')}</p>`;
      } else if (b.type === 'timer') {
        const period = b.threshold ?? 3;
        body = `<div class="lbl">${b.open !== false ? `<span class="okline">${t('switch_on')}</span>` : t('switch_off')} · ${t('timer_next', { s: Math.max(0, b.timer ?? period).toFixed(1) })}</div>
          <div class="dirs wrap"><span class="lbl">${t('timer_period')}</span>${TIMER_PERIODS.map((p) => `<button class="chip ${period === p ? 'active' : ''}" data-threshold="${p}">${p} s</button>`).join('')}</div>
          <p class="save-hint">${t('timer_hint')}</p>${dirPicker}`;
      } else if (b.type === 'sensor') {
        body = `${statusLine(` · ${b.acc ?? 0} ${t('sensor_count')}`)}<p class="save-hint">${t('sensor_hint')}</p>${dirPicker}`;
      } else if (b.type === 'radio') {
        const ch = b.threshold ?? 1, rx = b.mode === 'rx';
        const inFlight = this.sim.radioQueue(ch).length;
        const net = this.sim.radioNet();
        const peers = this.sim.state.buildings.filter((x) => x.type === 'radio' && x !== b && !x.site && (x.threshold ?? 1) === ch && x.mode !== b.mode && net.get(x.id) === net.get(b.id)).length;
        body = `${statusLine(` · ${t('radio_inflight', { n: inFlight })} · ${t(rx ? 'radio_hears' : 'radio_reaches', { n: peers })}`)}
          <div class="dirs"><span class="lbl">${t('radio_mode')}</span><button class="chip ${rx ? '' : 'active'}" data-mode="tx">${t('radio_tx')}</button><button class="chip ${rx ? 'active' : ''}" data-mode="rx">${t('radio_rx')}</button></div>
          <div class="dirs wrap"><span class="lbl">${t('radio_channel')}</span>${Array.from({ length: RADIO_CHANNELS }, (_, i) => i + 1).map((c) => `<button class="chip ${ch === c ? 'active' : ''}" data-threshold="${c}">${c}</button>`).join('')}</div>
          <p class="save-hint">${t('radio_hint')}</p>${dirPicker}`;
      } else if (b.type === 'keyboard') {
        const tm = this.sim.keyboardTerminal(b);
        const rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM.:/'];
        const keyBtn = (ch: string) => `<button class="kb" data-kbc="${ch.charCodeAt(0)}">${ch}</button>`;
        body = `<div class="lbl">${tm ? `<span class="okline">● ${t('kb_linked')}</span>` : `<span class="bad">○ ${t('kb_unlinked')}</span>`}</div>
          <div class="kbd">${rows.map((r) => `<div class="kbrow">${[...r].map(keyBtn).join('')}</div>`).join('')}
            <div class="kbrow"><button class="kb wide" data-kbc="8">⌫</button><button class="kb space" data-kbc="32">${t('kb_space')}</button><button class="kb wide" data-kbc="13">↵</button></div>
          </div>
          <input class="text-input" id="kbinput" type="text" autocomplete="off" autocapitalize="characters" placeholder="${t('kb_type_here')}">
          <p class="save-hint">${t('kb_hint')}</p>`;
      } else if (b.type === 'speaker') {
        const rx = this.sim.linkedReceiver(b);
        const vol = b.value ?? 7;
        body = `<div class="lbl">${rx ? `<span class="okline">● ${t('spk_linked')}</span>` : `<span class="bad">○ ${t('spk_unlinked')}</span>`}</div>
          <div class="dirs wrap"><span class="lbl">${t('spk_volume')}</span>${[0, 2, 4, 6, 8, 10].map((v) => `<button class="chip ${vol === v ? 'active' : ''}" data-value="${v}">${v === 0 ? t('off') : v * 10 + '%'}</button>`).join('')}</div>
          <p class="save-hint">${t('spk_hint')}</p>`;
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
    const own = itemColor((b.recipe as ItemId) ?? 'copper_wire');
    const W = cpu.hires ? HIRES_W : CHIP8_W, Hh = cpu.hires ? HIRES_H : CHIP8_H, buf = cpu.hires ? cpu.fb : cpu.display;
    const px = canvas.width / W, py = canvas.height / Hh;
    for (let y = 0; y < Hh; y++)
      for (let x = 0; x < W; x++) {
        const v = buf[y * W + x] & 15;
        if (!v) continue;
        const it = CHIP8_PALETTE[v];
        c2.fillStyle = it ? itemColor(it) : own;
        c2.fillRect(x * px, y * py, px - 0.5, py - 0.5);
      }
  }

  private installTerminalKeys() {
    const map: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 0xc, q: 4, w: 5, e: 6, r: 0xd, a: 7, s: 8, d: 9, f: 0xe, z: 0xa, y: 0xa, x: 0, c: 0xb, v: 0xf };
    const handler = (down: boolean) => (e: KeyboardEvent) => {
      const b = this.selected;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (b?.type === 'keyboard') {
        // a keyboard building: typing on the real keyboard goes to the wired terminal
        if (!down) return;
        const code = e.key === 'Enter' ? 13 : e.key === 'Backspace' ? 8 : e.key.length === 1 ? e.key.toUpperCase().charCodeAt(0) : 0;
        if (code && (code === 8 || code === 13 || (code >= 32 && code <= 95))) {
          e.preventDefault();
          if (this.sim.typeOn(b, code)) sfx.select();
        }
        return;
      }
      if (!b || b.type !== 'terminal') return;
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
    // keyboard building: the text field (phones) forwards every key
    // a shortened description opens in full on a tap
    this.info.addEventListener('click', (e) => {
      const more = (e.target as HTMLElement).closest('[data-more]');
      if (more) more.classList.toggle('open');
    });
    this.info.addEventListener('keydown', (e) => {
      const b = this.selected;
      const input = (e.target as HTMLElement).closest('#kbinput') as HTMLInputElement | null;
      if (!b || b.type !== 'keyboard' || !input) return;
      const code = e.key === 'Enter' ? 13 : e.key === 'Backspace' ? 8 : e.key.length === 1 ? e.key.toUpperCase().charCodeAt(0) : 0;
      if (!code || !(code === 8 || code === 13 || (code >= 32 && code <= 95))) return;
      e.preventDefault();
      if (this.sim.typeOn(b, code)) sfx.select();
      if (code === 13) input.value = '';
      else if (code === 8) input.value = input.value.slice(0, -1);
      else if (input.value.length < 22) input.value += String.fromCharCode(code);
    });
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


  /** Compact printer status at the end of the stock strip (the bar width is updated in refresh). */
  private printStripHtml(): string {
    if (this.editor || this.sim.creative || this.sim.coreHidden) return '';
    const q = this.sim.printQueue();
    const kits = Object.values(this.sim.state.kits ?? {}).reduce((a, c) => a + (c ?? 0), 0);
    const job = q[0];
    return `<button class="print-strip" data-act="printer" title="${t('printer_title')}">${icon('print', 'sm')}${job
      ? `<img class="icon sm" src="${buildingUrl(job.type)}" alt=""><span class="pbar"><span class="pfill" id="printfill"></span></span>${q.length > 1 ? `<b>+${q.length - 1}</b>` : ''}`
      : `<span>${t('printer_ready')}</span>`}<small>${t('kits_total', { n: kits })}</small></button>`;
  }

  private printerOpen = false;

  openPrinter() {
    this.printerOpen = true;
    this.openModal(printerHtml(this.sim), (target) => {
      const act = target.dataset.act;
      if ((act === 'auto-on' || act === 'auto-off') && !this.sim.challenge()) this.sim.state.autoPrint = act === 'auto-on';
      else if (target.dataset.print) {
        const n = this.sim.queuePrint(target.dataset.print as BuildingId, Number(target.dataset.n ?? 1));
        if (!n) this.toast(t('err_cost'), 1500, 'error');
      } else if (target.dataset.cancel !== undefined) this.sim.cancelPrint(Number(target.dataset.cancel));
      else if (target.dataset.bpBuilding) {
        this.printerOpen = false;
        this.showBuildingBlueprint(target.dataset.bpBuilding as BuildingId);
        return;
      }
      else return;
      sfx.select();
      this.renderPrinter();
      this.renderBottom();
    });
    const obs = new MutationObserver(() => {
      if (this.modal.classList.contains('hidden')) {
        this.printerOpen = false;
        obs.disconnect();
      }
    });
    obs.observe(this.modal, { attributes: true, attributeFilter: ['class'] });
  }

  private renderPrinter() {
    if (!this.printerOpen) return;
    const card = this.modal.querySelector('.modal-card');
    if (!card) return;
    const scroll = card.querySelector('.kit-list')?.scrollTop ?? 0;
    card.innerHTML = printerHtml(this.sim);
    const list = card.querySelector('.kit-list');
    if (list) list.scrollTop = scroll;
  }


  showInfo(b: Building) {
    const def = BUILDINGS[b.type];
    this.info.innerHTML = `
      <div class="info-head">
        <img src="${buildingUrl(b.type)}" alt="" draggable="false" data-building="${b.type}" title="${t('bp_title')}">
        <div class="info-title"><b>${tBuilding(b.type)}</b><small class="clamp2" data-more>${tBuildingDesc(b.type)}</small></div>
        <button class="iconbtn" data-act="close">${icon('close')}</button>
      </div>
      <div class="info-body">${b.site ? siteLine(this.sim, b) : ''}${this.infoBody(b)}</div>
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
      if (target.dataset.act === 'printer') {
        this.openPrinter();
        return;
      }
      if (target.dataset.kitfilter !== undefined) {
        b.recipe = target.dataset.kitfilter || null;
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.act === 'repair') {
        if (this.sim.repair(b)) sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.act === 'auto-repair') {
        this.sim.state.autoRepair = this.sim.state.autoRepair === false;
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.act === 'depot-add') {
        if (this.sim.depotAddFromStock(b)) sfx.select();
        this.showInfo(b);
        this.renderBottom();
        return;
      }
      if (target.dataset.dockmin !== undefined) {
        b.threshold = Number(target.dataset.dockmin);
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (target.dataset.mode !== undefined) {
        b.mode = target.dataset.mode as Building['mode'];
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
      if (target.dataset.act === 'term-wire' && b.type === 'terminal') {
        const res = this.sim.autoWireTerminal(b);
        sfx.place();
        this.toast(`${res.incomplete ? '⚠ ' : '✓ '}${t('term_wired', { n: res.cells })}${res.incomplete ? ' · ' + t('wire_incomplete') : ''}`, 5000, res.incomplete ? 'error' : 'success');
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
        if (el) el.innerHTML = cpuStateHtml(this.sim, b);
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
      if (b.type === 'keyboard' && target.dataset.kbc !== undefined) {
        if (this.sim.typeOn(b, Number(target.dataset.kbc))) sfx.select();
        else this.toast(`⚠ ${t('kb_unlinked')}`, 2500, 'error');
        return;
      }
      if (b.type === 'screen' && target.dataset.act === 'vid-wire') {
        const res = this.sim.autoWireScreen(b);
        sfx.place();
        this.toast(`${res.incomplete ? '⚠ ' : '✓ '}${t('vid_wired', { c: res.cells, l: res.lanes, o: res.oscillators })}${res.incomplete ? ' · ' + t('wire_incomplete') : ''}`, 5000, res.incomplete ? 'error' : 'success');
        this.showInfo(b);
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
      if (b.type === 'screen' && target.dataset.smode !== undefined) {
        b.mode = target.dataset.smode as Building['mode'];
        sfx.select();
        this.showInfo(b);
        return;
      }
      if (b.type === 'speaker' && target.dataset.value !== undefined) {
        b.value = Number(target.dataset.value);
        sfx.select();
        this.showInfo(b);
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
      if (b && e.pointerType === 'mouse') this.hoverTip(b);
    });
    this.bottom.addEventListener('pointerout', (e) => {
      if (e.pointerType === 'mouse' && target(e)) this.hideTip();
    });
    // any other material or building icon (mission card, costs, panels, dialogs) explains itself on hover
    const iconOf = (e: Event) => {
      const img = (e.target as HTMLElement).closest('img[data-item], img[data-building]') as HTMLElement | null;
      return img && !img.closest('.tip, .build-btn, .inv-item, .title') ? img : null;
    };
    // panels re-render while the pointer rests on them: the tip looks up whatever icon is under the pointer when it opens
    this.root.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.tipPointer = { x: e.clientX, y: e.clientY };
    }, true);
    this.root.addEventListener('pointerover', (e) => {
      const img = e.pointerType === 'mouse' ? iconOf(e) : null;
      if (img) this.hoverTip(img);
    });
    this.root.addEventListener('pointerout', (e) => {
      if (e.pointerType === 'mouse' && iconOf(e)) this.hideTip();
    });
    // touch: a long press on any icon shows its tip (a short tap still opens the blueprint)
    let press: { x: number; y: number } | null = null;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const img = iconOf(e);
      if (!img) return;
      press = { x: e.clientX, y: e.clientY };
      if (this.tipTimer) clearTimeout(this.tipTimer);
      this.tipTimer = window.setTimeout(() => {
        this.tipTimer = null;
        this.tipSuppressClick = true;
        this.showTip(img);
        if (navigator.vibrate) navigator.vibrate(12);
      }, 600);
    });
    this.root.addEventListener('pointermove', (e) => {
      if (!press || e.pointerType === 'mouse') return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10 && this.tipTimer) {
        clearTimeout(this.tipTimer);
        this.tipTimer = null;
      }
    });
    for (const ev of ['pointerup', 'pointercancel']) this.root.addEventListener(ev, (e) => {
      if ((e as PointerEvent).pointerType === 'mouse' || !press) return;
      press = null;
      if (this.tipTimer && !this.tipSuppressClick) {
        clearTimeout(this.tipTimer);
        this.tipTimer = null;
      }
    });
    // the tap that ends a long press must not open anything
    this.root.addEventListener('click', (e) => {
      if (!this.tipSuppressClick || (e.target as HTMLElement).closest('.tip')) return;
      e.stopPropagation();
      e.preventDefault();
      this.tipSuppressClick = false;
    }, true);
    this.root.addEventListener('contextmenu', (e) => {
      if (iconOf(e)) e.preventDefault();
    });
    // the pointer may travel from the icon into the tip (to press its buttons or follow a link)
    this.tip.addEventListener('pointerenter', () => this.keepTip());
    this.tip.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.hideTip();
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
      this.hideTip(true);
    }, true);
    this.root.addEventListener('pointerdown', (e) => {
      this.tipSuppressClick = false; // a new gesture: a long press that ended without a click must not eat this tap
      if (!(e.target as HTMLElement).closest('.tip')) this.hideTip(true);
    }, true);
    this.tip.onclick = (e) => {
      const c = (e.target as HTMLElement).closest('[data-chain]') as HTMLElement | null;
      if (c) {
        this.hideTip(true);
        this.showChain(c.dataset.chain as ItemId);
      }
    };
  }

  private tipHideTimer: number | null = null;
  private tipPointer: { x: number; y: number } | null = null;

  /** The icon under the pointer now (the one the tip was scheduled for may have been re-rendered away). */
  private underPointer(fallback: HTMLElement): HTMLElement | null {
    if (fallback.isConnected || !this.tipPointer) return fallback;
    const hit = document.elementFromPoint(this.tipPointer.x, this.tipPointer.y) as HTMLElement | null;
    return (hit?.closest('img[data-item], img[data-building], .build-btn, .inv-item') as HTMLElement | null) ?? null;
  }
  private tipFor: HTMLElement | null = null;

  private tipOpen(): boolean {
    return !this.tip.classList.contains('hidden');
  }

  /** Cancel a pending hide (the pointer came back to the icon or into the tip). */
  private keepTip() {
    if (this.tipHideTimer) clearTimeout(this.tipHideTimer);
    this.tipHideTimer = null;
  }

  private showTip(src: HTMLElement) {
    const build = (src.dataset.build ?? src.dataset.building) as BuildingId | undefined;
    const item = (src.dataset.chain ?? src.dataset.item) as ItemId | undefined;
    const html = build && BUILDINGS[build] ? buildingTipHtml(this.sim, build) : item ? itemTipHtml(item) : '';
    if (!html || !src.isConnected) return;
    this.keepTip();
    if (this.tipKeyOf(src) !== this.tipKeyOf(this.tipFor ?? src) || this.tipFor === null || !this.tipOpen()) this.tip.innerHTML = html;
    this.tipKey = this.tipKeyOf(src);
    this.tipFor = src;
    this.tip.classList.remove('hidden');
    const r = src.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 16);
    this.tip.style.width = `${w}px`;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    this.tip.style.left = `${left}px`;
    // above the icon when there is room, else below it; a small overlap keeps the way into the tip open
    if (r.top > window.innerHeight * 0.45) {
      this.tip.style.top = '';
      this.tip.style.bottom = `${window.innerHeight - r.top + 2}px`;
      this.tip.style.maxHeight = `${Math.max(160, r.top - 12)}px`;
    } else {
      this.tip.style.bottom = '';
      this.tip.style.top = `${r.bottom + 2}px`;
      this.tip.style.maxHeight = `${Math.max(160, window.innerHeight - r.bottom - 12)}px`;
    }
  }

  private tipKey = '';

  /** What an element explains (a re-rendered copy of the same icon counts as the same). */
  private tipKeyOf(el: HTMLElement): string {
    return el.dataset.build ?? el.dataset.building ?? el.dataset.chain ?? el.dataset.item ?? '';
  }

  /** The mouse rests on an explainable element: open its tip after a short delay (at once when a tip is open). */
  private hoverTip(el: HTMLElement) {
    const key = this.tipKeyOf(el);
    this.keepTip();
    if (key === this.tipKey && (this.tipTimer || this.tipOpen())) {
      if (this.tipOpen()) this.tipFor = el; // a re-render replaced the icon: keep the open tip as it is
      return;
    }
    if (this.tipTimer) clearTimeout(this.tipTimer);
    this.tipKey = key;
    this.tipTimer = window.setTimeout(() => {
      this.tipTimer = null;
      const cur = this.underPointer(el);
      if (cur) this.showTip(cur);
    }, this.tipOpen() ? 120 : 450);
  }

  /** Hide the tip, by default after a short grace time so the pointer can move into it. */
  hideTip(now = false) {
    this.keepTip();
    const close = () => {
      if (this.tipTimer) clearTimeout(this.tipTimer);
      this.tipTimer = null;
      this.tipKey = '';
      this.tip.classList.add('hidden');
      this.tipFor = null;
    };
    if (now) {
      close();
      return;
    }
    this.tipHideTimer = window.setTimeout(() => {
      this.tipHideTimer = null;
      close();
    }, 380);
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
    wireStoryVideos(this.modal);
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
    this.modal.querySelectorAll('video').forEach((v) => v.pause());
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
                return `<div class="mrow ${have >= n! ? 'done' : ''}" style="--p:${Math.round((have / n!) * 100)}%">${itemImg(k as ItemId, 'icon sm')}<span class="mname">${tItem(k as ItemId)}</span><span class="mcount">${have}/${n}</span></div>`;
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
      <h3>${t('bp_buildings')}</h3>
      <div class="chain-grid">${BUILD_ORDER.filter((id) => st.unlockedBuildings.includes(id)).map((id) => `<button class="chip" data-bp-building="${id}"><img class="icon xs" src="${buildingUrl(id)}" alt=""> ${tBuilding(id)}</button>`).join('')}</div>
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
        else if (target.dataset.bpBuilding) this.showBuildingBlueprint(target.dataset.bpBuilding as BuildingId);
      },
    );
  }

  /** Blueprint of an item (production tree at a target rate). Kept as the entry point used all over the HUD. */
  showChain(item: ItemId) {
    this.bpHistory = [];
    this.showBlueprint({ kind: 'item', id: item });
  }

  showBuildingBlueprint(id: BuildingId) {
    this.bpHistory = [];
    this.showBlueprint({ kind: 'building', id });
  }

  private bpHistory: ({ kind: 'item'; id: ItemId } | { kind: 'building'; id: BuildingId })[] = [];


  /**
   * Blueprint overlay: a tree from the target down to the raw deposits. Items show the machine that makes them
   * (with the machines needed for the chosen rate and how many are built); buildings show their kit materials.
   */
  showBlueprint(what: { kind: 'item'; id: ItemId } | { kind: 'building'; id: BuildingId }, push = true) {
    this.hideTip(true);
    if (push) {
      const last = this.bpHistory[this.bpHistory.length - 1];
      if (!last || last.kind !== what.kind || last.id !== what.id) this.bpHistory.push(what);
    }
    const { head, tree } = blueprintContent(this.sim, what, this.chainRate);
    const back = this.bpHistory.length > 1 ? `<button class="btn small" data-bp-back="1">← ${t('bp_back')}</button>` : '';
    this.openModal(
      `<div class="bp">${head}<div class="bp-scroll">${tree}</div>
      <p class="save-hint">${what.kind === 'item' ? t('calc_hint') : t('bp_building_hint')}</p>
      <div class="term-btns">${back}<button class="btn primary" data-act="close">${t('close')}</button></div></div>`,
      (target) => {
        if (target.dataset.rate) {
          this.chainRate = Number(target.dataset.rate);
          this.showBlueprint(what, false);
        } else if (target.dataset.bpBack) {
          this.bpHistory.pop();
          const prev = this.bpHistory[this.bpHistory.length - 1];
          if (prev) this.showBlueprint(prev, false);
        } else if (target.dataset.bpItem) this.showBlueprint({ kind: 'item', id: target.dataset.bpItem as ItemId });
        else if (target.dataset.bpBuilding) this.showBlueprint({ kind: 'building', id: target.dataset.bpBuilding as BuildingId });
      },
    );
    // nodes are divs: open their blueprint on tap as well
    const card = this.modal.querySelector('.modal-card') as HTMLElement | null;
    card?.classList.add('wide');
    card?.querySelectorAll<HTMLElement>('.bp-node[data-bp-item]').forEach((n) => {
      n.addEventListener('click', (e) => {
        const img = (e.target as HTMLElement).closest('img[data-building]') as HTMLElement | null;
        if (img) this.showBlueprint({ kind: 'building', id: img.dataset.building as BuildingId });
        else if (n.dataset.bpItem !== (what.kind === 'item' ? what.id : '')) this.showBlueprint({ kind: 'item', id: n.dataset.bpItem as ItemId });
        e.stopPropagation();
      });
    });
    const scroller = this.modal.querySelector('.bp-scroll') as HTMLElement | null;
    if (scroller) {
      // start with the root in view, then let a mouse drag pan the tree (touch scrolls natively)
      scroller.scrollTop = 0;
      scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
      this.panBlueprint(scroller);
    }
  }

  /** Mouse drag pans a scrollable blueprint; a drag does not count as a click on a node. */
  private panBlueprint(el: HTMLElement) {
    const wide = () => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2;
    el.classList.toggle('pannable', wide());
    let start: { x: number; y: number; left: number; top: number } | null = null;
    let moved = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !wide()) return;
      start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      moved = false;
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) {
        moved = true;
        el.classList.add('panning');
        el.setPointerCapture(e.pointerId);
      }
      el.scrollLeft = start.left - dx;
      el.scrollTop = start.top - dy;
    });
    const end = () => {
      start = null;
      el.classList.remove('panning');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', (e) => {
      if (!moved) return;
      moved = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
  }



  showContracts() {
    const st = this.sim.state;
    const list = st.contracts.length
      ? st.contracts
          .map(
            (c) => `<div class="contract ${c.accepted ? 'accepted' : ''}">
          <div class="ctitle">${itemImg(c.item, 'icon')} <b>${c.kind && c.kind !== 'amount' ? `<span class="auto-tag">${t('contract_auto')}</span> ` : ''}${contractText(this.sim, c)}</b></div>
          ${c.kind && c.kind !== 'amount' ? `<p class="save-hint">${t(`contract_${c.kind}_hint` as 'contract_steady_hint')}</p>` : ''}
          <div class="creward">${t('contract_reward')}: ${Object.entries(c.reward).map(([k, n]) => `${itemImg(k as ItemId, 'icon xs')}${n}`).join(' ')}</div>
          ${c.accepted ? contractProgress(this.sim, c) : `<div class="cbtns"><button class="btn small primary" data-accept="${c.id}">${t('contract_accept')}</button><button class="btn small" data-decline="${c.id}">${t('contract_decline')}</button></div>`}
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
    const projects = PROJECTS.map((p) => {
      const state = this.sim.projectState(p.id);
      const can = this.sim.canResearch(p.id);
      const parts = p.unlocks.map((u) => `<img class="icon xs" src="${buildingUrl(u)}" alt="" data-bp-building="${u}" title="${tBuilding(u)}"> ${tBuilding(u)}`).join(' · ');
      const why = state === 'mission' ? `🔒 ${t('bp_unlock_after', { n: p.after })}` : state === 'requires' ? `🔒 ${t('proj_requires', { p: (p.requires ?? []).map((r) => t(`proj_${r}` as 'proj_p_sensor')).join(', ') })}` : '';
      return `<div class="upgrade project ${state === 'open' ? '' : 'locked'} ${state === 'done' ? 'done' : ''}">
        <div class="uname"><b>${t(`proj_${p.id}` as 'proj_p_sensor')}</b><small>${parts}${why ? `<br>${why}` : ''}</small></div>
        ${state === 'done' ? `<span class="umax">✓ ${t('proj_done')}</span>` : `<div class="ucost">${costHtml(p.cost, st.inventory)}</div><button class="btn small ${can ? 'primary' : ''}" data-proj="${p.id}" ${can ? '' : 'disabled'}>${t('proj_start')}</button>`}
      </div>`;
    });
    // open projects first, then the waiting ones, finished ones last
    const order = { open: 0, requires: 1, mission: 2, done: 3 };
    const sorted = PROJECTS.map((p, i) => ({ html: projects[i], o: order[this.sim.projectState(p.id)] })).sort((a, b) => a.o - b.o).map((x) => x.html).join('');
    this.openModal(`<h2>${t('research')}</h2><h3>${t('proj_title')}</h3><p class="save-hint">${t('proj_intro')}</p><div class="upgrade-list">${sorted}</div><h3>${t('upgrades')}</h3><div class="upgrade-list">${base}</div><h3>${t('upgrades')} II</h3><div class="upgrade-list">${tier2}</div><button class="btn primary" data-act="close">${t('close')}</button>`, (target) => {
      const pid = target.dataset.proj;
      if (pid && this.sim.research(pid)) {
        sfx.mission();
        this.renderer.fxUpgrade();
        this.toast(`✓ ${t('proj_done')}: <b>${t(`proj_${pid}` as 'proj_p_sensor')}</b><br><small>${t('unlocked')}: ${PROJECT_BY_ID[pid].unlocks.map((u) => tBuilding(u)).join(', ')}</small>`, 5000, 'success');
        this.showUpgrades();
        this.refresh?.();
        return;
      }
      const id = target.dataset.up as UpgradeId | undefined;
      if (id && this.sim.buyUpgrade(id)) {
        sfx.mission();
        this.renderer.fxUpgrade();
        this.showUpgrades();
      }
    });
  }

  // ---------- Pause screen: the in-game menu in the main menu's style, the game stands still behind it ----------

  private pauseEl: HTMLElement | null = null;
  private pauseTab: 'stats' | 'settings' = 'stats';
  private pauseSpeed = 1;

  get pauseOpen(): boolean {
    return !!this.pauseEl && !this.pauseEl.classList.contains('hidden');
  }

  showMenu() {
    if (!this.pauseEl) {
      this.pauseEl = el('div', 'pause-screen hidden');
      this.modal.before(this.pauseEl); // under the dialogs it opens (blueprints, achievements …)
      this.pauseEl.addEventListener('pointerover', (e) => {
        const b = (e.target as HTMLElement).closest('.aaa-item');
        if (b && b !== this.pauseHover) sfx.hover();
        this.pauseHover = b;
      });
    }
    if (!this.pauseOpen) {
      this.pauseSpeed = this.cb.getSpeed() || 1;
      this.cb.onSpeed(0);
      this.pauseTab = 'stats';
    }
    this.pauseEl.classList.remove('hidden');
    this.renderPause();
  }

  private pauseHover: Element | null = null;

  /** Back to the game at the speed it had. */
  resumeGame() {
    if (!this.pauseOpen) return;
    this.pauseEl!.classList.add('hidden');
    this.cb.onSpeed(this.pauseSpeed || 1);
    this.lastTopHtml = '';
    this.renderTop();
  }

  private renderPause() {
    const el0 = this.pauseEl!;
    const lang = getLang();
    const st = this.sim.state;
    const m = MISSIONS[st.missionIndex];
    const where = st.options.mode === 'story' ? `${t('mode_story')} · ${t('chapter')} ${st.missionIndex + 1}/${MISSIONS.length}${m ? ` · ${tMission(m.id).title}` : ''}`
      : st.options.mode === 'playground' ? `${t('mode_playground')}${st.note?.title ? ` · ${st.note.title.split(' · ')[lang === 'de' ? 0 : 1] ?? st.note.title}` : ''}`
      : st.options.mode === 'challenge' ? `${t('mode_challenge')} · ${t(`ch_${st.challenge}` as 'ch_c_drills')}` : t('mode_free');
    let n = 0;
    const item = (act: string, title: string, desc: string, cls = '') =>
      `<button class="aaa-item ${cls}" data-act="${act}" style="--i:${n}"><span class="aaa-num">${String(++n).padStart(2, '0')}</span><span class="aaa-label"><b>${title}</b><small>${desc}</small></span><span class="aaa-chev" aria-hidden="true">›</span></button>`;
    const got = Object.keys(earned()).filter((id) => ACHIEVEMENTS.some((a) => a.id === id)).length;
    const produced = Object.entries(st.stats.produced).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 12);
    const seg = (key: string, on: boolean) => `<span class="seg"><button class="chip ${on ? 'active' : ''}" data-${key}="on">${t('on')}</button><button class="chip ${on ? '' : 'active'}" data-${key}="off">${t('off')}</button></span>`;
    const side = this.pauseTab === 'settings'
      ? `<header class="aaa-panel-head"><b>${t('settings')}</b><small>${t('pause_settings_desc')}</small></header>
        <div class="mset">
          <div class="menu-row"><span>${t('language')}</span><span class="seg"><button class="chip ${lang === 'de' ? 'active' : ''}" data-lang="de">DE</button><button class="chip ${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button></span></div>
          <div class="menu-row"><span>${t('sound')}</span>${seg('sound', soundEnabled())}</div>
          <div class="menu-row"><span>${t('ambience')}</span>${seg('ambient', ambientEnabled())}</div>
          <div class="menu-row"><span>${t('day_night')}</span>${seg('daynight', Renderer.dayNight)}</div>
          ${fullscreenAvailable() ? `<div class="menu-row"><span>${t('fullscreen')}</span><span class="seg"><button class="chip" data-act="fullscreen">${icon('fullscreen', 'sm')}</button></span></div>` : ''}
        </div>`
      : `<header class="aaa-panel-head"><b>${t('pause_status')}</b><small>${where}</small></header>
        <div class="pause-stats">
          <div><small>${t('playtime')}</small><b>${fmtTime(st.time)}</b></div>
          <div><small>${t('pause_buildings')}</small><b>${st.buildings.length}</b></div>
          <div><small>${t('achievements')}</small><b>${got}/${ACHIEVEMENTS.length}</b></div>
          <div><small>${t('seed')}</small><b>${st.seed}</b></div>
        </div>
        ${produced.length ? `<h4 class="pause-h4">${t('produced')}</h4><div class="pause-prod">${produced.map(([k, v]) => `<span>${itemImg(k as ItemId, 'icon sm')}<b>${v}</b><small>${tItem(k as ItemId)}</small></span>`).join('')}</div>` : ''}`;
    const editorItem = st.options.mode === 'free' || st.options.mode === 'playground'
      ? this.editor ? item('edtoggle', t('ed_play'), t('pause_editor_play')) + item('ednote', t('ed_note'), t('pause_ednote')) : item('edtoggle', t('editor'), t('pause_editor'))
      : '';
    el0.innerHTML = `
      <div class="pause-shade"></div>
      <div class="title-frame" aria-hidden="true"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i><span class="title-build">BUILD ${__BUILD__}</span></div>
      <div class="pause-col title-content aaa">
        <div class="pause-tag"><span class="pause-bars"><i></i><i></i></span>${t('pause_title')}</div>
        <h1 class="logo"><span>PLANET</span><span class="accent">ESCAPE</span></h1>
        <p class="tagline">${where}</p>
        <nav class="aaa-nav">
          ${item('resume', t('resume'), t('pause_resume_desc'), 'primary')}
          ${item('save', t('save_now'), t('save_hint'))}
          ${item('settings', t('settings'), t('pause_settings_desc'), this.pauseTab === 'settings' ? 'sel' : '')}
          ${item('blueprints', t('blueprints'), t('pause_blueprints'))}
          ${item('achievements', t('achievements'), `${got}/${ACHIEVEMENTS.length}`)}
          ${editorItem}
          ${item('howto', t('how_to'), t('pause_howto'))}
          ${item('new', t('to_main_menu'), t('pause_main_desc'), 'accent2')}
          ${desktop() ? item('quit', t('quit'), t('pause_quit_desc')) : ''}
        </nav>
        <div class="aaa-foot">
          <button data-act="transfer">${t('transfer_short')}</button>
          ${st.note && !this.editor ? `<button data-act="note">${t('save_note')}</button>` : ''}
          ${IS_DESKTOP ? '' : `<a class="ai-link" href="./ai/">${t('ai_page')} →</a>`}
          <span class="aaa-lang"><button class="${lang === 'de' ? 'active' : ''}" data-lang="de">DE</button><button class="${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button></span>
        </div>
      </div>
      <aside class="pause-side aaa-panel">${side}</aside>`;
    el0.onclick = (e) => {
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!target) return;
      const act = target.dataset.act;
      if (target.dataset.lang) {
        setLang(target.dataset.lang as Lang);
        this.renderAll();
      } else if (target.dataset.sound) setSound(target.dataset.sound === 'on');
      else if (target.dataset.ambient) setAmbient(target.dataset.ambient === 'on');
      else if (target.dataset.daynight) {
        Renderer.dayNight = target.dataset.daynight === 'on';
        kv.set('pe_daynight', Renderer.dayNight ? '1' : '0');
      } else if (act === 'resume') return this.resumeGame();
      else if (act === 'settings') this.pauseTab = this.pauseTab === 'settings' ? 'stats' : 'settings';
      else if (act === 'save') {
        this.cb.onSave();
        this.toast(`${icon('save', 'sm')} ${t('saved')}`, 1500, 'success');
      } else if (act === 'howto') return this.showHowTo();
      else if (act === 'note') return this.showNote();
      else if (act === 'edtoggle') {
        this.resumeGame();
        return this.setEditor(!this.editor);
      } else if (act === 'ednote') return this.editNote();
      else if (act === 'transfer') return this.showTransfer();
      else if (act === 'achievements') return this.showAchievements();
      else if (act === 'fullscreen') toggleFullscreen();
      else if (act === 'quit') {
        this.cb.onSave();
        desktop()?.quit();
      } else if (act === 'blueprints') return this.showBlueprints();
      else if (act === 'new') {
        this.pauseEl!.classList.add('hidden');
        this.cb.onSpeed(this.pauseSpeed || 1);
        this.cb.onSave();
        this.titleView = 'main';
        return this.showTitle();
      } else return;
      sfx.select();
      this.renderPause();
    };
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
      if (raw.startsWith('PEP1.')) return this.applyProgress(raw);
      if (raw.startsWith('PE1.')) raw = decodeURIComponent(escape(atob(raw.slice(4))));
      const loaded = migrateSave(JSON.parse(raw));
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
      ${st.options.mode === 'story' ? storyVideoHtml(MISSIONS.length, 'done') : `<img class="ship" src="${uiUrl('ship.webp')}" alt="">`}
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

  /** A supply flight left after the launch. */
  flightDone(n: number) {
    sfx.launch();
    const next = this.sim.currentMission();
    this.toast(`🚀 ${t('flight_done', { n })}${next ? `<br><small>${t('flight_next')}: ${Object.entries(next.deliver).map(([k, v]) => `${v}× ${tItem(k as ItemId)}`).join(', ')}</small>` : ''}`, 6000, 'success');
    this.renderTop();
  }

  missionComplete(index: number) {
    const m = MISSIONS[index];
    const mt = tMission(m.id);
    const unlocks = [...m.unlocks.map((u) => tBuilding(u)), ...m.unlockRecipes.map((r) => tItem(RECIPE_BY_ID[r].output))];
    if (m.reward) for (const k in m.reward) unlocks.push(`${m.reward[k as ItemId]}× ${tItem(k as ItemId)}`);
    sfx.mission();
    const st = this.sim.state;
    if (st.options.mode === 'story' && EDITION === 'demo' && index + 1 >= DEMO_CHAPTERS) {
      recordChapter(index, st.time - (st.chapterStart ?? 0), this.sim.efficiency());
      this.showDemoEnd(index + 1);
      return;
    }
    if (st.options.mode === 'story' && index < MISSIONS.length - 1) {
      // story: every order is a chapter on its own map -> hand over to the next map
      const next = MISSIONS[index + 1];
      const nt = tMission(next.id);
      const lvl = LEVELS[Math.min(index + 1, LEVELS.length - 1)];
      const seconds = st.time - (st.chapterStart ?? 0);
      const eff = this.sim.efficiency();
      const rec = recordChapter(index, seconds, eff);
      this.openModal(
        `<div class="kora-head"><img src="${uiUrl('kora.webp')}" alt=""><div><b>${t('kora')}</b><small>${t('chapter_done', { n: index + 1 })}</small></div></div>
        ${storyVideoHtml(index + 1, 'done')}
        <h2>✓ ${mt.title}</h2>
        <div class="stars-big ${rec.stars === 3 ? 'gold' : ''}">${starString(rec.stars)}</div>
        <p class="stars-line">${t('stars_earned', { time: fmtTime(seconds), stars: `${rec.stars}/3` })}${rec.improved ? ` · ${t('new_record')}` : ''}<br><small>${t('par_time', { time: fmtTime(LEVELS[Math.min(index, LEVELS.length - 1)].par) })} · ${t('efficiency_line', { p: Math.round(eff * 100), need: Math.round(STAR_EFFICIENCY * 100) })}</small></p>
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
    const newProj = this.sim.projectsOpenedBy(index);
    this.toast(`✓ ${t('mission_done')} <b>${mt.title}</b>${unlocks.length ? `<br><small>${t('unlocked')}: ${unlocks.join(', ')}</small>` : ''}${newProj.length ? `<br><small>${t('proj_new', { n: newProj.length })}</small>` : ''}`, 5000, 'success');
    const next = MISSIONS[index + 1];
    const chapter = this.sim.state.options.mode === 'story' ? tChapter(index) : '';
    if (chapter) this.koraSay(chapter, 14);
    if (next) {
      const nt = tMission(next.id);
      setTimeout(() => this.koraSay(nt.text, 20), chapter ? 14000 : 0);
    }
  }

  /** Story: the chapter's explanation clip with its order, before the player starts building. */
  showBriefing() {
    const i = this.sim.state.missionIndex;
    const m = MISSIONS[i];
    if (!m) return;
    const mt = tMission(m.id);
    this.openModal(
      `<div class="kora-head"><img src="${uiUrl('kora.webp')}" alt=""><div><b>${t('kora')}</b><small>${t('chapter')} ${i + 1}/${MISSIONS.length}</small></div></div>
      ${storyVideoHtml(i + 1, 'intro')}
      <h2>${mt.title}</h2>
      <p>${mt.text}</p>
      <button class="btn primary" data-act="close">${t('play')}</button>`,
    );
  }

  /** Called when a new chapter map has been loaded. */
  chapterStart() {
    const st = this.sim.state;
    const m = MISSIONS[st.missionIndex];
    if (m) {
      const mt = tMission(m.id);
      this.koraSay(mt.text, 20);
    }
    // the story slides (first start) come first and hand over to the briefing themselves
    if (st.options.mode === 'story' && this.story.classList.contains('hidden')) this.showBriefing();
    this.lastTutorialStep = -2;
    this.lastTopHtml = '';
    this.lastBottomHtml = '';
    this.undoStack = [];
    this.refresh();
  }

  /** KORA reports a situation; the player decides (or the safe option happens when the timer runs out). */
  eventOffer(ev: GameEvent) {
    if (ev.kind === 'quake') sfx.quake();
    else if (ev.kind === 'trader') sfx.trader();
    else sfx.select();
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
    this.toast(`${icon('contracts', 'sm')} ${t('contract_new')}: ${contractText(this.sim, c)}`, 6000);
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
    for (const id of checkAchievements(this.sim)) this.achievementToast(id);
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
    const job = this.sim.printQueue()[0];
    const fill = this.top.querySelector('#printfill') as HTMLElement | null; // the printer sits in the header
    const clock = this.top.querySelector('.hb-clock');
    if (clock) clock.textContent = fmtTime(this.sim.state.time); // outside the header HTML: no rebuild every second
    if (fill && job) fill.style.width = `${Math.round((1 - job.left / job.total) * 100)}%`;
    if (this.printerOpen) this.renderPrinter();
    if (this.selected?.site) this.showInfo(this.selected);
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
            const html = cpuStateHtml(this.sim, this.selected);
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
