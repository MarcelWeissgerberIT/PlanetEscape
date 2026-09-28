// Playground examples: complete maps built from game parts, generated on demand (no save files to ship).
// The tools/make-save-*.ts scripts write the same states to saves/ for sharing.
import { CHIP8_PROGRAMS } from './chip8programs';
import { Sim } from './sim';
import type { Building, Dir, GameOptions, GameState } from './types';
import { newGame } from './world';
import { SCREEN_BUDGET_MAX } from './data';

export interface Example {
  id: string;
  title: string;
  icon: string; // building id whose sprite is shown on the card
  de: string; // one-line teaser
  en: string;
  build: () => GameState;
}

const OPTS: GameOptions = { mode: 'playground', mapSize: 'medium', infiniteOre: true, allUnlocked: true, storms: false };

interface Ctx {
  st: GameState;
  sim: Sim;
  core: Building;
  place: (type: Building['type'], x: number, y: number, dir?: Dir) => Building;
  belt: (x: number, y: number, dir: Dir) => Building;
  ore: (x: number, y: number, n?: number) => void;
  tick: (seconds: number) => void;
}

function ctx(seed: number, w: number, h: number, blank = true): Ctx {
  const st = newGame(seed, OPTS, { w, h, blank });
  const sim = new Sim(st);
  sim.creative = true;
  const place = (type: Building['type'], x: number, y: number, dir: Dir = 0): Building => {
    const b = sim.place(type, x, y, dir);
    if (!b) throw new Error(`cannot place ${type} at ${x},${y}: ${sim.placementError(type, x, y)}`);
    return b;
  };
  return {
    st,
    sim,
    core: st.buildings[0],
    place,
    belt: (x, y, dir) => place('conveyor', x, y, dir),
    ore: (x, y, n = 400) => {
      st.terrain[y * st.width + x] = 'iron_ore';
      st.ore[y * st.width + x] = n;
    },
    tick: (seconds) => {
      for (let i = 0; i < Math.round(seconds * 30); i++) sim.tick(1 / 30);
    },
  };
}

function finish(c: Ctx, note: GameState['note'], focus: GameState['focus']): GameState {
  c.st.time = 0;
  c.st.inventory = { iron_plate: 300, copper_plate: 150, copper_wire: 100, machine_part: 40, circuit: 30, glass: 30, quartz: 12 };
  c.st.note = note;
  c.st.focus = focus;
  return c.st;
}

const keyAt = (c: Ctx, x: number, y: number, key: number, pulse = false) => {
  const s = c.place('switch', x, y, 0);
  s.open = false;
  s.threshold = key;
  if (pulse) s.mode = 'pulse';
  return s;
};

/** Terminal, its 64x32 display (2048 lamps, or 8x4 LED matrices) and the 8x22 register lamps above it. */
function terminalWithDisplay(c: Ctx, tx: number, ty: number, matrix = false): Building {
  const term = c.place('terminal', tx, ty);
  if (matrix) for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) c.place('matrix', tx + 3 + x, ty + y);
  else for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) c.place('lamp', tx + 3 + x, ty + y);
  const tr = c.sim.terminalTraceRect(term);
  for (let y = 0; y < tr.h; y++) for (let x = 0; x < tr.w; x++) c.place('lamp', tr.x + x, tr.y + y);
  return term;
}

// ---------- Tic-tac-toe on 9 lamps ----------

export function buildTicTacToe(): GameState {
  const c = ctx(20260927, 80, 80);
  const { st, sim, core, place } = c;
  const ox = core.x + 6, oy = core.y - 5, P = 4;
  for (let r = 0; r < 3; r++) {
    const dx = place('storage', ox - 2, oy + r * P + 1, 1);
    dx.store = { iron_plate: 120 };
    place('conveyor', ox - 1, oy + r * P + 1, 1);
    for (let col = 0; col < 3; col++) {
      const bx = ox + col * P, by = oy + r * P;
      place('tunnel', bx, by + 1, 1);
      place('tunnel', bx + 2, by + 1, 1);
      place('overflow', bx + 3, by + 1, 1);
      const sx = place('switch', bx + 3, by + 2, 2);
      sx.open = false;
      sx.mode = 'pulse';
      sx.recipe = 'iron_plate';
      place('lamp', bx + 3, by + 3, 2);
    }
  }
  for (let col = 0; col < 3; col++) {
    const dO = place('storage', ox + col * P + 1, oy - 2, 2);
    dO.store = { copper_plate: 120 };
    place('conveyor', ox + col * P + 1, oy - 1, 2);
    for (let r = 0; r < 3; r++) {
      const bx = ox + col * P, by = oy + r * P;
      place('conveyor', bx + 1, by + 0, 2);
      place('conveyor', bx + 1, by + 1, 2);
      place('conveyor', bx + 1, by + 2, 2);
      place('overflow', bx + 1, by + 3, 2);
      const so = place('switch', bx + 2, by + 3, 1);
      so.open = false;
      so.mode = 'pulse';
      so.recipe = 'copper_plate';
    }
  }
  c.tick(90); // rows and columns fill up so the first move is instant
  for (const b of st.buildings) if (b.type === 'switch') b.output = {};
  for (const b of st.buildings) if (b.type === 'lamp') sim.clearLamp(b);
  return finish(
    c,
    {
      title: 'Tic Tac Toe',
      de: 'So spielst du:\n• Die 9 LED-Lampen sind das Brett.\n• X = Eisenplatte: tippe den Schalter ÜBER einer Zelle (Eisen-Symbol). Eine Platte fällt hinein, die Lampe leuchtet grau, der Schalter schließt sich wieder.\n• O = Kupferplatte: tippe den Schalter LINKS neben einer Zelle (Kupfer-Symbol). Die Lampe leuchtet orange.\n• Neues Spiel: Lampe antippen → „Löschen“.\nDie Zeilen und Spalten stehen unter Druck aus den Depots, deshalb kommt jeder Zug sofort. Die Warnungen oben rechts sind die absichtlich gestauten Bänder.',
      en: 'How to play:\n• The 9 LED lamps are the board.\n• X = iron plate: tap the switch ABOVE a cell (iron icon). One plate drops in, the lamp lights grey, the switch closes again.\n• O = copper plate: tap the switch LEFT of a cell (copper icon). The lamp lights orange.\n• New game: tap a lamp → “Clear”.\nRows and columns are kept pressurised by the depots, so every move is instant. The warnings top right are the intentionally backed-up belts.',
    },
    { x: ox + 5, y: oy + 5, zoom: 1 },
  );
}

