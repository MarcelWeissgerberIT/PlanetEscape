# Saves / Spielstände

Ready-made saves for the browser game. Load one via **Menu → Export / import save → paste or choose file**.
Fertige Spielstände. Laden im Spiel über **Menü → Export/Import → einfügen oder Datei wählen**.

| File | What it is |
| --- | --- |
| `tic-tac-toe.json` | Free play with a playable 3×3 tic‑tac‑toe board right of the core: LED lamps are the cells, iron plates are X (rows, switch above each cell), copper plates are O (columns, switch left of each cell). Tap a switch to drop one plate into the cell, tap it again to close it. Clear a cell via its panel. The rows and columns are kept pressurised by depots, so a move is instant. |

| `kora-terminal.json` | Free play with a KORA Terminal running PONG on a 2048‑lamp display. The mainboard is built from parts: 288 registers wired by a bus trace are the RAM (one byte each, PC and I cells highlighted), two oscillators with quartz give the 600 Hz clock. Four block players (splitter → register + divider → rim switch in pulse mode) press the keys in long strokes, and an 8×22 lamp block above the terminal shows PC, opcode, I and V0…VF live. Tap the terminal for screen, keypad, register readout, Trace/Step and the program editor. |
| `kora-ray.json` | KORA RAY: a first-person maze (Wolfenstein-style raycaster) running on a board built from parts. Ten oscillators with glass crystals give the 60 kHz turbo clock, a 32×32 register field is the 1 KB RAM, keys W/A/S/D/E on the rim. |
| `kora-blocks.json` | KORA BLOCKS: a colour 2D block world (dig, jump, place) whose map lives in a 64×43 register field as numbers; four display planes, 24 kHz turbo. |

All of these are also built into the game: title screen → Playground → Examples (generated on the fly from `src/game/examples.ts`, so nothing large ships with the site). Regenerate the files with `npm run save:ttt` / `npm run save:terminal` / `npm run save:ray` / `npm run save:blocks` (script in `tools/make-save-ttt.ts`). These files are not part of the website build.
