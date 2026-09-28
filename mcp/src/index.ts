// planet-escape-mcp-server: lets an AI play Planet Escape headlessly and find solutions automatically.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync } from 'node:fs';
import { BUILDINGS, BUILD_ORDER, LEVELS, MISSIONS, RECIPES, RECIPE_BY_ID, SHIP_PARTS, TERRAIN_ITEM } from '../../src/game/data';
import { Sim } from '../../src/game/sim';
import { beltCapacity, buildChain, machineRate, minerRate, routeBelt, layPath, solveOrder, type SolverLog } from '../../src/game/solver';
import type { Building, BuildingId, Dir, GameOptions, GameState, ItemId, TerrainId } from '../../src/game/types';
import { chapterState, levelState, newGame } from '../../src/game/world';
import { serialize } from '../../src/game/save';
import PLAYBOOK from '../PLAYBOOK.md';
import { Spectator, sleep } from './spectate';

const server = new McpServer(
  { name: 'planet-escape-mcp-server', version: '1.1.0' },
  {
    instructions:
      'Planet Escape is a factory-building game. Play one round with: pe_new_game (or pe_next_chapter) -> pe_solve_order -> pe_tick (stop_on_order) -> pe_analyze and fix -> repeat until "order N complete". Call pe_playbook once at the start for the full strategy guide, including what to do when the solver reports "out of material" (tick 180-300 s, solve again) or routing failures (build per item with pe_build_chain).',
  },
);

let sim: Sim = new Sim(newGame(42, { mode: 'story', mapSize: 'medium', infiniteOre: false, allUnlocked: false, storms: true }));
sim.state.introSeen = true;
sim.state.tutorialStep = -1;
let eventLog: string[] = [];
let ticking = 0; // > 0 while a paced pe_tick runs (speed), for the spectator page

// ---------- Spectator (live view in a browser) ----------
const spectator = new Spectator();
spectator.snapshot = () => ({
  ts: Date.now(),
  speed: ticking,
  state: sim.state,
  tools: spectator.toolLog.slice(-30),
  events: eventLog.slice(-12),
});

// every tool call is logged for the spectators and followed by a state broadcast
{
  type Reg = typeof server.registerTool;
  const orig = server.registerTool.bind(server) as Reg;
  (server as unknown as { registerTool: Reg }).registerTool = ((name: string, cfg: unknown, cb: (...a: unknown[]) => Promise<{ isError?: boolean; content?: { text?: string }[] }>) =>
    (orig as unknown as (n: string, c: unknown, f: (...a: unknown[]) => unknown) => unknown)(name, cfg, async (...args: unknown[]) => {
      const argStr = args.length && args[0] && typeof args[0] === 'object' && !('signal' in (args[0] as object)) ? JSON.stringify(args[0]).slice(0, 160) : '';
      let res: { isError?: boolean; content?: { text?: string }[] };
      try {
        res = await cb(...args);
      } catch (e) {
        spectator.record({ t: Date.now(), name, args: argStr, ok: false, note: String(e).slice(0, 120) });
        spectator.broadcast();
        throw e;
      }
      spectator.record({ t: Date.now(), name, args: argStr, ok: !res.isError, note: res.isError ? res.content?.[0]?.text?.slice(0, 120) : undefined });
      spectator.broadcast();
      return res;
    })) as unknown as Reg;
}

const BUILDING_IDS = Object.keys(BUILDINGS) as [BuildingId, ...BuildingId[]];
const DirSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).describe('0 = up/north, 1 = right/east, 2 = down/south, 3 = left/west');

function ok(data: unknown, text?: string) {
  return { content: [{ type: 'text' as const, text: text ?? JSON.stringify(data, null, 1) }], structuredContent: data as Record<string, unknown> };
}
function fail(msg: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
}

