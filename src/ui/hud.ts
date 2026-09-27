import { buildingUrl, itemUrl, uiUrl } from '../game/assets';
import { BUILDINGS, BUILD_ORDER, ITEM_ORDER, MISSIONS, RECIPE_BY_ID, SHIP_PARTS, recipesFor } from '../game/data';
import type { Input, Tool } from '../game/input';
import type { Renderer } from '../game/render';
import type { Sim } from '../game/sim';
import { setSound, sfx, soundEnabled } from '../game/sfx';
import type { Building, BuildingId, ItemId } from '../game/types';
import { getLang, setLang, t, tBuilding, tBuildingDesc, tItem, tMission, type Lang } from '../i18n';
import { hasSave } from '../game/save';

export interface HudCallbacks {
  onNewGame: () => void;
  onContinue: () => void;
  onLanguage: (l: Lang) => void;
  onCenter: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function itemImg(id: ItemId, cls = 'icon'): string {
  return `<img class="${cls}" src="${itemUrl(id)}" alt="${tItem(id)}" draggable="false">`;
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
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m ${s}s`;
}

export class Hud {
  root: HTMLElement;
  title: HTMLElement;
  top: HTMLElement;
  bottom: HTMLElement;
  info: HTMLElement;
  modal: HTMLElement;
  toasts: HTMLElement;
  selected: Building | null = null;
  private lastTopHtml = '';
  private lastBottomHtml = '';
  private tool: Tool = { kind: 'none' };
  private firstTipShown = false;

  constructor(
    private sim: Sim,
    private input: Input,
    private renderer: Renderer,
    private cb: HudCallbacks,
  ) {
    this.root = document.getElementById('ui')!;
    this.title = el('div', 'title-screen');
    this.top = el('div', 'hud-top');
    this.bottom = el('div', 'hud-bottom');
    this.info = el('div', 'info-panel hidden');
    this.modal = el('div', 'modal hidden');
    this.toasts = el('div', 'toasts');
    this.root.append(this.title, this.top, this.bottom, this.info, this.modal, this.toasts);
    this.renderTitle();
    this.renderBottom();
    this.renderTop();
  }

  // ---------- Title ----------

  showTitle() {
    this.renderTitle();
    this.title.classList.remove('hidden');
    this.top.classList.add('hidden');
    this.bottom.classList.add('hidden');
    this.info.classList.add('hidden');
  }

  hideTitle() {
    this.title.classList.add('hidden');
    this.top.classList.remove('hidden');
    this.bottom.classList.remove('hidden');
    if (!this.firstTipShown && this.sim.state.missionIndex === 0 && this.sim.state.buildings.length === 1) {
      this.firstTipShown = true;
      this.toast(t('tip_first'), 7000);
    }
  }

  private renderTitle() {
    const lang = getLang();
    this.title.innerHTML = `
      <div class="title-bg" style="background-image:url('${uiUrl('title_bg.webp')}')"></div>
      <div class="title-content">
        <h1 class="logo"><span>PLANET</span><span class="accent">ESCAPE</span></h1>
        <p class="tagline">${t('tagline')}</p>
        <p class="intro">${t('intro')}</p>
        <div class="title-buttons">
          ${hasSave() ? `<button class="btn primary" data-act="continue">${t('continue')}</button>` : ''}
          <button class="btn ${hasSave() ? '' : 'primary'}" data-act="new">${t('new_game')}</button>
          <button class="btn ghost" data-act="howto">${t('how_to')}</button>
        </div>
        <div class="lang-switch">
          <button class="chip ${lang === 'de' ? 'active' : ''}" data-lang="de">Deutsch</button>
          <button class="chip ${lang === 'en' ? 'active' : ''}" data-lang="en">English</button>
        </div>
        <p class="save-hint">${t('save_hint')}</p>
      </div>`;
    this.title.onclick = (e) => {
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!target) return;
      const act = target.dataset.act;
      const lang = target.dataset.lang as Lang | undefined;
      if (lang) {
        setLang(lang);
        this.cb.onLanguage(lang);
        this.renderAll();
        return;
      }
      if (act === 'continue') this.cb.onContinue();
      else if (act === 'new') {
        if (!hasSave() || confirm(t('new_game_confirm'))) this.cb.onNewGame();
      } else if (act === 'howto') this.showHowTo();
    };
  }

  renderAll() {
    this.renderTitle();
    this.renderTop();
    this.renderBottom();
    if (this.selected) this.showInfo(this.selected);
  }

  // ---------- Top HUD ----------

  private renderTop() {
    const st = this.sim.state;
    const m = this.sim.currentMission();
    let missionHtml = '';
    if (m) {
      const mt = tMission(m.id);
      const rows = Object.entries(m.deliver)
        .map(([k, n]) => {
          const have = Math.min(n!, st.delivered[k as ItemId] ?? 0);
          return `<div class="mrow ${have >= n! ? 'done' : ''}">${itemImg(k as ItemId, 'icon sm')}<span class="mname">${tItem(k as ItemId)}</span><span class="mcount">${have}/${n}</span></div>`;
        })
        .join('');
      missionHtml = `
        <button class="mission-card" data-act="missions">
          <div class="mtitle"><span class="mnum">${t('mission')} ${st.missionIndex + 1}/${MISSIONS.length}</span> ${mt.title}</div>
          <div class="mrows">${rows}</div>
        </button>`;
    } else {
      missionHtml = `<button class="mission-card" data-act="missions"><div class="mtitle">🚀 ${t('launch_title')}</div></button>`;
    }
    const supply = st.powerSupply, demand = st.powerDemand;
    const ratio = demand <= 0 ? 0 : Math.min(1, demand / Math.max(1, supply));
    const low = demand > supply;
    const topHtml = `
      ${missionHtml}
      <div class="top-right">
        <div class="power ${low ? 'low' : ''}" title="${t('power')}">
          <span class="plabel">⚡ ${demand}/${supply}</span>
          <div class="pbar"><div class="pfill" style="width:${ratio * 100}%"></div></div>
        </div>
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
    };
  }

  // ---------- Bottom HUD ----------

  private renderBottom() {
    const st = this.sim.state;
    const inv = st.inventory;
    const invHtml = ITEM_ORDER.filter((id) => (inv[id] ?? 0) > 0)
      .map((id) => `<span class="inv-item" title="${tItem(id)}">${itemImg(id, 'icon sm')}<b>${inv[id]}</b></span>`)
      .join('');
    const buildHtml = BUILD_ORDER.map((id) => {
      const def = BUILDINGS[id];
      const unlocked = st.unlockedBuildings.includes(id);
      const affordable = this.sim.canAfford(id);
      const active = this.tool.kind === 'build' && this.tool.type === id;
      return `<button class="build-btn ${active ? 'active' : ''} ${unlocked ? '' : 'locked'} ${affordable ? '' : 'poor'}" data-build="${id}" ${unlocked ? '' : 'disabled'}>
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
      const act = target.dataset.act;
      if (act === 'rotate') {
        if (this.selected && BUILDINGS[this.selected.type].rotatable) {
          this.sim.rotate(this.selected, ((this.selected.dir + 1) & 3) as 0 | 1 | 2 | 3);
          this.showInfo(this.selected);
        } else this.input.rotate();
        sfx.select();
      } else if (act === 'delete') {
        this.input.setTool(delActive ? { kind: 'none' } : { kind: 'delete' });
        if (!delActive) this.toast(t('delete_mode'), 2500);
        this.selectBuilding(null);
      }
    };
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.renderBottom();
  }

  // ---------- Info panel ----------

  selectBuilding(b: Building | null) {
    this.selected = b;
    this.renderer.selected = b;
    if (b) this.showInfo(b);
    else this.info.classList.add('hidden');
  }

  private infoBody(b: Building): string {
    const def = BUILDINGS[b.type];
    const st = this.sim.state;
    let body = '';
    if (def.kind === 'machine') {
      const machine = b.type as 'smelter' | 'assembler' | 'refinery';
      const recipes = recipesFor(machine).filter((r) => st.unlockedRecipes.includes(r.id));
      const r = b.recipe ? RECIPE_BY_ID[b.recipe] : null;
      let status = t('idle');
      if (b.working) status = t('working');
      else if (!r) status = t('select_recipe');
      else if ((b.output?.[r.output] ?? 0) >= 6) status = t('output_full');
      else status = t('waiting_input');
      if (st.powerDemand > st.powerSupply) status += ` · ${t('no_power')}`;
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
      body = `
        <div class="status">${status}</div>
        <div class="bufs"><span class="lbl">${t('input')}</span>${inputs || '–'}<span class="lbl">${t('output')}</span>${outputs || '–'}</div>
        <div class="lbl">${t('recipe')}</div>
        <div class="recipes">${recipeCards}</div>`;
    } else if (def.kind === 'miner') {
      body = `<div class="status">${b.working ? t('working') : t('output_full')}</div>
        <div class="bufs"><span class="lbl">${t('output')}</span><span class="buf">${itemImg(b.mineItem!, 'icon sm')}${b.output?.[b.mineItem!] ?? 0}</span></div>`;
    } else if (def.kind === 'storage') {
      const items = Object.entries(b.store ?? {})
        .map(([k, n]) => `<span class="buf">${itemImg(k as ItemId, 'icon sm')}${n}</span>`)
        .join('');
      body = `<div class="bufs"><span class="lbl">${t('stored')}</span>${items || '–'}</div>`;
    } else if (b.type === 'generator') {
      body = `<div class="bufs"><span class="lbl">${t('fuel_left')}</span><span class="buf">${itemImg('fuel', 'icon sm')}${b.input?.fuel ?? 0}</span> <span class="buf">${Math.ceil(b.fuelSeconds ?? 0)}s</span></div>`;
    } else if (b.type === 'core') {
      const parts = Object.entries(SHIP_PARTS)
        .map(([k, n]) => {
          const have = st.missionIndex >= MISSIONS.length - 1 ? Math.min(n!, st.delivered[k as ItemId] ?? 0) : 0;
          return `<div class="mrow ${have >= n! ? 'done' : ''}">${itemImg(k as ItemId, 'icon sm')}<span class="mname">${tItem(k as ItemId)}</span><span class="mcount">${have}/${n}</span></div>`;
        })
        .join('');
      body = `<div class="lbl">${t('ship_progress')}</div><div class="mrows">${parts}</div>`;
    }
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
    this.info.classList.remove('hidden');
    this.info.onclick = (e) => {
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!target) return;
      const recipe = target.dataset.recipe;
      if (recipe) {
        this.sim.setRecipe(b, recipe);
        sfx.select();
        this.showInfo(b);
        return;
      }
      const act = target.dataset.act;
      if (act === 'close') this.selectBuilding(null);
      else if (act === 'rotate') {
        this.sim.rotate(b, ((b.dir + 1) & 3) as 0 | 1 | 2 | 3);
        sfx.select();
        this.showInfo(b);
      } else if (act === 'remove') {
        this.sim.remove(b);
        sfx.remove();
        this.selectBuilding(null);
        this.renderBottom();
      }
    };
  }

  // ---------- Modals ----------

  private openModal(html: string) {
    this.modal.innerHTML = `<div class="modal-card">${html}</div>`;
    this.modal.classList.remove('hidden');
    this.modal.onclick = (e) => {
      if (e.target === this.modal) this.closeModal();
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (target?.dataset.act === 'close') this.closeModal();
    };
  }

  closeModal() {
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
  }

  showHowTo() {
    this.openModal(`<h2>${t('how_to')}</h2><p class="pre">${t('how_to_text')}</p>
      <div class="chain">
        ${itemImg('iron_ore')}→<img class="icon" src="${buildingUrl('smelter')}" alt="">→${itemImg('iron_plate')}→<img class="icon" src="${buildingUrl('assembler')}" alt="">→${itemImg('steel_frame')}→<img class="icon" src="${buildingUrl('core')}" alt="">
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
                const have = state === 'done' ? n! : Math.min(n!, st.delivered[k as ItemId] ?? 0);
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
    this.openModal(`<h2>${t('missions')}</h2><div class="mission-list">${list}</div><button class="btn primary" data-act="close">${t('close')}</button>`);
  }

  showMenu() {
    const lang = getLang();
    this.openModal(`<h2>${t('menu')}</h2>
      <div class="menu-row"><span>${t('language')}</span>
        <span><button class="chip ${lang === 'de' ? 'active' : ''}" data-lang="de">DE</button><button class="chip ${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button></span></div>
      <div class="menu-row"><span>${t('sound')}</span>
        <span><button class="chip ${soundEnabled() ? 'active' : ''}" data-sound="on">${t('on')}</button><button class="chip ${soundEnabled() ? '' : 'active'}" data-sound="off">${t('off')}</button></span></div>
      <button class="btn" data-act="howto">${t('how_to')}</button>
      <button class="btn danger" data-act="new">${t('new_game')}</button>
      <button class="btn primary" data-act="close">${t('close')}</button>
      <p class="save-hint">${t('save_hint')}</p>`);
    const prev = this.modal.onclick;
    this.modal.onclick = (e) => {
      prev?.call(this.modal, e);
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!target) return;
      if (target.dataset.lang) {
        const l = target.dataset.lang as Lang;
        setLang(l);
        this.cb.onLanguage(l);
        this.renderAll();
        this.showMenu();
      } else if (target.dataset.sound) {
        setSound(target.dataset.sound === 'on');
        this.showMenu();
      } else if (target.dataset.act === 'howto') this.showHowTo();
      else if (target.dataset.act === 'new') {
        if (confirm(t('new_game_confirm'))) {
          this.closeModal();
          this.cb.onNewGame();
        }
      }
    };
  }

  showLaunch() {
    const st = this.sim.state;
    this.openModal(`<div class="launch">
      <img class="ship" src="${uiUrl('ship.webp')}" alt="">
      <h2>🚀 ${t('launch_title')}</h2>
      <p>${t('launch_text', { time: fmtTime(st.time) })}</p>
      <button class="btn primary" data-act="new">${t('play_again')}</button>
      <button class="btn" data-act="close">${t('keep_playing')}</button>
    </div>`);
    const prev = this.modal.onclick;
    this.modal.onclick = (e) => {
      prev?.call(this.modal, e);
      const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (target?.dataset.act === 'new') {
        this.closeModal();
        this.cb.onNewGame();
      }
    };
  }

  // ---------- Toasts ----------

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
    if (next) {
      const nt = tMission(next.id);
      setTimeout(() => this.toast(`▶ ${t('mission')} ${index + 2}: <b>${nt.title}</b><br><small>${nt.text}</small>`, 7000), 1200);
    }
  }

  /** Called ~4x per second to refresh live numbers. */
  refresh() {
    this.renderBottom();
    this.renderTop();
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
  }
}