// ---------- KORA Terminal: PONG with block players on a board built from parts ----------

export function buildPongBoard(): GameState {
  const c = ctx(80080, 160, 96);
  const { st, sim, core, place, belt } = c;
  const tx = core.x + 4, ty = core.y - 18;
  const term = terminalWithDisplay(c, tx, ty);
  const osc1 = place('oscillator', tx, ty - 1), osc2 = place('oscillator', tx + 1, ty - 1);
  osc1.clock = 3;
  osc2.clock = 3;
  const RAM_X = tx + 9, RAM_Y = ty - 20, RAM_W = 16, RAM_H = 18;
  for (let x = tx + 2; x <= RAM_X; x++) place('bus', x, ty - 1);
  place('bus', RAM_X, ty - 2);
  for (let y = 0; y < RAM_H; y++) for (let x = 0; x < RAM_W; x++) place('register', RAM_X + x, RAM_Y + y, 1);
  keyAt(c, tx - 1, ty, 1, true);
  keyAt(c, tx - 1, ty + 1, 4, true);
  keyAt(c, tx, ty + 2, 0xc, true);
  keyAt(c, tx + 1, ty + 2, 0xd, true);
  // block players: miners -> splitter -> register (store) + divider(k) -> register side -> burst into the switch side
  const X0 = tx - 30, XEND = tx - 12;
  const lane = (r: number, k: number) => {
    for (let i = 0; i < 4; i++) c.ore(X0 + i, r);
    for (let i = 0; i < 4; i++) place('miner', X0 + i, r, 1);
    for (let x = X0 + 4; x < X0 + 8; x++) belt(x, r, 1);
    place('splitter', X0 + 8, r, 1);
    for (let x = X0 + 9; x < XEND - 1; x++) belt(x, r, 1);
    const reg = place('register', XEND - 1, r, 1);
    reg.recipe = 'iron_plate';
    belt(XEND, r, 1);
    for (let x = X0 + 8; x < X0 + 12; x++) belt(x, r + 1, 1);
    const d = place('divider', X0 + 12, r + 1, 1);
    d.value = k;
    for (let x = X0 + 13; x < XEND - 1; x++) belt(x, r + 1, 1);
    belt(XEND - 1, r + 1, 0);
  };
  lane(ty - 6, 2);
  lane(ty + 1, 3);
  lane(ty + 5, 2);
  lane(ty + 10, 3);
  for (let x = XEND + 1; x < tx - 2; x++) belt(x, ty - 6, 1);
  for (let y = ty - 6; y < ty; y++) belt(tx - 2, y, 2);
  belt(tx - 2, ty, 1);
  for (let x = XEND + 1; x <= tx - 2; x++) belt(x, ty + 1, 1);
  for (let x = XEND + 1; x < tx - 1; x++) belt(x, ty + 5, 1);
  for (let y = ty + 5; y > ty + 2; y--) belt(tx - 1, y, 0);
  belt(tx - 1, ty + 2, 1);
  for (let x = XEND + 1; x < tx + 2; x++) belt(x, ty + 10, 1);
  for (let y = ty + 10; y > ty + 2; y--) belt(tx + 2, y, 0);
  belt(tx + 2, ty + 2, 3);
  for (let i = 0; i < 12; i++) place('solar', X0 + i, ty + 14);
  sim.setProgram(term, CHIP8_PROGRAMS[0].source);
  term.run = true;
  c.tick(2);
  sim.resetTerminal(term);
  st.options.infiniteOre = true;
  return finish(
    c,
    {
      title: 'KORA Terminal · PONG',
      de: 'Die CPU ist eine echte Platine aus Bauteilen: Der Chip in der Mitte (Terminal) trägt nur den 512-Byte-Interpreter. Sein Arbeitsspeicher ist das Feld aus 16×18 Speicherzellen oben rechts, jede Zelle ist ein Byte (0 bis 255 Teile), Adresse = Position in Lesereihenfolge ab 0x200. Die orange markierte Zelle ist der Programmzähler, die cyanfarbene das Indexregister I. Die CPU liest und schreibt die Zellen direkt. Kippe per Band ein Teil in eine Zelle, und das Programm ändert sich; ein Impuls von der Seite leert sie. Zwei Oszillatoren mit je 3 Quarzen oben am Chip geben 600 Hz, die Kupfer-Leiterbahn verbindet alles; die grüne Fläche zeigt, was verdrahtet ist.\n\nÜber dem Chip zeigen 8×22 Lampen bei jedem Takt PC, Opcode, I und die Register V0…VF als Bits. Tippe den Chip an: Im Panel stehen PC, der Befehl in Assembler und alle Register. „Trace 2 Hz“ bremst auf zwei Befehle pro Sekunde, „Schritt“ führt bei Pause einen Befehl aus, dann wandert die orange Markierung Zelle für Zelle durchs RAM.\n\nLinks: vier Bausteinspieler, je eine Schaltung pro Taste. Verteiler, Speicherzelle und Dividierer erzeugen aus Erz einen Schub Teile, der Randschalter hält die Taste pro Teil eine Viertelsekunde, der Schläger fährt eine ganze Strecke. Das Terminal führt PONG aus; KORA spielt jede Seite, die niemand drückt. Steuerung: Tastenfeld, Tastatur 1/Q und 4/R, oder die vier Randschalter (links 1 und 4, unten C und D). Die 2048 Lampen rechts sind das Display.',
      en: 'The CPU is a real board made of parts: the chip in the middle (terminal) carries only the 512-byte interpreter. Its working memory is the 16×18 field of registers top right; every cell is one byte (0 to 255 items), address = position in reading order from 0x200. The cell outlined in orange is the program counter, the cyan one the index register I. The CPU reads and writes these cells directly. Drop an item into a cell by belt and the program changes; a pulse from the side empties it. Two oscillators with 3 crystals each on the chip’s top edge give 600 Hz, the copper trace wires everything together; the green board shows what is connected.\n\nAbove the chip 8×22 lamps show PC, opcode, I and the registers V0…VF as bits every tick. Tap the chip: the panel lists PC, the instruction in assembler and all registers. “Trace 2 Hz” slows it to two instructions per second, “Step” executes one instruction while paused, and the orange marker walks through the RAM cell by cell.\n\nLeft: four block players, one circuit per key. Splitter, register and divider turn ore into a burst of items, the rim switch holds the key a quarter second per item, and the paddle travels a whole stroke. The terminal runs PONG; KORA plays any side nobody presses. Controls: keypad, keyboard 1/Q and 4/R, or the four rim switches (left 1 and 4, bottom C and D). The 2048 lamps on the right are the display.',
    },
    { x: tx + 6, y: ty - 6, zoom: 0.5 },
  );
}