function drainEvents() {
  const ev = sim.events.map((e) => {
    switch (e.type) {
      case 'mission': return `order ${e.index + 1} complete`;
      case 'launch': return 'SHIP LAUNCHED';
      case 'depleted': return `deposit exhausted at ${e.x},${e.y}`;
      case 'contract_offer': return `contract offered: ${e.contract.amount}x ${e.contract.item} (id ${e.contract.id})`;
      case 'contract_done': return `contract done: ${e.contract.item}`;
      case 'contract_failed': return `contract failed: ${e.contract.item}`;
      case 'storm': return e.on ? 'dust storm started' : 'dust storm ended';
      default: return '';
    }
  }).filter(Boolean);
  sim.events.length = 0;
  eventLog.push(...ev);
  return ev;
}

function summary() {
  const st = sim.state;
  const m = sim.currentMission();
  const core = st.buildings[0];
  const counts: Record<string, number> = {};
  for (const b of st.buildings) counts[b.type] = (counts[b.type] ?? 0) + 1;
  return {
    mode: st.options.mode,
    chapter: st.options.mode === 'story' ? st.missionIndex + 1 : undefined,
    order: m
      ? {
          index: st.missionIndex + 1,
          of: MISSIONS.length,
          id: m.id,
          deliver: Object.fromEntries(Object.entries(m.deliver).map(([k, n]) => [k, { have: Math.max(st.delivered[k as ItemId] ?? 0, st.ship[k as ItemId] ?? 0), need: n }])),
          build: m.build ? Object.fromEntries(Object.entries(m.build).map(([k, n]) => [k, { have: sim.countBuildings(k as BuildingId), need: n }])) : undefined,
        }
      : null,
    launched: st.launched,
    shipProgress: Math.round(sim.shipProgress() * 100) / 100,
    time: Math.round(st.time),
    map: { width: st.width, height: st.height, core: { x: core.x, y: core.y, size: 3 } },
    inventory: st.inventory,
    power: { demand: st.powerDemand, supply: st.powerSupply, storm: st.storm > 0 },
    unlockedBuildings: st.unlockedBuildings,
    unlockedRecipes: st.unlockedRecipes,
    buildings: counts,
    problems: sim.analyze().length,
    contracts: st.contracts.map((c) => ({ id: c.id, item: c.item, amount: c.amount, delivered: c.delivered, accepted: c.accepted, secondsLeft: Math.round(c.deadline - st.time), reward: c.reward })),
    upgrades: st.upgrades,
  };
}

function depositClusters() {
  const st = sim.state;
  const W = st.width;
  const seen = new Uint8Array(W * st.height);
  const clusters: { type: TerrainId; item: ItemId; x: number; y: number; tiles: number; ore: number; distToCore: number }[] = [];
  const core = st.buildings[0];
  for (let i = 0; i < W * st.height; i++) {
    const t = st.terrain[i];
    if (seen[i] || t === 'ground' || t === 'rock') continue;
    const stack = [i];
    let n = 0, ore = 0, sx = 0, sy = 0;
    while (stack.length) {
      const j = stack.pop()!;
      if (seen[j] || st.terrain[j] !== t) continue;
      seen[j] = 1;
      n++;
      ore += st.ore[j] ?? 0;
      const x = j % W, y = (j - x) / W;
      sx += x;
      sy += y;
      if (x > 0) stack.push(j - 1);
      if (x < W - 1) stack.push(j + 1);
      if (y > 0) stack.push(j - W);
      if (y < st.height - 1) stack.push(j + W);
    }
    const cx = Math.round(sx / n), cy = Math.round(sy / n);
    clusters.push({ type: t, item: TERRAIN_ITEM[t]!, x: cx, y: cy, tiles: n, ore, distToCore: Math.abs(cx - core.x - 1) + Math.abs(cy - core.y - 1) });
  }
  return clusters.sort((a, b) => a.distToCore - b.distToCore);
}

const TERRAIN_CHAR: Record<TerrainId, string> = { ground: '.', rock: '#', iron_ore: 'I', copper_ore: 'C', quartz: 'Q', ice: 'W', oil: 'O' };
const BUILDING_CHAR: Partial<Record<BuildingId, string>> = { core: 'K', conveyor: '', miner: 'M', smelter: 'S', assembler: 'A', printer: 'P', refinery: 'R', fabricator: 'F', solar: 's', generator: 'G', storage: 'D', splitter: 'Y', tunnel: 'T', sorter: 'X', overflow: 'V', mixer: 'N', valve: 'L', lamp: 'o', matrix: '#', screen: 'v', speaker: ')', keyboard: 'k', picker: 'g', road: '_', dock: 'd', depot: 'B', stacker: '8', timer: 'w', sensor: ':', radio: '&', battery: 'b', switch: '=', terminal: 'Z', oscillator: 'q', bus: '~', register: 'r', adder: '+', subtractor: '-', multiplier: '*', divider: '/' };
const ARROWS = ['^', '>', 'v', '<'];

