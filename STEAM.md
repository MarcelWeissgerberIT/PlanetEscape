# Planet Escape auf Steam: Checkliste

Die Web-Version (https://planet-escape.dev/) ist ab jetzt die kostenlose Demo. Für Steam gibt es eine Desktop-App (Electron) aus
demselben Code. Dieses Dokument listet, was im Repository schon vorbereitet ist und was noch zu tun ist.

## Was im Repository schon fertig ist

| Teil | Wo | Kurz |
|---|---|---|
| Desktop-App | `desktop/` | Electron-Hülle: lädt das Spiel über `app://`, Spielstände als Dateien, Vollbild (F11), Beenden, externe Links im Browser |
| Web-Build für die App | `npm run desktop:web` | Vite mit `--mode desktop` → `desktop/app/` (ohne Service Worker, ohne KI-Links) |
| Steam-Anbindung | `desktop/main.cjs` | `steamworks.js` (optional): Achievements und Overlay, sobald eine App ID gesetzt ist; ohne Steam läuft die App normal |
| Achievements | `src/game/achievements.ts` | 17 Stück, im Spiel sichtbar (Menü → Erfolge), in der App an Steam gemeldet |
| Demo-Edition | `PE_EDITION=demo` | Kapitel 1–3 und 2 Herausforderungen, danach Hinweis mit Link zur Shop-Seite (`PE_STORE_URL`) |
| Builds für Windows, macOS, Linux | `.github/workflows/desktop.yml` | Actions → „Desktop builds“ → Run workflow (Edition + App ID) oder ein Tag `v*` |
| Upload zu Steam | `desktop/steam/` | `app_build.vdf.template` + `upload.sh` (steamcmd) |
| Shop-Grafiken (Entwürfe) | `steam-assets/` | alle Kapselgrößen, erzeugt mit `node tools/steam-art.mjs` |
| Screenshots | `steam-assets/screenshots/` | 7 Stück je Sprache (EN/DE), 1920×1080, erzeugt mit `tools/steam-shots.mjs` |

### Lokal ausprobieren

```bash
npm run desktop:web                 # Spiel für die App bauen
cd desktop && npm install           # einmalig: Electron, electron-builder, steamworks.js
npm start                           # App starten
npx electron-builder                # Installer/Pakete für das eigene System → desktop/release/
```

Demo bauen: `PE_EDITION=demo PE_STORE_URL=https://store.steampowered.com/app/<APPID>/ npm run desktop:web`

## Was du selbst erledigen musst

### 1. Steamworks-Konto (einmalig)
- Auf https://partner.steamgames.com registrieren, Firmen-/Bankdaten und **Steuerformular** (W-8BEN für Privatpersonen
  bzw. W-8BEN-E für Firmen in Deutschland) ausfüllen, Identität bestätigen.
- **Steam Direct**-Gebühr: 100 USD pro Spiel, wird ab 1000 USD Umsatz zurückerstattet.
- Valve behält 30 % (ab 10 Mio. USD weniger). In Deutschland: Einnahmen sind gewerblich → Gewerbe anmelden bzw. mit
  Steuerberatung klären (Umsatzsteuer übernimmt Steam für Verkäufe an Endkunden in der EU).

### 2. App anlegen
- Nach der Zahlung bekommst du eine **App ID** (und für eine Demo eine zweite).
- Unter *SteamPipe → Depots* drei Depots anlegen: Windows, macOS, Linux. Die IDs in `desktop/steam/app_build.vdf`
  (Kopie der Vorlage) eintragen.
- *Installation → Launch options*:
  - Windows: `Planet Escape.exe`
  - macOS: `Planet Escape.app`
  - Linux: `planet-escape`
- *Steam Cloud*: Auto-Cloud mit diesen Pfaden einrichten (Dateien `*.json`):
  - Windows: `WinAppDataRoaming` → `Planet Escape/saves`
  - macOS: `MacAppSupport` → `Planet Escape/saves`
  - Linux: `LinuxXdgConfigHome` → `Planet Escape/saves` (Electron speichert unter `~/.config`, nicht `~/.local/share`)

### 3. Achievements eintragen
Unter *Stats & Achievements* genau diese API-Namen anlegen (Name/Beschreibung EN+DE stehen in `src/i18n/index.ts`
unter `ach_<ID>` und `ach_<ID>_desc`). Pro Achievement zwei Icons, 256×256 (farbig + grau).
Fertige Icons liegen in `steam-assets/achievements/`: `<ID>.jpg` (freigeschaltet) und `<ID>_locked.jpg` (grau), je
256×256. Neu erzeugen aus `tools/raw/ach/<ID>.png` mit `node tools/achievement-icons.mjs` (schreibt auch die
Icons fürs Spiel nach `public/assets/ach/`).

