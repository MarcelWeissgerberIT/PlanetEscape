# Planet Escape

**EN** · A bilingual (English / German) sci-fi factory-building game for phones and desktop browsers. Your ship crash-landed on a dead planet. Mine ore, smelt it, assemble components and build production chains that deliver ship parts to the Landing Core – then launch and escape.

**DE** · Ein zweisprachiges (Deutsch / Englisch) Sci-Fi-Fabrik-Aufbauspiel für Handy und Desktop-Browser. Dein Schiff ist auf einem toten Planeten abgestürzt. Baue Erz ab, schmelze es, montiere Bauteile und baue Produktionsketten, die Schiffsteile zum Landekern liefern – dann starte und entkomme.

![Planet Escape](public/assets/ui/title_bg.webp)

## Play / Spielen

```bash
npm install
npm run dev        # http://localhost:5173 (also reachable from your phone on the same Wi-Fi via --host)
npm run build      # production build in dist/
npm run preview    # serve the production build
```

The game is a PWA: open it in Safari on iPhone and use *Share → Add to Home Screen* for a full-screen app. Progress is saved automatically in the browser (localStorage).

A GitHub Actions workflow (`.github/workflows/deploy.yml`) deploys `dist/` to GitHub Pages on every push to `main`. Enable *Settings → Pages → Source: GitHub Actions* once in the repository.

## Story & loop

You are KORA, the ship AI. The crash left exactly one working industrial 3D printer, the *Core Printer*. Everything delivered to it becomes build material: minerals → smelt / refine → parts → depots → **print machines** → real ship parts. In story mode the seven orders are chapters on fixed maps that grow from 36×36 (iron only, no rocks) to 96×96 (everything); unlocks, upgrades and stats carry over while the factory is rebuilt each chapter. Free play is one large random map. The orders lead from the first ore to the finished ship; KORA also offers timed side contracts, four upgrade tracks (belts, drills, machines, power), dust storms that weaken solar power, and deposits that run out, so the base has to keep expanding across a 120×120 map with rock formations that force routing decisions. A scan overlay shows item flows, rates and problems; a diagnostics panel lists everything that keeps a chain from running and jumps to it.

## How it works / So funktioniert es

| Building | What it does |
| --- | --- |
| **Core Printer** | Accepts every item. Delivered items become build material; ship parts are installed on the ship, which visibly grows on the pad. |
| **Conveyor** | Moves items in the arrow direction. Drag to lay several; double-tap (or tap with the belt tool) to turn. Side-feeding belts merge. |
| **Belt tunnel** | Entrance + exit up to 4 tiles ahead: belts cross rocks and other belts underground. |
| **Miner** | Only on deposits (and deposits are reserved for miners). Passes items from behind through, so miners chain. Deposits run out. |
| **Smelter** | Ore → plates, quartz → glass. Picks the recipe from its first input. |
| **3D Printer** (2×2) | Iron plates + wire → machine parts; later steel frames + circuits → precision parts. Every higher machine costs printed parts. |
| **Assembler** (2×2) | Wire, steel frames, circuits. |
| **Refinery** (2×2) | Ice → water, oil + water → rocket fuel, quartz + water → silicon. |
| **Fabricator** (2×2) | Hull plates, engines, nav computers, fuel cells, life support. |
| **Solar panel / Fuel generator** | Power. When demand exceeds supply every machine slows down proportionally. |
| **Splitter** | Takes items from behind and distributes them left / forward / right. |
| **Sorter** (XOR) | The chosen item leaves to the left, everything else goes straight on. |
| **Overflow** (OR) | Items go straight; only when the front is blocked they spill left, then right. |
| **Mixer** (AND) | Takes from left and right and releases forward in a fixed ratio (1:1 … 3:1). |
| **Valve** | Closes while the Core holds at least N of the watched item: demand-driven production. |
| **Depot** | Buffers 120 items, passes them on at its front, optional output filter. |

Seven orders unlock buildings and recipes step by step. The last one is the ship itself:
30 hull plates, 6 engines, 4 nav computers, 14 fuel cells, 6 life-support modules.

### Tools

* **Blueprints:** ⧉ then drag a rectangle to copy buildings (with recipes and settings), tap to paste, ⟳ to rotate, 💾 to save into the blueprint library (menu).
* **Time:** ⏸ pause and ⏩ 1×/2×/3× (Space, F).
* **Throughput calculator:** open any item's production chain and pick a target rate; it lists how many miners and machines each step needs, including your upgrades and belt capacity warnings.
* **Undo:** ↶ removes the last placement or a whole belt drag (Z).
* **Save transfer:** menu → export/import as code or file to move a game between devices.

### Controls

* **Touch:** tap to place / select, drag to pan (or to lay belts when the conveyor is selected), pinch to zoom, long-press a building to select it.
* **Mouse / keyboard:** wheel to zoom, drag to pan, right-drag always pans, `R` rotate, `X` removal mode, `Esc` cancel.

## Tech

* Vite + TypeScript, no framework. Canvas 2D renderer with a DOM overlay for the UI.
* Fixed 30 Hz simulation (`src/game/sim.ts`), rendering at display refresh rate.
* Art generated with OpenArt (Nano Banana 2) from one style-anchor image, post-processed with `sharp` (`npm run assets`, sources in `tools/raw/`, not committed).
* i18n dictionary in `src/i18n/index.ts`; language is auto-detected and can be switched in the menu.

## Project layout

```
src/game/data.ts     items, buildings, recipes, missions, balancing constants
src/game/world.ts    terrain generation, new game state
src/game/sim.ts      belts, machines, power, missions
src/game/render.ts   canvas rendering (belts are drawn procedurally)
src/game/input.ts    touch / mouse / keyboard handling
src/ui/hud.ts        title screen, HUD, info panel, modals
tools/process-assets.mjs  raw OpenArt renders -> optimized webp sprites
```