// ---------- PONG on 32 LED matrices instead of 2048 lamps ----------

export function buildPongMatrix(): GameState {
  const c = ctx(80086, 120, 96);
  const { sim, core, place } = c;
  const tx = core.x - 6, ty = core.y - 14;
  const term = terminalWithDisplay(c, tx, ty, true);
  place('oscillator', tx, ty - 1).clock = 3;
  place('oscillator', tx + 1, ty - 1).clock = 3;
  const RAM_X = tx + 12, RAM_Y = ty - 8, RAM_W = 16, RAM_H = 18;
  for (let x = tx + 2; x < RAM_X; x++) place('bus', x, ty - 1); // the last trace touches the RAM field's left edge
  for (let y = 0; y < RAM_H; y++) for (let x = 0; x < RAM_W; x++) place('register', RAM_X + x, RAM_Y + y, 1);
  keyAt(c, tx - 1, ty, 1);
  keyAt(c, tx - 1, ty + 1, 4);
  keyAt(c, tx, ty + 2, 0xc);
  keyAt(c, tx + 1, ty + 2, 0xd);
  place('solar', tx - 4, ty + 5);
  sim.setProgram(term, CHIP8_PROGRAMS[0].source);
  term.run = true;
  c.tick(2);
  sim.resetTerminal(term);
  return finish(
    c,
    {
      title: 'PONG · LED-Matrix',
      de: 'Dasselbe PONG, aber das Display sind 32 LED-Matrizen statt 2048 Lampen: Jede Matrix ist eine Kachel mit 8×8 RGB-LEDs, 16 Millionen Farben pro Pixel. Die oberen linken 8×4 Kacheln des Display-Bereichs rechts vom Chip zeigen je einen 8×8-Block des 64×32-Bildschirms.\n\nEine Matrix kannst du auch von Hand bemalen (antippen → Pixel und Farbe wählen) oder per Band füllen: Jedes ankommende Teil zündet den nächsten dunklen Pixel in seiner Farbe. Tasten: Tastatur 1/Q und 4/R oder die vier Randschalter; KORA spielt jede Seite, die niemand drückt.',
      en: 'The same PONG, but the display is 32 LED matrices instead of 2048 lamps: each matrix is one tile with 8×8 RGB LEDs, 16 million colours per pixel. The top-left 8×4 tiles of the display area right of the chip each show an 8×8 block of the 64×32 screen.\n\nYou can also paint a matrix by hand (tap → pick pixel and colour) or fill it by belt: every arriving item lights the next dark pixel in its colour. Keys: keyboard 1/Q and 4/R or the four rim switches; KORA plays any side nobody presses.',
    },
    { x: tx + 8, y: ty + 2, zoom: 1.1 },
  );
}

// ---------- KORA TRAILER: a 30 s demo of the game, computed by the chip, on 32 LED matrices ----------

export function buildTrailer(): GameState {
  const c = ctx(80088, 120, 96);
  const { sim, core, place } = c;
  const tx = core.x - 6, ty = core.y - 14;
  const term = terminalWithDisplay(c, tx, ty, true);
  place('oscillator', tx, ty - 1).turbo = 3; // 6 kHz: the demo redraws sprites on several planes per frame
  place('oscillator', tx + 1, ty - 1).clock = 3;
  const RAM_X = tx + 12, RAM_Y = ty - 8, RAM_W = 32, RAM_H = 44; // 1408 cells, the demo needs about 1300 bytes
  for (let x = tx + 2; x < RAM_X; x++) place('bus', x, ty - 1);
  for (let y = 0; y < RAM_H; y++) for (let x = 0; x < RAM_W; x++) place('register', RAM_X + x, RAM_Y + y, 1);
  place('solar', tx - 4, ty + 5);
  place('solar', tx - 3, ty + 5);
  sim.setProgram(term, CHIP8_PROGRAMS.find((p) => p.id === 'trailer')!.source);
  term.run = true;
  c.tick(1);
  sim.resetTerminal(term);
  return finish(
    c,
    {
      title: 'KORA TRAILER',
      de: 'Ein 30-Sekunden-Trailer des Spiels, aber kein Video: Der Chip rechnet jedes Bild selbst. Fünf Szenen in Assembler, Titel unter Sternen, die gestrandete Rakete auf dem Planeten, die Fabrik mit laufendem Band, der Schiffsbau auf der Rampe, der Start, dann von vorn.\n\nAlles, was du siehst, sind Sprites, die per XOR auf vier Farbebenen gezeichnet werden. Rechts liegt das Programm als Zahlen im 32×44-Feld aus Speicherzellen (etwa 1300 Byte: Code, Zeichensatz, Sprites), die orange Markierung ist der Programmzähler, die Lampen über dem Chip zeigen die Register. Zwei Oszillatoren geben 6,3 kHz, die Wand sind 32 LED-Matrizen à 8×8. Tippe den Chip an und drück „Trace 2 Hz“: dann siehst du, wie jeder Buchstabe aus einzelnen Befehlen entsteht. Im Programm-Editor kannst du den Trailer umschreiben, jede Szene ist ein Block.',
      en: 'A 30 second trailer of the game, but no video: the chip computes every frame itself. Five scenes in assembly, the title under stars, the stranded ship on the planet, the factory with a running belt, the ship growing on the pad, the launch, then again.\n\nEverything you see is sprites XOR-drawn on four colour planes. On the right the program sits as numbers in the 32×44 field of registers (about 1300 bytes: code, font, sprites), the orange marker is the program counter, the lamps above the chip show the registers. Two oscillators give 6.3 kHz, the wall is 32 LED matrices of 8×8. Tap the chip and press “Trace 2 Hz”: you watch every letter appear instruction by instruction. In the program editor you can rewrite the trailer, every scene is one block.',
    },
    { x: tx + 10, y: ty + 4, zoom: 0.8 },
  );
}

