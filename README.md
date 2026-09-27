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

## How it works / So funktioniert es

| Building | What it does |
| --- | --- |
| **Landing Core** | Accepts every item. Delivered items become build resources and ship parts. |
| **Conveyor** | Moves items in the arrow direction. Drag to lay several; tap a belt to rotate it. Side-feeding belts merge. |
| **Miner** | Must sit on a deposit (iron, copper, quartz, ice, oil). Pushes ore out of its front. |
| **Smelter** | Ore → plates, quartz → glass. Picks the recipe from its input automatically. |
| **Assembler** (2×2) | Wire, steel frames, circuits and all ship parts. Choose the recipe by tapping the building. |
| **Refinery** (2×2) | Ice → water, oil + water → rocket fuel, quartz + water → silicon. |
| **Solar panel / Fuel generator** | Power. When demand exceeds supply every machine slows down proportionally. |
| **Splitter** | Takes items from behind and distributes them left / forward / right. |
| **Storage** | Buffers 60 items and passes them on at its front. |

Six missions unlock buildings and recipes step by step. The last one is the ship itself:
16 hull plates, 4 engines, 2 nav computers, 8 fuel cells, 3 life-support modules.

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