function asciiMap(x0: number, y0: number, w: number, h: number): string {
  const st = sim.state;
  const rows: string[] = [];
  for (let y = y0; y < y0 + h; y++) {
    let row = '';
    for (let x = x0; x < x0 + w; x++) {
      if (!sim.inBounds(x, y)) { row += ' '; continue; }
      const b = sim.at(x, y);
      if (b) row += b.type === 'conveyor' ? ARROWS[b.dir] : b.type === 'lamp' && sim.lampItem(b) ? '*' : b.type === 'switch' && b.open === false ? 'x' : (BUILDING_CHAR[b.type] ?? '?');
      else row += TERRAIN_CHAR[st.terrain[y * st.width + x]];
    }
    rows.push(row);
  }
  return rows.join('\n');
}

function screenText(cpu: { display: Uint8Array }): string {
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    let r = '';
    for (let x = 0; x < 64; x++) r += cpu.display[y * 64 + x] ? (cpu.display[y * 64 + x] === 1 ? '#' : cpu.display[y * 64 + x].toString(16)) : '.';
    rows.push(r);
  }
  return rows.join('\n');
}

function describeBuilding(b: Building) {
  return {
    id: b.id, type: b.type, x: b.x, y: b.y, dir: b.dir, size: BUILDINGS[b.type].size, status: b.status ?? 'ok',
    recipe: b.recipe ?? undefined, ratePerMin: b.rate !== undefined ? Math.round(b.rate * 10) / 10 : undefined,
    input: b.input, output: b.output, store: b.store, missing: b.missing, threshold: b.threshold, ratio: b.ratio, pair: b.pair ?? undefined,
    items: b.items?.length,
    value: b.value, acc: b.acc, debt: b.debt, queued: b.bufL?.length,
    terminal: b.type === 'terminal' ? { running: !!b.run, ram: b.ram ?? 0, clock: b.clock ?? 0, hz: sim.terminalHz(b), memory: sim.terminalMemory(b), halted: sim.cpu(b)?.halted ?? null, errors: sim.cpuErrorsOf(b), screen: sim.cpu(b) ? screenText(sim.cpu(b)!) : undefined } : undefined,
  };
}

function solverResult(log: SolverLog) {
  return { ok: log.ok && !log.error, error: log.error, steps: log.steps, placedCount: log.placed.length, placed: log.placed.slice(0, 60).map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, dir: b.dir })) };
}

// ---------------- tools ----------------