// ---------- Video wall: a receiver and 16x8 LED matrices ----------

export function buildVideoWall(): GameState {
  const c = ctx(80087, 80, 60);
  const { core, place } = c;
  const x0 = core.x - 8, y0 = core.y - 14;
  const rx = place('screen', x0, y0);
  rx.value = 2; // 16x8 matrices of 16x16 = 256x128 px
  rx.mode = 'scan';
  rx.budget = SCREEN_BUDGET_MAX;
  rx.recipe = 'copper_wire';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) place('matrix', x0 + 2 + x, y0 + y).value = 16;
  // the wall's wiring: 8 bus lanes in the column between receiver and wall, 8 registers as frame buffer (32768 px)
  // above them, one turbo oscillator (6 kHz) touching the speakers
  for (let y = 0; y < 8; y++) place('bus', x0 + 1, y0 + y);
  for (let x = 0; x < 8; x++) place('register', x0 + 1 + x, y0 - 1, 1);
  place('speaker', x0, y0 + 1);
  place('speaker', x0, y0 + 2);
  place('oscillator', x0, y0 + 3).turbo = 3;
  place('solar', x0, y0 + 4);
  place('solar', x0, y0 + 5);
  place('solar', x0, y0 + 6);
  // phosphor supply: three miners on copper ore feed the receiver from above
  for (let i = 0; i < 3; i++) {
    c.st.terrain[(y0 - 3) * c.st.width + x0 - 6 + i] = 'copper_ore';
    c.st.ore[(y0 - 3) * c.st.width + x0 - 6 + i] = 400;
  }
  for (let i = 0; i < 3; i++) place('miner', x0 - 6 + i, y0 - 3, 1);
  for (let x = x0 - 3; x < x0; x++) c.belt(x, y0 - 3, 1);
  c.belt(x0, y0 - 3, 2);
  c.belt(x0, y0 - 2, 2);
  c.belt(x0, y0 - 1, 2);
  // the sampling made visible: colour samples leave the receiver to the left, run down a belt and through a row of
  // pass lamps (the video as a stream of parts), then into a depot
  c.belt(x0 - 1, y0, 2);
  for (let y = y0 + 1; y < y0 + 9; y++) c.belt(x0 - 1, y, 2);
  c.belt(x0 - 1, y0 + 9, 1);
  for (let x = 0; x < 14; x++) {
    const l = place('lamp', x0 + x, y0 + 9, 1);
    l.mode = 'pass';
  }
  place('storage', x0 + 14, y0 + 9, 1);
  // a welcome picture until a stream arrives: "PE" in two colours
  const glyph = ['11101110', '10101010', '11101110', '10001010', '10001010'];
  const mid = c.st.buildings.filter((b) => b.type === 'matrix');
  for (const m of mid) {
    const mx = m.x - (x0 + 2), my = m.y - y0;
    if ((mx === 7 || mx === 8) && my === 3) {
      const px = new Array<number>(256).fill(0x0b1a2a);
      glyph.forEach((row, ry) => [...row].forEach((ch, cx) => { if (ch === '1') for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) px[(ry * 2 + 3 + dy) * 16 + cx * 2 + dx] = mx === 7 ? 0x22d3ee : 0xf0a050; }));
      m.px = px;
    }
  }
  return finish(
    c,
    {
      title: 'Videowand · Video wall',
      de: 'Ein Video-Empfänger und 128 LED-Matrizen mit je 16×16 LEDs: 256×128 Pixel in 16 Millionen Farben. Tippe den Empfänger links an und wähle die Quelle:\n• „Tab / Bildschirm teilen“: Öffne YouTube in einem zweiten Tab, starte das Video, teile diesen Tab, und es läuft auf der Wand (Desktop-Browser).\n• „Kamera“: Du selbst, in LED.\n• „Videodatei“: eine Datei von diesem Gerät.\nTipp für ein scharfes Bild: YouTube vor dem Teilen in den Vollbildmodus (Taste F) schalten und im Panel den Zuschnitt nutzen. Die Wand lässt sich bis 32×16 Matrizen (512×256 px) vergrößern: im Panel die Größe wählen und Matrizen ergänzen (Blaupausen → Videowand). Jede Matrix kannst du auch einzeln antippen und bemalen.\n\nTon: Die zwei Lautsprecher unter dem Empfänger spielen den Ton, wenn du beim Teilen „Tab-Audio teilen“ anhakst (Lautstärke am Lautsprecher). Abtastung: Links vom Empfänger läuft ein Band. Der Empfänger legt viermal pro Sekunde ein Teil in der Farbe des gerade abgetasteten Pixels darauf (rote Markierung wandert über die Wand), die Durchlass-Lampen unten flackern in den Videofarben, das Depot sammelt alles. Im Panel kannst du auf Mittelwert oder Bildmitte umstellen. Der Stream bleibt auf deinem Gerät.\n\nDie Wand ist eine Maschine: Der Empfänger verbraucht Leuchtstoff, jedes gelieferte Teil ist eine Million Pixel. Drei Bohrer auf Kupfererz oben links liefern nach. Die acht Leiterbahnen zwischen Empfänger und Wand sind die Bahnen, der Turbo-Oszillator der Takt: Bahnen × Takt × 64 ist die Bandbreite in Pixeln pro Sekunde, zu wenig davon und die Wand baut das Bild sichtbar zeilenweise auf. Die acht Speicherzellen darüber sind der Bildspeicher, je 4096 Pixel; fehlen welche, bleiben die unteren Zeilen dunkel. Nur Matrizen, die an dieser Platine hängen, leuchten. Alles steht im Panel des Empfängers.',
      en: 'One video receiver and 128 LED matrices of 16×16 LEDs each: 256×128 pixels in 16 million colours. Tap the receiver on the left and pick the source:\n• “Share tab / screen”: open YouTube in a second tab, start the video, share that tab, and it plays on the wall (desktop browsers).\n• “Camera”: you, in LEDs.\n• “Video file”: a file from this device.\nFor a sharp picture put YouTube into full screen (key F) before sharing and use the crop setting in the panel. The wall grows to 32×16 matrices (512×256 px): pick the size in the panel and add matrices (blueprints → video wall). Every matrix can also be tapped and painted by hand.\n\nSound: the two speakers under the receiver play the audio when you tick “Share tab audio” while sharing (volume on the speaker). Sampling: a belt leaves the receiver to the left. Four times a second it drops an item in the colour of the pixel being sampled (the red marker walks across the wall), the pass lamps at the bottom flicker in the video’s colours, the depot collects everything. Switch to Average or Centre in the panel. The stream stays on your device.\n\nThe wall is a machine: the receiver burns phosphor, every delivered item is a million pixels. Three miners on copper ore top left keep it supplied. The eight bus traces between receiver and wall are the lanes, the turbo oscillator the clock: lanes × clock × 64 is the bandwidth in pixels per second; too little and the wall visibly builds the picture row by row. The eight registers above are the frame buffer, 4096 pixels each; with fewer, the bottom rows stay dark. Only matrices wired to this board light up. The receiver’s panel shows all of it.',
    },
    { x: x0 + 9, y: y0 + 4, zoom: 0.9 },
  );
}

