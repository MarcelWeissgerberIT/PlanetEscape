---
name: play-planet-escape
description: Play a round of Planet Escape through its MCP server (tools prefixed pe_) - start a story chapter or free play, let the auto-solver build the production chains, tick the simulation, diagnose and repair chains, advance to the next chapter and export the save for the human. Use when asked to play, test, solve or demo Planet Escape, or to check whether a chapter is solvable.
---

# Play Planet Escape

Requires the `planet-escape` MCP server. If its tools (`pe_new_game`, `pe_solve_order`, …) are not available:

```bash
npm install && npm run mcp:build          # in the PlanetEscape checkout
claude mcp add planet-escape -- node "$PWD/mcp/dist/index.mjs"
```

Then follow [PLAYBOOK.md](PLAYBOOK.md) in this folder step by step. In short:

1. `pe_new_game` (story chapter or free play) → read the order.
2. `pe_solve_order` → on *out of material* tick 180–300 s and solve again; on routing errors build per item with `pe_build_chain`.
3. `pe_tick` 600 s with `stop_on_order` → `pe_analyze` → fix → tick again until `order N complete`.
4. `pe_next_chapter` for the following chapter, or `pe_save` `export` to hand the game to the human.

If the user wants to watch, call `pe_spectate` first and give them the URL; then tick in chunks of at most 300 s.

Report chapter, outcome, game time, building count and open problems. Do not tick more than about 1200 s without a `pe_analyze` check.