| API-Name | Deutsch | Englisch |
|---|---|---|
| FIRST_PLATE | Erste Platte | First plate |
| FIRST_PART | Feinarbeit | Precision work |
| CHAPTER_3 | Angekommen | Getting started |
| CHAPTER_6 | Fast geschafft | Almost there |
| THREE_STARS | Drei Sterne | Three stars |
| LAUNCH | Abheben | Liftoff |
| FLIGHTS_5 | Nachschublinie | Supply line |
| CONTRACTS_10 | Zuverlässiger Partner | Reliable partner |
| AUTOMATION | Uhrwerk | Clockwork |
| RESEARCH_5 | Forschungsgeist | Researcher |
| ROBOT_FLEET | Flotte | Fleet |
| SERVICE_50 | Gut gewartet | Well maintained |
| RECYCLE_100 | Nichts verschwendet | Nothing wasted |
| BIG_FACTORY | Industriegebiet | Industrial zone |
| GOLD_ANY | Gold | Gold |
| GOLD_ALL | Ruhmeshalle | Hall of fame |
| SHARE | Kampfansage | Challenger |

Danach die Achievements in Steamworks **veröffentlichen** (Publish), sonst meldet die App sie ins Leere.

### 4. Shop-Seite
- **Grafiken**: `steam-assets/` enthält Entwürfe in allen Pflichtgrößen (header 920×430, small 462×174, main 1232×706,
  vertical 748×896, library 600×900, library hero 3840×1240, library logo 1280×720). Sie sind aus dem Titelbild gebaut –
  brauchbar zum Starten, für den Verkauf lohnt sich eigene Key-Art. Wichtig: Kapseln dürfen nur Logo + Art zeigen
  (keine Wertungen, „Sale“ o. Ä.).
- **Screenshots**: mind. 5 Stück, `steam-assets/screenshots/` (EN und DE getrennt hochladen, Steam kann pro Sprache).
- **Trailer**: fertig in `steam-assets/trailer/` (58 s, 1080p, mit Ton und Schlusstafel, EN und DE:
  `planet-escape-trailer-en.mp4` / `-de.mp4`). Als ersten Trailer hochladen. Neu schneiden: `tools/trailer/README.md`.
  Ergänzend lohnt sich ein kurzes Gameplay-Video (z. B. per OBS im Vollbild der Desktop-App aufgenommen).
- **Texte**: Kurzbeschreibung (max. 300 Zeichen), Beschreibung, Features, Sprachen (Deutsch + Englisch: Oberfläche und
  Untertitel, kein Voice-Over).
- **Systemanforderungen** (Vorschlag): Windows 10 64-bit / macOS 11 / Ubuntu 22.04, 2-Kern-CPU, 4 GB RAM,
  GPU mit WebGL-Unterstützung nicht nötig (Canvas 2D), 400 MB Speicher.
- **Content Survey**:
  - *KI-generierte Inhalte*: **Ja angeben.** Die Grafiken der ersten Version (Gebäude, Items, Gelände, Titelbild, KORA,
    Story-Bilder, Raumschiff) die Karten-Deko (Vulkane, Krater, Pflanzen, Wracks, Obelisken usw.) und die Achievement-Icons wurden mit OpenArt erzeugt (`tools/process-assets.mjs`). Neuere Bauteil-Sprites sind
    prozedural gezeichnet (`tools/sprites-parts.mjs`). Trailer, Intro und das Menü-Hintergrundvideo sind KI-generiert
    (Standbilder mit Nano Banana Pro, Video mit Ton und Musik mit Veo 3.1, über OpenArt). Im Spiel selbst wird zur
    Laufzeit nichts generiert. Das Formular
    fragt nach vorab erzeugten Inhalten und Guardrails – ehrlich ausfüllen, es wird auf der Shop-Seite angezeigt.
  - Keine Gewalt, keine Käufe im Spiel, keine Datenerhebung.
- **Altersfreigabe**: IARC-Fragebogen in Steamworks (kostenlos, wenige Minuten).
- Die Seite muss mindestens **2 Wochen** als „Coming Soon“ sichtbar sein, bevor das Spiel erscheinen kann.
  Wishlists sammeln: früh veröffentlichen, Link auf der Webseite anzeigen.