// ---------- KORA RAY: first-person maze, turbo clock ----------

export function buildRay(): GameState {
  const c = ctx(80081, 160, 128);
  const { st, sim, core, place } = c;
  const tx = core.x + 4, ty = core.y - 18;
  const term = terminalWithDisplay(c, tx, ty);
  const OSC = 10;
  for (let i = 0; i < OSC; i++) place('oscillator', tx + i, ty - 1).turbo = 3;
  const RAM_X = tx + OSC + 1, RAM_Y = ty - 34, RAM_W = 32, RAM_H = 32;
  place('bus', tx + OSC, ty - 1);
  place('bus', tx + OSC, ty - 2);
  place('bus', tx + OSC, ty - 3);
  for (let y = 0; y < RAM_H; y++) for (let x = 0; x < RAM_W; x++) place('register', RAM_X + x, RAM_Y + y, 1);
  keyAt(c, tx - 1, ty, 5);
  keyAt(c, tx - 1, ty + 1, 7);
  keyAt(c, tx, ty + 2, 8);
  keyAt(c, tx + 1, ty + 2, 9);
  keyAt(c, tx + 2, ty, 6);
  for (let i = 0; i < 3; i++) place('solar', tx - 6 + i, ty + 6);
  sim.setProgram(term, CHIP8_PROGRAMS.find((p) => p.id === 'ray')!.source);
  term.run = true;
  c.tick(2);
  sim.resetTerminal(term);
  st.options.infiniteOre = true;
  return finish(
    c,
    {
      title: 'KORA RAY · Ego-Labyrinth',
      de: 'Ein Doom-artiger Gang in 64×32, gerechnet von der Platine aus Bauteilen: Der Chip wirft pro Bild 32 Strahlen durch ein 16×16-Labyrinth und zeichnet die Wände als Streifen, nahe Wände voll, ferne gepunktet, die Ausgangstür gestrichelt. Das kostet rund 4500 Befehle pro Bild, deshalb der Turbo: Die zehn Oszillatoren oben am Chip tragen je drei Glaskristalle, jeder 2 kHz, zusammen 60 kHz, also etwa 10 Bilder pro Sekunde. Der Speicher ist das 32×32-Feld aus Speicherzellen rechts oben (1024 Byte, das Programm braucht 1008): Code, Richtungstabelle, Sprites und das Labyrinth selbst liegen dort als Zahlen. Orange = Programmzähler, cyan = Indexregister.\n\nSteuerung: Chip antippen, dann Tastatur W (vor), S (zurück), A/D (drehen), E (feuern), oder die fünf Randschalter antippen (links W und A, unten S und D, rechts E). Ein Schalter bleibt gedrückt, bis du ihn wieder antippst. Lauf in die gestrichelte Tür, dann piept es, die Levelzahl erscheint und du startest neu.\n\nProbier: Zelle des Labyrinths per Band ändern (1 = Wand, 0 = frei, 2 = Tür), oder „Trace 2 Hz“ drücken und zusehen, wie der Programmzähler durch die Strahlenschleife läuft.',
      en: 'A Doom-style corridor in 64×32, computed by the board built from parts: each frame the chip casts 32 rays through a 16×16 maze and draws the walls as stripes, near walls solid, far walls dotted, the exit door dashed. That costs about 4500 instructions per frame, hence the turbo: the ten oscillators on the chip’s top edge hold three glass crystals each, 2 kHz apiece, 60 kHz in total, roughly 10 frames per second. The memory is the 32×32 field of registers top right (1024 bytes, the program needs 1008): code, direction table, sprites and the maze itself sit there as numbers. Orange = program counter, cyan = index register.\n\nControls: tap the chip, then keyboard W (forward), S (back), A/D (turn), E (fire), or tap the five rim switches (left W and A, bottom S and D, right E). A switch stays pressed until you tap it again. Walk into the dashed door: a beep, the level number, and you start again.\n\nTry: change a maze cell by belt (1 = wall, 0 = free, 2 = door), or press “Trace 2 Hz” and watch the program counter run through the ray loop.',
    },
    { x: tx + 20, y: ty - 3, zoom: 0.4 },
  );
}