server.registerTool(
  'pe_new_game',
  {
    title: 'New game',
    description: `Start a new Planet Escape game. Story mode plays fixed chapter maps (36x36 up to 96x96) with orders that unlock buildings; free play is one large random map.
Args: mode ('story'|'free'), chapter (story only, 1-7, default 1; earlier unlocks are granted), seed (free play), mapSize, allUnlocked, infiniteOre, storms.
Returns the game summary (see pe_get_state).`,
    inputSchema: {
      mode: z.enum(['story', 'free']).default('story'),
      chapter: z.number().int().min(1).max(7).optional().describe('Story chapter to start at; unlocks of earlier chapters are granted'),
      seed: z.number().int().optional().describe('Free play map seed'),
      mapSize: z.enum(['small', 'medium', 'large', 'huge', 'giant']).default('medium'),
      allUnlocked: z.boolean().default(false),
      infiniteOre: z.boolean().default(false),
      storms: z.boolean().default(true),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  async ({ mode, chapter, seed, mapSize, allUnlocked, infiniteOre, storms }) => {
    const options: GameOptions = { mode, mapSize, allUnlocked, infiniteOre, storms };
    if (mode === 'story') sim = new Sim(chapterState(chapter ?? 1, options));
    else sim = new Sim(newGame(seed ?? Math.floor(Math.random() * 1e9), options));
    sim.state.introSeen = true;
    sim.state.tutorialStep = -1;
    eventLog = [];
    return ok(summary());
  },
);

server.registerTool(
  'pe_get_state',
  {
    title: 'Game state',
    description: `Summary of the current game: order progress, inventory in the Core Printer (build material), power, unlocked buildings/recipes, building counts, problem count, contracts. Coordinates are tile indices, (0,0) top-left. Directions: 0 up, 1 right, 2 down, 3 left. Machines output at their front (dir) and accept inputs on every other side; miners must stand on deposits and deposits are reserved for miners; rock ('#') cannot be built on.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => ok(summary()),
);

server.registerTool(
  'pe_map',
  {
    title: 'ASCII map',
    description: `ASCII view of a map region plus the deposit clusters (nearest first). Legend: '.' ground, '#' rock, I iron ore, C copper ore, Q quartz, W ice, O oil, K core, M miner, S smelter, P printer, A assembler, R refinery, F fabricator, s solar, G generator, D depot, Y splitter, T tunnel, X sorter, V overflow, N mixer, L valve, o/* lamp off/on, = switch, Z terminal, q oscillator, ~ bus trace, r register (RAM cell when wired to a terminal), + - * / arithmetic, ^>v< belts.
Args: x, y, w, h (default: 40x24 around the core). Set w/h up to 120.`,
    inputSchema: {
      x: z.number().int().optional(),
      y: z.number().int().optional(),
      w: z.number().int().min(4).max(160).default(40),
      h: z.number().int().min(4).max(160).default(24),
      deposits: z.boolean().default(true).describe('Include the deposit cluster list'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ x, y, w, h, deposits }) => {
    const core = sim.state.buildings[0];
    const x0 = x ?? core.x + 1 - Math.floor(w / 2), y0 = y ?? core.y + 1 - Math.floor(h / 2);
    const map = asciiMap(x0, y0, w, h);
    const data = { x0, y0, w, h, map, deposits: deposits ? depositClusters().slice(0, 30) : undefined };
    const header = `region x=${x0}..${x0 + w - 1} y=${y0}..${y0 + h - 1}\n`;
    return ok(data, header + map + (deposits ? '\n\nDeposits (nearest first):\n' + depositClusters().slice(0, 30).map((d) => `${d.item} at ${d.x},${d.y} (${d.tiles} tiles, ${d.ore} ore, dist ${d.distToCore})`).join('\n') : ''));
  },
);

server.registerTool(
  'pe_list_buildings',
  {
    title: 'List buildings',
    description: 'List buildings with status, recipe, rate and buffers. Filter by type or status; paginate with offset/limit.',
    inputSchema: {
      type: z.enum(BUILDING_IDS).optional(),
      status: z.string().optional().describe("e.g. 'starved', 'blocked', 'jammed', 'dead_end', 'no_recipe', 'depleted'"),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(200).default(50),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ type, status, offset, limit }) => {
    let list = sim.state.buildings.filter((b) => (!type || b.type === type) && (!status || b.status === status));
    if (!type && !status) list = list.filter((b) => b.type !== 'conveyor');
    const total = list.length;
    return ok({ total, offset, count: Math.min(limit, Math.max(0, total - offset)), buildings: list.slice(offset, offset + limit).map(describeBuilding) });
  },
);

server.registerTool(
  'pe_place',
  {
    title: 'Place building',
    description: `Place one building with its top-left at (x,y). Costs are taken from the Core inventory. Returns the building or the reason it cannot be placed (err_occupied, err_rock, err_deposit (miner not on deposit), err_deposit_only_miner, err_cost, err_locked, err_bounds).
For belts prefer pe_route_belt. Assembler/refinery/fabricator need a recipe (pe_configure); smelter and printer pick it from the first input.`,
    inputSchema: { type: z.enum(BUILDING_IDS), x: z.number().int(), y: z.number().int(), dir: DirSchema.default(1), recipe: z.string().optional().describe('Recipe id to set right away, e.g. steel_frame') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ type, x, y, dir, recipe }) => {
    const err = sim.placementError(type, x, y);
    if (err) return fail(`${err} for ${type} at ${x},${y}`);
    const b = sim.place(type, x, y, dir as Dir)!;
    if (recipe) {
      if (!RECIPE_BY_ID[recipe]) return fail(`unknown recipe ${recipe}`);
      sim.setRecipe(b, recipe);
    }
    return ok(describeBuilding(b));
  },
);

server.registerTool(
  'pe_remove',
  {
    title: 'Remove building',
    description: 'Remove a building by id or by a tile it covers. Full refund of its cost and buffered items.',
    inputSchema: { id: z.number().int().optional(), x: z.number().int().optional(), y: z.number().int().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ id, x, y }) => {
    const b = id !== undefined ? sim.byId(id) : x !== undefined && y !== undefined ? sim.at(x, y) : null;
    if (!b) return fail('no building there');
    if (b.type === 'core') return fail('the core cannot be removed');
    sim.remove(b);
    return ok({ removed: b.id, type: b.type });
  },
);

server.registerTool(
  'pe_configure',
  {
    title: 'Configure building',
    description: `Rotate or configure a building. dir sets the output direction. recipe sets a machine recipe (assembler: copper_wire, steel_frame, circuit; printer: machine_part, precision_part; refinery: water, fuel, silicon; fabricator: hull_plate, engine, nav_computer, fuel_cell, life_support; smelter: iron_plate, copper_plate, glass). filter sets the item of a sorter (goes left), valve (watched item) or depot (only this item leaves). threshold (valve) closes when the Core holds >= N. ratio index (mixer): 0=1:1 1=1:2 2=2:1 3=1:3 4=3:1. Lamps (pixels) take mode hold/pass, an item filter and clear; switches take open true/false. In pe_map a lit lamp is '*', an unlit one 'o', an open switch '=', a blocked one 'x'. accept_contract / decline_contract take a contract id.`,
    inputSchema: {
      id: z.number().int().optional(),
      dir: DirSchema.optional(),
      recipe: z.string().optional(),
      filter: z.string().nullable().optional(),
      threshold: z.number().int().optional(),
      ratio: z.number().int().min(0).max(4).optional(),
      mode: z.enum(['hold', 'pass']).optional().describe('lamp: hold keeps the item lit, pass forwards it'),
      open: z.boolean().optional().describe('switch: true lets items through'),
      clear: z.boolean().optional().describe('lamp: remove the held item'),
      program: z.string().optional().describe('terminal: CHIP-8 assembly source (or hex bytes) to load and run'),
      run: z.boolean().optional().describe('terminal: start/stop the program'),
      reset: z.boolean().optional().describe('terminal: restart the program'),
      trace: z.boolean().optional().describe('terminal: slow 2 Hz clock with register lamps'),
      step: z.number().int().min(1).max(1000).optional().describe('terminal: execute N single instructions'),
      key: z.number().int().min(0).max(15).optional().describe('terminal: press this key for ~0.5 s of game time'),
      value: z.number().int().min(0).max(255).optional().describe('multiplier/divider: factor k (1-9); register: set the stored count'),
      accept_contract: z.number().int().optional(),
      decline_contract: z.number().int().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ id, dir, recipe, filter, threshold, ratio, mode, open, clear, program, run, reset, trace, step, key, value, accept_contract, decline_contract }) => {
    if (accept_contract !== undefined || decline_contract !== undefined) {
      const cid = accept_contract ?? decline_contract!;
      const c = sim.state.contracts.find((x) => x.id === cid);
      if (!c) return fail('no such contract');
      if (accept_contract !== undefined) sim.acceptContract(c);
      else sim.declineContract(c);
      return ok({ contract: cid, accepted: accept_contract !== undefined });
    }
    const b = id !== undefined ? sim.byId(id) : null;
    if (!b) return fail('unknown building id');
    if (dir !== undefined) sim.rotate(b, dir as Dir);
    if (mode !== undefined) b.mode = mode;
    if (open !== undefined) b.open = open;
    if (clear && b.type === 'lamp') sim.clearLamp(b);
    if (value !== undefined && b.value !== undefined) b.value = value;
    if (b.type === 'terminal') {
      if (program !== undefined) {
        const errs = sim.setProgram(b, program);
        if (errs.length) return fail(`assembler: ${errs.slice(0, 5).join('; ')}`);
      }
      if (run !== undefined) b.run = run;
      if (reset) sim.resetTerminal(b);
      if (trace !== undefined) b.trace = trace;
      if (step) for (let i = 0; i < step; i++) sim.stepTerminal(b);
      if (key !== undefined) {
        sim.terminalKey(b, key, true);
        for (let i = 0; i < 15; i++) sim.tick(1 / 30);
        sim.terminalKey(b, key, false);
      }
    }
    if (recipe !== undefined) {
      if (!RECIPE_BY_ID[recipe]) return fail(`unknown recipe ${recipe}`);
      sim.setRecipe(b, recipe);
    }
    if (filter !== undefined) b.recipe = filter;
    if (threshold !== undefined) b.threshold = threshold;
    if (ratio !== undefined) { b.ratio = ratio; b.rr = 0; }
    return ok(describeBuilding(b));
  },
);

server.registerTool(
  'pe_route_belt',
  {
    title: 'Route belt',
    description: `Automatically lay a belt from a free start tile to a target building (by id), choosing the cheapest path over free ground and entering the target on a side it accepts. Typical use: start = the tile in front of a miner or machine, target = the next machine or the core (id 1). Returns the path or an error if no route exists.`,
    inputSchema: { from_x: z.number().int(), from_y: z.number().int(), target_id: z.number().int().describe('Building id to deliver into; the core is id 1') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ from_x, from_y, target_id }) => {
    const target = sim.byId(target_id);
    if (!target) return fail('unknown target id');
    const path = routeBelt(sim, { x: from_x, y: from_y }, { building: target });
    if (!path) return fail(`no belt route from ${from_x},${from_y} to ${target.type} #${target_id} (start must be free ground; check rocks/deposits/buildings)`);
    const log: SolverLog = { ok: true, steps: [], placed: [] };
    if (!layPath(sim, path, log)) return fail(log.error ?? 'placement failed');
    return ok({ tiles: path.length, path, placed: log.placed.length });
  },
);

server.registerTool(
  'pe_build_chain',
  {
    title: 'Build production chain',
    description: `Automatically build a whole chain that delivers an item into a target building (default: the core). Places miners on the nearest deposits, one machine per recipe step near the target, sets recipes and routes belts. Use rate_per_min to size the miner count. Returns the steps taken; on failure the partial build stays (use pe_remove or keep it).`,
    inputSchema: { item: z.string(), target_id: z.number().int().default(1), rate_per_min: z.number().min(1).max(120).default(10) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ item, target_id, rate_per_min }) => {
    const target = sim.byId(target_id);
    if (!target) return fail('unknown target id');
    const log: SolverLog = { ok: true, steps: [], placed: [] };
    const res = buildChain(sim, item as ItemId, target, rate_per_min, log);
    log.ok = res;
    return ok(solverResult(log));
  },
);

server.registerTool(
  'pe_solve_order',
  {
    title: 'Solve current order',
    description: 'Automatically build chains for everything the current order still needs (items not yet flowing into the core). Then call pe_tick to let production run. Reports what it built or why it stopped.',
    inputSchema: { rate_per_min: z.number().min(1).max(120).default(10) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ rate_per_min }) => ok(solverResult(solveOrder(sim, rate_per_min))),
);

server.registerTool(
  'pe_tick',
  {
    title: 'Advance time',
    description: 'Run the simulation for N seconds of game time (30 ticks per second). Returns events (order complete, launch, contracts, storms, exhausted deposits), the state summary and current problems. Optionally stop early when the current order completes.',
    inputSchema: { seconds: z.number().min(1).max(3600).default(60), stop_on_order: z.boolean().default(true) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ seconds, stop_on_order }) => {
    const startOrder = sim.state.missionIndex;
    const events: string[] = [];
    const ticks = Math.round(seconds * 30);
    let ran = 0;
    // with spectators the simulation is paced to `speed` game seconds per real second and streamed 5x per second
    const paced = spectator.running;
    const perChunk = paced ? Math.max(1, Math.round((spectator.speed * 30) / 5)) : ticks;
    ticking = paced ? spectator.speed : 0;
    try {
      for (let i = 0; i < ticks; i++) {
        sim.tick(1 / 30);
        ran++;
        if (sim.events.length) events.push(...drainEvents());
        if (stop_on_order && sim.state.missionIndex !== startOrder) break;
        if (paced && ran % perChunk === 0) {
          spectator.broadcast();
          await sleep(200);
        }
      }
    } finally {
      ticking = 0;
    }
    return ok({ secondsRun: Math.round(ran / 30), events, problems: sim.analyze().slice(0, 20).map((p) => ({ status: p.status, building: describeBuilding(p.building), missing: p.missing })), state: summary() });
  },
);

server.registerTool(
  'pe_analyze',
  {
    title: 'Diagnose problems',
    description: 'List everything that keeps a chain from running: jammed belts, dead ends, starved machines (with missing items), blocked outputs, unpaired tunnels, exhausted deposits, missing recipes. Also reports the power balance.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const st = sim.state;
    return ok({ power: { demand: st.powerDemand, supply: st.powerSupply, low: st.powerDemand > st.powerSupply }, problems: sim.analyze().slice(0, 60).map((p) => ({ status: p.status, missing: p.missing, building: describeBuilding(p.building) })) });
  },
);

server.registerTool(
  'pe_plan',
  {
    title: 'Production plan',
    description: 'Throughput calculator: for an item and a target rate per minute, list every step with the number of machines/miners needed (including upgrades), the machine type and belt capacity. Read-only.',
    inputSchema: { item: z.string(), rate_per_min: z.number().min(1).max(600).default(10) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ item, rate_per_min }) => {
    const rows: { item: string; perMin: number; machine: string; machines: number; recipe?: string }[] = [];
    const walk = (id: ItemId, perMin: number, depth: number, seen: Set<string>) => {
      const r = RECIPES.find((rc) => rc.output === id);
      if (r) {
        rows.push({ item: id, perMin: +perMin.toFixed(2), machine: r.machine, machines: +(perMin / machineRate(sim, r.id)).toFixed(2), recipe: r.id });
        if (seen.has(id) || depth > 6) return;
        seen.add(id);
        for (const k in r.inputs) walk(k as ItemId, (perMin * r.inputs[k as ItemId]!) / r.outputCount, depth + 1, seen);
      } else rows.push({ item: id, perMin: +perMin.toFixed(2), machine: 'miner', machines: +(perMin / minerRate(sim)).toFixed(2) });
    };
    walk(item as ItemId, rate_per_min, 0, new Set());
    return ok({ item, rate_per_min, beltCapacityPerMin: Math.round(beltCapacity(sim)), steps: rows, buildCosts: Object.fromEntries(BUILD_ORDER.map((b) => [b, BUILDINGS[b].cost])), shipParts: SHIP_PARTS, recipes: RECIPES.map((r) => ({ id: r.id, machine: r.machine, inputs: r.inputs, output: r.output, outputCount: r.outputCount, seconds: r.seconds })) });
  },
);

server.registerTool(
  'pe_save',
  {
    title: 'Save / load',
    description: "Persist or restore the game as JSON. action 'export' returns the JSON string, 'import' loads it from the json argument, 'write' saves to a file path, 'read' loads from a file path. Exported saves are compatible with the browser game's import.",
    inputSchema: { action: z.enum(['export', 'import', 'write', 'read']), json: z.string().optional(), path: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ action, json, path }) => {
    if (action === 'export') return ok({ json: serialize(sim.state) }, serialize(sim.state));
    if (action === 'write') {
      if (!path) return fail('path required');
      writeFileSync(path, serialize(sim.state));
      return ok({ written: path });
    }
    const raw = action === 'read' ? readFileSync(path!, 'utf8') : json;
    if (!raw) return fail('json or path required');
    const st = JSON.parse(raw) as GameState;
    if (!Array.isArray(st.buildings)) return fail('not a save');
    sim = new Sim(st);
    return ok(summary());
  },
);

server.registerTool(
  'pe_playbook',
  {
    title: 'How to play (agent guide)',
    description: 'The strategy guide for agents: the loop for one chapter, how to react to solver errors, how to fix every problem status, manual placement rules and chapter-specific notes. Read it once at the start of a round.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => ({ content: [{ type: 'text' as const, text: PLAYBOOK }] }),
);

server.registerTool(
  'pe_next_chapter',
  {
    title: 'Next chapter',
    description: 'Story mode: after the current order completed, move to the next chapter map (unlocks, upgrades and statistics carry over, the factory restarts from the chapter stock). Fails when the current order is still open.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  async () => {
    const st = sim.state;
    if (st.options.mode !== 'story') return fail('only in story mode; in free play the next order simply continues on the same map');
    if (st.launched) return fail('the ship has launched: the story is complete. Start a new game with pe_new_game.');
    const chapter = st.missionIndex; // missionIndex already points at the next order once the previous one completed
    if (chapter >= LEVELS.length) return fail('no further chapter');
    // the previous order counts as complete when missionIndex moved past the chapter this map was generated for
    const mapChapter = LEVELS.findIndex((l) => l.seed === st.seed);
    if (mapChapter >= 0 && st.missionIndex <= mapChapter) return fail(`order ${st.missionIndex + 1} is still open on this map; complete it first (pe_solve_order / pe_tick)`);
    sim = new Sim(levelState(st, chapter, st.options));
    sim.state.introSeen = true;
    sim.state.tutorialStep = -1;
    eventLog = [];
    return ok({ chapter: chapter + 1, state: summary() }, `Chapter ${chapter + 1} started.\n` + JSON.stringify(summary(), null, 1));
  },
);

server.registerPrompt(
  'play_chapter',
  {
    title: 'Play a chapter',
    description: 'Instructs the agent to play one story chapter of Planet Escape end to end and report the result.',
    argsSchema: { chapter: z.string().describe('Chapter number 1-7').default('1') },
  },
  ({ chapter }) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Play chapter ${chapter} of Planet Escape with the pe_ tools. Follow this playbook:\n\n${PLAYBOOK}\n\nStart now with pe_new_game (mode story, chapter ${chapter}). When the order completes, export the save with pe_save and report chapter, game time, building count and remaining problems.`,
        },
      },
    ],
  }),
);

server.registerTool(
  'pe_spectate',
  {
    title: 'Live view for humans',
    description: `Start or stop a local spectator page so a human can watch you play in a browser. Returns the URL (default http://localhost:7411/spectate/). While the page is active, pe_tick runs paced at \`speed\` game seconds per real second (default 10) and streams every change, so keep pe_tick calls to <= 300 seconds each. Tell the human the URL. Requires the built site (npm run build).`,
    inputSchema: {
      action: z.enum(['start', 'stop', 'status']).default('start'),
      port: z.number().int().min(1024).max(65535).default(7411),
      speed: z.number().min(1).max(60).default(10).describe('game seconds per real second while ticking'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ action, port, speed }) => {
    if (action === 'stop') {
      spectator.stop();
      return ok({ running: false }, 'Spectator page stopped.');
    }
    if (action === 'status') return ok({ running: spectator.running, url: spectator.url, speed: spectator.speed, viewers: undefined });
    try {
      const url = await spectator.start(port, speed);
      return ok({ running: true, url, speed }, `Live view: ${url}\nTell the human to open it. Ticking is now paced at ${speed}x; use pe_tick with at most 300 seconds per call so the viewer can follow.`);
    } catch (e) {
      return fail(String((e as Error).message ?? e));
    }
  },
);

server.registerTool(
  'pe_chapters',
  {
    title: 'Chapters & orders',
    description: 'Static reference: the seven story chapters (map size, deposits, start inventory) and every order with its deliverables, build requirements and unlocks.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => ok({ chapters: LEVELS.map((l, i) => ({ chapter: i + 1, size: l.size, deposits: l.basics.map((b) => b.type), rocks: l.rocks, storms: l.storms, startInventory: l.inventory, order: MISSIONS[i] })), events: eventLog.slice(-20) }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