### 5. Builds hochladen
1. App ID eintragen: Actions → „Desktop builds“ → Run workflow mit `steam_app_id` (oder lokal
   `echo <APPID> > desktop/steam/steam_appid.txt`).
2. Die drei Artefakte herunterladen und nach `desktop/release/` entpacken (`win-unpacked/`, `mac-universal/`,
   `linux-unpacked/`).
3. `desktop/steam/app_build.vdf` ausfüllen, dann `STEAM_USER=<build-konto> desktop/steam/upload.sh`.
4. In Steamworks den Build auf den Branch `default` setzen, dann **Review** anfordern (Shop-Seite und Build werden
   getrennt geprüft, jeweils ein paar Tage).

### 6. Signieren
- **Windows**: ohne Zertifikat zeigt der Installer SmartScreen-Warnungen. Über Steam gestartet stört das nicht
  (Steam installiert selbst); nur für Installer außerhalb von Steam nötig.
- **macOS** (Apple-Developer-Konto vorhanden): der Workflow signiert und notarisiert die Mac-App automatisch, sobald
  diese **Repository-Secrets** gesetzt sind (GitHub → Settings → Secrets and variables → Actions → *New repository secret*):

  | Secret | Inhalt | Woher |
  |---|---|---|
  | `MAC_CERT_P12_BASE64` | das Zertifikat „Developer ID Application“ als .p12, base64-kodiert | developer.apple.com → Certificates → „+“ → *Developer ID Application*; in der Schlüsselbundverwaltung Zertifikat + privaten Schlüssel als .p12 exportieren, dann `base64 -i cert.p12 \| pbcopy` |
  | `MAC_CERT_PASSWORD` | das Passwort, das du beim .p12-Export vergeben hast | – |
  | `APPLE_ID` | die E-Mail deiner Apple-ID | – |
  | `APPLE_APP_SPECIFIC_PASSWORD` | ein app-spezifisches Passwort | account.apple.com → Anmeldung und Sicherheit → App-spezifische Passwörter |
  | `APPLE_TEAM_ID` | die 10-stellige Team-ID | developer.apple.com → Account → Membership |

  Wichtig: *Developer ID Application*, nicht „Apple Development“ oder „Mac App Distribution“ – nur Developer ID ist für
  Apps außerhalb des Mac App Store. Ohne die Secrets baut der Workflow die Mac-App wie bisher unsigniert.
  Die Entitlements (`desktop/build/entitlements.mac.plist`) erlauben Electron den JIT und Steam das Laden seiner
  Bibliotheken und des Overlays trotz Hardened Runtime.

### 7. Steam Deck
Maus/Tastatur-Spiel mit Touch-Unterstützung – auf dem Deck per Touchscreen spielbar. Für „Verified“ fehlen
Controller-Steuerung und eine Bildschirmtastatur-Anbindung; ein Steam-Input-Layout (Trackpad als Maus) reicht für
„Playable“. Im Linux-Build testen.

## Entscheidungen

- **Web-Version = Demo**: https://planet-escape.dev/ wird mit `PE_EDITION=demo` gebaut (Kapitel 1–3, zwei
  Challenges, kein Freispiel). Am Ende der Demo kann man den Fortschritt als Code oder Datei mitnehmen; die Vollversion
  bietet auf dem Startbildschirm „Demo-Fortschritt übernehmen“ (Sterne, Bestzeiten, Erfolge werden zusammengeführt).
  Sobald die Shop-Seite steht: GitHub → Settings → Secrets and variables → Actions → **Variables** →
  `PE_STORE_URL` = `https://store.steampowered.com/app/<APPID>/` anlegen und den Deploy einmal neu laufen lassen –
  dann zeigen Web-Demo und Steam-Demo den Knopf „Zur Vollversion“ (vorher: „erscheint bald auf Steam“).
- **Preis: 15 €** → in Steamworks als Basispreis **14,99 € / 14,99 USD** eintragen und Valves regionale
  Preisempfehlungen übernehmen. Ein Launch-Rabatt (z. B. 10–20 %) ist üblich und bringt Sichtbarkeit.
- **Demo auf Steam**: eigene App (Steam legt sie zur Haupt-App an), Build mit Edition `demo`. Steam-Demo und
  Vollversion nutzen denselben Spielstand-Ordner, der Fortschritt geht also von selbst mit.