// ---------- KORA BLOCKS: 2D block world in colour, the map lives in the RAM cells ----------

export function buildBlocks(): GameState {
  const c = ctx(80082, 160, 140);
  const { st, sim, core, place } = c;
  const tx = core.x + 4, ty = core.y - 18;
  const term = terminalWithDisplay(c, tx, ty, true);
  for (const m of st.buildings) if (m.type === 'matrix') m.value = 16; // 8x4 matrices of 16x16 = the 128x64 hi-res screen
  const OSC = 4;
  for (let i = 0; i < OSC; i++) place('oscillator', tx + i, ty - 1).turbo = 3;
  const RAM_X = tx + 11, RAM_Y = ty - 51, RAM_W = 64, RAM_H = 50; // 3200 cells for about 3.1 KB of program; the field ends right above the bus
  for (let x = tx + OSC; x <= tx + 10; x++) place('bus', x, ty - 1);
  place('bus', tx + 10, ty - 2);
  place('bus', tx + 10, ty - 3);
  for (let y = 0; y < RAM_H; y++) for (let x = 0; x < RAM_W; x++) place('register', RAM_X + x, RAM_Y + y, 1);
  keyAt(c, tx - 1, ty, 5); // W jump
  keyAt(c, tx - 1, ty + 1, 7); // A
  keyAt(c, tx, ty + 2, 8); // S dig below
  keyAt(c, tx + 1, ty + 2, 9); // D
  keyAt(c, tx + 2, ty, 6); // E dig ahead
  keyAt(c, tx + 2, ty + 1, 4); // Q place
  for (let i = 0; i < 2; i++) place('solar', tx - 6 + i, ty + 6);
  sim.setProgram(term, CHIP8_PROGRAMS.find((p) => p.id === 'blockshd')!.source);
  term.run = true;
  c.tick(1);
  sim.resetTerminal(term);
  st.options.infiniteOre = true;
  return finish(
    c,
    {
      title: 'KORA BLOCKS HD · Blockwelt',
      de: 'Eine 2D-Blockwelt in Farbe, gerechnet von der Platine, jetzt in 128×64: Der Chip läuft im Hi-Res-Modus (HIGH-Befehl) und zeichnet jede Weltzelle als 2×2-Block mit Zweifarb-Textur, Gras mit dunklem Halm, Stein mit hellem Sprenkel, Erz mit Glanz, dazu blauer Himmel mit weißen Wolken und ein Spieler mit Kopf und Körper. Die Wand sind 32 LED-Matrizen à 16×16, 15 Farben aus vier Bildebenen (PLANE-Befehl).\n\nDas Krasse: Die Welt liegt als Zahlen im RAM. Das Feld aus 64×50 Speicherzellen oben rechts ist der Speicher, und die Zeilen 2 bis 33 SIND die Karte: 0 = Luft, 2 = Erde, 3 = Stein, 4 = Gras, 5 = Holz, 6 = Blätter, 9 = Erz. Wer eine Zelle per Band verändert, verändert die Welt. Beim Start siehst du, wie die CPU die Landschaft Spalte für Spalte in den Speicher schreibt und dabei den Bildschirm füllt. Vier Turbo-Oszillatoren geben 24 kHz.\n\nSteuerung (Chip antippen oder die sechs Randschalter): A/D laufen, W springen, S nach unten graben, E vor dir graben, Q den getragenen Block vor dir setzen. Oben links zählt die Anzeige deine Blöcke. Gegrabenes Erz leuchtet orange.',
      en: 'A 2D block world in colour, computed by the board, now in 128×64: the chip runs in hi-res mode (HIGH instruction) and draws every world cell as a 2×2 block with a two-colour texture, grass with a dark blade, stone with a light speck, ore with a glint, plus a blue sky with white clouds and a player with head and body. The wall is 32 LED matrices of 16×16, 15 colours from four picture planes (PLANE instruction).\n\nThe wild part: the world sits in RAM as numbers. The 64×50 field of registers top right is the memory, and rows 2 to 33 ARE the map: 0 = air, 2 = dirt, 3 = stone, 4 = grass, 5 = wood, 6 = leaves, 9 = ore. Change a cell by belt and you change the world. At start you watch the CPU write the landscape into memory column by column while it fills the screen. Four turbo oscillators give 24 kHz.\n\nControls (tap the chip or the six rim switches): A/D walk, W jump, S dig below, E dig ahead, Q place the carried block ahead. Top left counts your blocks. Dug ore glows orange.',
    },
    { x: tx + 26, y: ty - 6, zoom: 0.36 },
  );
}

// ---------- Binary counter: a chain of dividers halves the item stream at every stage ----------

