# Saves / Spielstände

Ready-made saves for the browser game. Load one via **Menu → Export / import save → paste or choose file**.
Fertige Spielstände. Laden im Spiel über **Menü → Export/Import → einfügen oder Datei wählen**.

| File | What it is |
| --- | --- |
| `tic-tac-toe.json` | Free play with a playable 3×3 tic‑tac‑toe board right of the core: LED lamps are the cells, iron plates are X (rows, switch above each cell), copper plates are O (columns, switch left of each cell). Tap a switch to drop one plate into the cell, tap it again to close it. Clear a cell via its panel. The rows and columns are kept pressurised by depots, so a move is instant. |

| `kora-terminal.json` | Free play with a KORA Terminal running PONG on a 2048‑lamp display, four rim switches as keys and solar power. Tap the terminal for screen, keypad and the program editor. |

Regenerate with `npm run save:ttt` / `npm run save:terminal` (script in `tools/make-save-ttt.ts`). These files are not part of the website build.
