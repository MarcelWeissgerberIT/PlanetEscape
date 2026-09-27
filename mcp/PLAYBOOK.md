# Planet Escape – agent playbook

You are playing a factory-building game through MCP tools (prefix `pe_`). The goal of one round: fulfil
KORA's current order by building production chains that deliver items into the Landing Core. Story mode has
seven chapters; each chapter is one order on its own small map. Free play is one large map with all seven
orders in sequence.

## The loop for one chapter (do this, in this order)

1. `pe_new_game` with `mode: "story"` and the `chapter` (1–7), or `pe_next_chapter` when the previous order
   just completed. Read the returned summary: the order (`deliver`, `build`), the inventory and the unlocks.
2. `pe_solve_order` with `rate_per_min` 6–10. It designs and places the whole chain for the order.
   - `ok: true` → go to step 3.
   - `ok: false` and the error says *out of material* → the solver already started a supply chain into the
     core. `pe_tick` for 180–300 s, then call `pe_solve_order` again. Repeat up to 4 times.
   - `ok: false` and the error says *no belt route* or *no space* → the area around the consumer is crowded.
     Look at `pe_map` around the core (30×30), then build per item with `pe_build_chain` at a lower rate
     (`rate_per_min: 4`) or place things yourself (see manual play below).
3. `pe_tick` with `seconds: 600` and `stop_on_order: true`. It stops early when the order completes.
4. If the order is not complete after ticking: `pe_analyze`. Fix what it reports (see below), then tick again.
5. When the events say `order N complete`: report the result (chapter, time, buildings). For a multi-chapter
   run continue with `pe_next_chapter`. Optionally `pe_save` with `action: "export"` so a human can load the
   same game in the browser (Menu → Export / import save).

Never tick more than ~1200 s without checking `pe_analyze`; a broken chain never repairs itself.

## When a human wants to watch

Call `pe_spectate` (action `start`) first and tell the human the URL it returns (normally
http://localhost:7411/spectate/). While the page runs, `pe_tick` is paced to real time (10 game seconds per
real second by default), so use `pe_tick` with at most 300 seconds per call and keep narrating what you do.
Stop it with `pe_spectate` action `stop` when the round is over.

## Fixing problems (`pe_analyze` / the `problems` list)

| status | meaning | fix |
| --- | --- | --- |
| `starved` + `missing` | machine waits for an input item | `pe_build_chain` with `item` = missing item and `target_id` = that machine |
| `blocked` | output cannot leave | give the arrow side a free belt: `pe_route_belt` from the machine to the consumer |
| `jammed` / `dead_end` | belt points into something that does not accept | `pe_configure` with `dir` to turn the last belt, or `pe_remove` it |
| `no_recipe` | assembler/refinery/fabricator without recipe | `pe_configure` with `recipe` |
| `depleted` | deposit under a miner is empty | `pe_remove` the miner (full refund) and put a new one on another deposit tile |
| `low_power` (power.low) | demand > supply, everything slows | place `solar` panels (4 power each) on free ground; after research, power upgrades |
| `unpaired` | tunnel entrance without exit | place the exit tunnel in line within range |

## Manual play (when the solver cannot)

- Directions: 0 = up, 1 = right, 2 = down, 3 = left. Machines output on the arrow side; every other side accepts inputs.
  Miners must stand on deposit tiles (`I` iron, `C` copper, `Q` quartz, `W` ice, `O` oil in `pe_map`) and output at the arrow.
- `pe_place` a miner on a deposit edge, facing free ground. `pe_place` a machine 2–4 tiles away, facing the core.
  `pe_route_belt` from the miner to the machine, then from the machine to the core (it finds the path and lays
  the belts). `pe_configure` the recipe on assemblers, refineries and fabricators (smelters and printers pick
  the recipe from the first item that arrives).
- Keep the four sides of the core reachable: do not ring it with belts. Bring each chain in from a different side.
- Costs come out of the inventory; belts cost 1 iron plate each. Long belts are the usual reason the material runs out.
  Removing anything refunds it fully.
- `pe_plan` tells you how many machines a rate needs (e.g. 1 smelter ≈ 30 plates/min, 1 miner ≈ 20 ore/min).

## Chapter notes

- Ch 1: ore only. One miner + 2 belts into the core.
- Ch 2: plates. Miner → smelter → core, once for iron, once for copper.
- Ch 3: needs a 3D printer built and 6 machine parts. Machine parts = 2 iron plates + 1 copper wire in a printer;
  wire comes from an assembler (copper plates). KORA hands over 8 machine parts for the first assembler.
- Ch 4: copper wire + steel frames (assembler, 3 iron plates each).
- Ch 5: circuits (assembler: 1 iron plate + 2 wire) and glass (smelter from quartz).
- Ch 6: water and fuel (refineries from ice and oil) plus precision parts (printer: steel frame + circuit).
- Ch 7: five ship parts at once. Do NOT solve everything in one go: build one part's chain at a time with
  `pe_build_chain`, tick until the part count is reached, and keep an iron_plate and copper_plate chain running
  into the core the whole time for material. Solar power is essential here (aim for supply ≥ demand).

## Reporting

At the end of a round say: which chapter, whether the order completed, game time used (from the summary),
number of buildings, and anything you could not fix. If you exported the save, include the JSON so the human
can load it.