export function buildBinaryCounter(): GameState {
  const c = ctx(80083, 80, 60);
  const { core, place, belt } = c;
  const x0 = core.x - 20, y0 = core.y - 12;
  for (let i = 0; i < 3; i++) c.ore(x0 + i, y0);
  for (let i = 0; i < 3; i++) place('miner', x0 + i, y0, 1);
  belt(x0 + 3, y0, 1);
  // 8 stages, one per row going down: lamp (pass) shows the bit, divider(2) halves the stream for the next stage
  let x = x0 + 4, y = y0;
  for (let bit = 0; bit < 8; bit++) {
    const lamp = place('lamp', x, y, 2);
    lamp.mode = 'pass';
    lamp.recipe = null;
    belt(x, y + 1, 2);
    const d = place('divider', x, y + 2, 2);
    d.value = 2;
    belt(x, y + 3, 2);
    y += 4;
  }
  // the remaining stream (1/256) runs into a depot
  place('storage', x, y, 2);
  // a second, faster readout: eight lamps in a row in front of a register fed by the miners' side stream
  for (let i = 0; i < 4; i++) place('solar', x0 + i, y0 + 3);
  x = x0 + 8;
  return finish(
    c,
    {
      title: 'Binärzähler · Binary counter',
      de: 'Ein Zähler ohne CPU, nur aus Bändern: Drei Bohrer schieben Erz auf ein Band. Jede Stufe besteht aus einer Lampe im Durchlass-Modus und einem Dividierer mit Faktor 2. Die Lampe blinkt bei jedem Teil, der Dividierer lässt nur jedes zweite Teil weiter. Also blinkt die zweite Lampe halb so oft wie die erste, die dritte ein Viertel so oft… acht Stufen sind ein 8-Bit-Ripple-Counter, die unterste Lampe blinkt einmal pro 256 Teile.\n\nProbier: Setze den Faktor eines Dividierers auf 3 oder 5 (antippen), dann zählt die Kette in gemischter Basis. Oder hänge nach der letzten Stufe eine Speicherzelle an und lies ab, wie viele Teile durchkamen.',
      en: 'A counter without a CPU, belts only: three miners push ore onto a belt. Each stage is a lamp in pass mode and a divider with factor 2. The lamp blinks for every item, the divider passes only every second one. So the second lamp blinks half as often as the first, the third a quarter as often… eight stages are an 8-bit ripple counter, the bottom lamp blinks once per 256 items.\n\nTry: set a divider’s factor to 3 or 5 (tap it) and the chain counts in a mixed base. Or hang a register behind the last stage and read off how many items got through.',
    },
    { x: x0 + 6, y: y0 + 14, zoom: 0.9 },
  );
}

// ---------- Running light: items circle a belt ring, lamps in pass mode light up as they pass ----------

export function buildRunningLight(): GameState {
  const c = ctx(80084, 80, 60);
  const { core, place, belt } = c;
  const x0 = core.x - 14, y0 = core.y - 16, W = 24, H = 10; // the ring stays clear of the core
  // clockwise ring: top row east, right column south, bottom row west, left column north; every third tile a lamp
  const ring: { x: number; y: number; dir: Dir }[] = [];
  for (let x = x0; x < x0 + W; x++) ring.push({ x, y: y0, dir: 1 });
  for (let y = y0; y < y0 + H; y++) ring.push({ x: x0 + W, y, dir: 2 });
  for (let x = x0 + W; x > x0; x--) ring.push({ x, y: y0 + H, dir: 3 });
  for (let y = y0 + H; y > y0; y--) ring.push({ x: x0, y, dir: 0 });
  ring.forEach((t, i) => {
    const corner = (t.x === x0 || t.x === x0 + W) && (t.y === y0 || t.y === y0 + H);
    if (i % 3 === 1 && !corner) {
      const l = place('lamp', t.x, t.y, t.dir);
      l.mode = 'pass';
    } else belt(t.x, t.y, t.dir);
  });
  // injector: a depot of copper wire feeds the top row through a switch (tap = one item), a second depot with glass
  const d1 = place('storage', x0 + 6, y0 - 3, 2);
  d1.store = { copper_wire: 40 };
  belt(x0 + 6, y0 - 2, 2);
  const s1 = place('switch', x0 + 6, y0 - 1, 2);
  s1.open = false;
  s1.mode = 'pulse';
  const d2 = place('storage', x0 + 12, y0 - 3, 2);
  d2.store = { glass: 40 };
  belt(x0 + 12, y0 - 2, 2);
  const s2 = place('switch', x0 + 12, y0 - 1, 2);
  s2.open = false;
  s2.mode = 'pulse';
  // seed a few items so it runs at once
  for (let i = 0; i < 4; i++) {
    s1.open = true;
    c.tick(0.4);
    s1.open = false;
    c.tick(2.5);
  }
  s2.open = true;
  c.tick(0.4);
  s2.open = false;
  for (const b of c.st.buildings) if (b.type === 'switch') b.output = {};
  for (let i = 0; i < 2; i++) place('solar', x0 + i, y0 + H + 3);
  return finish(
    c,
    {
      title: 'Lauflicht · Running light',
      de: 'Ein geschlossener Bandring, in den jede dritte Kachel eine Lampe im Durchlass-Modus ist. Teile kreisen endlos, und jede Lampe leuchtet in der Farbe des Teils, das gerade durch sie hindurchläuft: ein Lauflicht ohne einen einzigen Schaltkreis. Kupferdraht leuchtet orange, Glas hellblau.\n\nTippe die beiden Schalter oben an: Jeder Tipp schickt ein weiteres Teil aus dem Depot in den Ring. Je mehr Teile, desto dichter das Muster; mit Filtern auf den Lampen (antippen → Teil wählen) reagieren einzelne Lampen nur auf eine Farbe. Ein Mischer statt eines Bandes und du hast ein Muster mit Rhythmus.',
      en: 'A closed belt ring where every third tile is a lamp in pass mode. Items circle forever and every lamp lights in the colour of the item running through it: a running light without a single circuit. Copper wire glows orange, glass light blue.\n\nTap the two switches at the top: each tap sends another item from the depot into the ring. More items, denser pattern; with filters on the lamps (tap → pick an item) single lamps react to one colour only. Replace a belt with a mixer and the pattern gets a rhythm.',
    },
    { x: x0 + W / 2, y: y0 + H / 2, zoom: 0.9 },
  );
}

// ---------- Adder: two registers, an adder, a sum register with a binary lamp readout ----------

