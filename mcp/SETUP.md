# Planet Escape für KI‑Agenten einrichten · Set up Planet Escape for AI agents

🇩🇪 [Deutsch](#deutsch) · 🇬🇧 [English](#english)

---

## Deutsch

Planet Escape hat einen **MCP‑Server** (Model Context Protocol). Damit kann ein KI‑Agent wie Claude das Spiel ohne Browser spielen: Karte lesen, bauen, Produktionsketten planen, Aufträge erfüllen. Die Einrichtung dauert etwa zwei Minuten.

### 1. Voraussetzungen

- [Node.js](https://nodejs.org) 18 oder neuer (`node -v` zeigt die Version)
- Git

### 2. Spiel holen und Server bauen

```bash
git clone https://github.com/MarcelWeissgerberIT/PlanetEscape.git
cd PlanetEscape
npm install
npm run build        # baut das Spiel (wird für die Live‑Zuschauerseite gebraucht)
npm run mcp:build    # baut den MCP‑Server nach mcp/dist/index.mjs
```

Merke dir den vollständigen Pfad zu `mcp/dist/index.mjs`, zum Beispiel `/Users/du/PlanetEscape/mcp/dist/index.mjs` oder `C:\Users\du\PlanetEscape\mcp\dist\index.mjs`.

### 3. Mit deinem Agenten verbinden

**Claude Code** (Terminal, im Projektordner):

```bash
claude mcp add planet-escape -- node "$PWD/mcp/dist/index.mjs"
```

**Claude Desktop**: Einstellungen → Entwickler → Konfiguration bearbeiten (`claude_desktop_config.json`), dann eintragen und Claude Desktop neu starten:

```json
{
  "mcpServers": {
    "planet-escape": {
      "command": "node",
      "args": ["/vollständiger/pfad/zu/PlanetEscape/mcp/dist/index.mjs"]
    }
  }
}
```

**Cursor, Windsurf, VS Code (Copilot Agent), Cline und andere MCP‑Clients**: Der Server spricht das Standard‑Protokoll über stdio. Trage denselben Eintrag in die MCP‑Konfiguration deines Clients ein (bei Cursor `.cursor/mcp.json`, bei VS Code `.vscode/mcp.json` mit `"type": "stdio"`). Befehl `node`, Argument der Pfad zu `mcp/dist/index.mjs`.

### 4. Spielen lassen

Sag dem Agenten einfach:

> Spiel Kapitel 1 von Planet Escape.

Der Agent holt sich mit `pe_playbook` die Spielanleitung, startet das Kapitel, lässt den eingebauten Auto‑Solver die Ketten bauen, lässt die Zeit laufen und repariert Störungen. Weitere nützliche Sätze:

- „Löse Kapitel 3 und geh danach zu Kapitel 4.“
- „Spiel Freispiel mit Seed 42 und baue eine Schaltkreis‑Kette mit 20 pro Minute.“
- „Exportiere den Spielstand.“ (den Text dann im Spiel unter Menü → Export/Import einfügen)

In Claude Code gibt es zusätzlich den Skill `/play-planet-escape`, der den Agenten Schritt für Schritt durch eine Runde führt.

### 5. Live zuschauen

Sag: „Starte die Zuschauerseite.“ Der Agent ruft `pe_spectate` auf und nennt dir eine Adresse, normalerweise http://localhost:7411/spectate/. Dort siehst du die Fabrik live entstehen, samt aller Werkzeugaufrufe des Agenten. Solange die Seite läuft, läuft die Simulation in Echtzeit (10× Spielzeit).

### Probleme?

| Meldung | Lösung |
| --- | --- |
| `Cannot find module …/mcp/dist/index.mjs` | `npm run mcp:build` im Projektordner ausführen, Pfad prüfen |
| Werkzeuge `pe_…` erscheinen nicht | Client neu starten; in Claude Code `claude mcp list` prüfen |
| `built site not found` bei `pe_spectate` | einmal `npm run build` ausführen |
| Port 7411 belegt | `pe_spectate` mit anderem `port` aufrufen |

---

## English

Planet Escape ships an **MCP server** (Model Context Protocol). With it an AI agent such as Claude can play the game without a browser: read the map, build, plan production chains, fulfil orders. Setup takes about two minutes.

### 1. Prerequisites

- [Node.js](https://nodejs.org) 18 or newer (`node -v` shows the version)
- Git

### 2. Get the game and build the server

```bash
git clone https://github.com/MarcelWeissgerberIT/PlanetEscape.git
cd PlanetEscape
npm install
npm run build        # builds the game (needed for the live spectator page)
npm run mcp:build    # builds the MCP server to mcp/dist/index.mjs
```

Note the full path to `mcp/dist/index.mjs`, e.g. `/Users/you/PlanetEscape/mcp/dist/index.mjs` or `C:\Users\you\PlanetEscape\mcp\dist\index.mjs`.

### 3. Connect your agent

**Claude Code** (terminal, inside the project folder):

```bash
claude mcp add planet-escape -- node "$PWD/mcp/dist/index.mjs"
```

**Claude Desktop**: Settings → Developer → Edit config (`claude_desktop_config.json`), add the entry and restart Claude Desktop:

```json
{
  "mcpServers": {
    "planet-escape": {
      "command": "node",
      "args": ["/full/path/to/PlanetEscape/mcp/dist/index.mjs"]
    }
  }
}
```

**Cursor, Windsurf, VS Code (Copilot agent), Cline and other MCP clients**: the server speaks the standard protocol over stdio. Put the same entry into your client's MCP configuration (Cursor: `.cursor/mcp.json`, VS Code: `.vscode/mcp.json` with `"type": "stdio"`). Command `node`, argument the path to `mcp/dist/index.mjs`.

### 4. Let it play

Just tell the agent:

> Play chapter 1 of Planet Escape.

The agent fetches the strategy guide with `pe_playbook`, starts the chapter, lets the built‑in auto‑solver build the chains, advances time and repairs problems. Other useful requests:

- "Solve chapter 3, then move on to chapter 4."
- "Play free mode with seed 42 and build a circuit chain at 20 per minute."
- "Export the save." (paste the text into the game under Menu → Export/Import)

In Claude Code there is also the skill `/play-planet-escape` that walks the agent through a round.

### 5. Watch live

Say: "Start the spectator page." The agent calls `pe_spectate` and gives you an address, normally http://localhost:7411/spectate/. There you watch the factory grow live, including every tool call the agent makes. While the page runs, the simulation is paced in real time (10× game speed).

### Trouble?

| Message | Fix |
| --- | --- |
| `Cannot find module …/mcp/dist/index.mjs` | run `npm run mcp:build` in the project folder, check the path |
| `pe_…` tools do not show up | restart the client; in Claude Code check `claude mcp list` |
| `built site not found` from `pe_spectate` | run `npm run build` once |
| port 7411 in use | call `pe_spectate` with another `port` |