export function buildAdder(): GameState {
  const c = ctx(80085, 80, 60);
  const { core, place, belt } = c;
  const x0 = core.x - 14, y0 = core.y - 6;
  const feed = (y: number, item: 'iron_plate' | 'copper_plate') => {
    const d = place('storage', x0, y, 1);
    d.store = { [item]: 200 };
    const s = place('switch', x0 + 1, y, 1);
    s.open = false;
    s.mode = 'pulse';
    belt(x0 + 2, y, 1);
    return place('register', x0 + 3, y, 1);
  };
  const regA = feed(y0, 'iron_plate');
  const regB = feed(y0 + 4, 'copper_plate');
  regA.recipe = 'iron_plate';
  regB.recipe = 'copper_plate';
  // "=": depot -> switch (one wire per tap) -> multiplier x2 -> splitter: one pulse up into A's side, one down into B's side
  const dE = place('storage', x0, y0 + 2, 1);
  dE.store = { copper_wire: 200 };
  const sE = place('switch', x0 + 1, y0 + 2, 1);
  sE.open = false;
  sE.mode = 'pulse';
  place('multiplier', x0 + 2, y0 + 2, 1).value = 2;
  place('splitter', x0 + 3, y0 + 2, 1);
  belt(x0 + 3, y0 + 1, 0);
  belt(x0 + 3, y0 + 3, 2);
  // both registers empty into the adder from its two sides, the sum runs into register S with 8 lamps in front
  for (let x = x0 + 4; x < x0 + 7; x++) belt(x, y0, 1);
  belt(x0 + 7, y0, 2);
  belt(x0 + 7, y0 + 1, 2);
  for (let x = x0 + 4; x < x0 + 7; x++) belt(x, y0 + 4, 1);
  belt(x0 + 7, y0 + 4, 0);
  belt(x0 + 7, y0 + 3, 0);
  place('adder', x0 + 7, y0 + 2, 1);
  belt(x0 + 8, y0 + 2, 1);
  belt(x0 + 9, y0 + 2, 1);
  const regS = place('register', x0 + 10, y0 + 2, 1);
  regS.recipe = 'iron_plate';
  for (let i = 0; i < 8; i++) place('lamp', x0 + 11 + i, y0 + 2, 1);
  place('solar', x0, y0 + 7);
  return finish(
    c,
    {
      title: 'Addierwerk · Adder',
      de: 'Rechnen mit Teilen: Eine Zahl ist eine Anzahl. Tippe den oberen Schalter dreimal (jeder Tipp lässt eine Eisenplatte in Speicherzelle A), den unteren zweimal (Kupfer in B). Dann der mittlere Schalter „=“: Ein Kupferdraht wird vom Multiplikator verdoppelt, der Verteiler schickt je einen Impuls in die Seite von A und B, beide geben ihren Inhalt ab, der Addierer lässt alles durch, und Speicherzelle S zählt die Summe: 5. Die acht Lampen vor S zeigen die Zahl binär, 00000101.\n\nS leeren: S antippen → „Löschen“. Tausch den Addierer gegen einen Subtrahierer (A von oben = Minuend, B von unten = Subtrahend) und du hast eine Differenz; mit einem Multiplikator dahinter ein Produkt.',
      en: 'Arithmetic with items: a number is a count. Tap the top switch three times (each tap drops one iron plate into register A), the bottom one twice (copper into B). Then the middle switch “=”: one copper wire is doubled by the multiplier, the splitter sends one pulse into the side of A and one into B, both release their content, the adder passes everything, and register S counts the sum: 5. The eight lamps in front of S show it in binary, 00000101.\n\nClear S: tap S → “Clear”. Swap the adder for a subtractor (A from above = minuend, B from below = subtrahend) and you get a difference; a multiplier behind it gives a product.',
    },
    { x: x0 + 9, y: y0 + 2, zoom: 1 },
  );
}

export const EXAMPLES: Example[] = [
  { id: 'pong', title: 'KORA Terminal · PONG', icon: 'terminal', de: 'CPU aus Bauteilen, RAM aus Speicherzellen, Bausteinspieler drücken die Tasten.', en: 'CPU from parts, RAM from registers, block players press the keys.', build: buildPongBoard },
  { id: 'pongmini', title: 'PONG · LED-Matrix', icon: 'matrix', de: 'Dasselbe Spiel auf 32 LED-Matrizen statt 2048 Lampen.', en: 'The same game on 32 LED matrices instead of 2048 lamps.', build: buildPongMatrix },
  { id: 'trailer', title: 'KORA TRAILER', icon: 'terminal', de: '30-Sekunden-Trailer, vom Chip in Assembler gerechnet, auf 32 LED-Matrizen.', en: 'A 30 second trailer computed by the chip in assembly, on 32 LED matrices.', build: buildTrailer },
  { id: 'video', title: 'Videowand · Video wall', icon: 'screen', de: 'YouTube-Tab, Kamera oder Datei auf 128 LED-Matrizen, mit Ton und Abtast-Band.', en: 'A YouTube tab, camera or file on 128 LED matrices, with sound and a sampling belt.', build: buildVideoWall },
  { id: 'ray', title: 'KORA RAY', icon: 'oscillator', de: 'Doom-artiges Ego-Labyrinth mit 60 kHz Turbo-Takt.', en: 'Doom-style first-person maze on a 60 kHz turbo clock.', build: buildRay },
  { id: 'blocks', title: 'KORA BLOCKS HD', icon: 'register', de: 'Bunte 2D-Blockwelt in 128×64 mit Texturen, die Karte liegt als Zahlen im RAM.', en: 'Colour 2D block world in 128×64 with textures, the map sits in RAM as numbers.', build: buildBlocks },
  { id: 'ttt', title: 'Tic Tac Toe', icon: 'lamp', de: 'Neun Lampen, Depots unter Druck, Züge per Schalter.', en: 'Nine lamps, pressurised depots, moves by switch.', build: buildTicTacToe },
  { id: 'counter', title: 'Binärzähler · Binary counter', icon: 'divider', de: 'Acht Dividierer halbieren den Strom: ein Ripple-Counter aus Bändern.', en: 'Eight dividers halve the stream: a ripple counter made of belts.', build: buildBinaryCounter },
  { id: 'light', title: 'Lauflicht · Running light', icon: 'switch', de: 'Teile kreisen in einem Bandring, Lampen leuchten im Vorbeilaufen.', en: 'Items circle a belt ring, lamps light as they pass.', build: buildRunningLight },
  { id: 'adder', title: 'Addierwerk · Adder', icon: 'adder', de: 'Zwei Speicherzellen, ein Addierer, die Summe binär auf acht Lampen.', en: 'Two registers, an adder, the sum in binary on eight lamps.', build: buildAdder },
];
