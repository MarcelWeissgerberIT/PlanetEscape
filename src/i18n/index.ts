export type Lang = 'en' | 'de';

const dict = {
  en: {
    title: 'Planet Escape',
    tagline: 'Stranded. Build. Launch.',
    continue: 'Continue',
    new_game: 'New game',
    new_game_confirm: 'Start a new game? Your current base will be lost.',
    language: 'Language',
    play: 'Start',
    intro:
      'Your ship crash-landed on a dead world. The Landing Core survived. Mine, smelt and assemble: build production chains that deliver ship parts to the Core and escape the planet.',
    how_to: 'How to play',
    how_to_text:
      '• Pick a building at the bottom and tap the map to place it.\n• Drag to lay conveyor belts. Belts feed into whatever they point at.\n• Miners must sit on a deposit. Machines output at their front (arrow).\n• Deliver items to the Landing Core to complete missions and unlock more.\n• Keep an eye on power: machines slow down when demand exceeds supply.',
    ok: 'OK',
    cancel: 'Cancel',
    close: 'Close',
    menu: 'Menu',
    missions: 'Missions',
    mission: 'Mission',
    mission_done: 'Mission complete!',
    unlocked: 'Unlocked',
    deliver: 'Deliver to the Landing Core',
    power: 'Power',
    inventory: 'Core inventory',
    rotate: 'Rotate',
    delete: 'Remove',
    delete_mode: 'Removal mode – tap buildings to remove them',
    select_recipe: 'Choose a recipe',
    no_recipe: 'No recipe',
    recipe: 'Recipe',
    input: 'Input',
    output: 'Output',
    idle: 'Idle',
    working: 'Working',
    no_power: 'Low power',
    waiting_input: 'Waiting for input',
    output_full: 'Output blocked',
    cost: 'Cost',
    locked: 'Locked',
    locked_hint: 'Complete missions to unlock',
    err_locked: 'Not unlocked yet',
    err_bounds: 'Outside the map',
    err_occupied: 'Tile is occupied',
    err_deposit: 'Miners must be placed on a deposit',
    err_cost: 'Not enough resources in the Core',
    fuel_left: 'Fuel',
    stored: 'Stored',
    ship_progress: 'Ship progress',
    launch_title: 'Liftoff!',
    launch_text: 'Your ship is complete. You escaped the planet in {time}.',
    play_again: 'Play again (new planet)',
    keep_playing: 'Keep building',
    tip_first:
      'Tip: place a Miner on the red iron ore and lay a belt from it to the Landing Core in the middle.',
    hint_pan: 'Drag to pan • Pinch / wheel to zoom',
    settings: 'Settings',
    sound: 'Sound',
    on: 'On',
    off: 'Off',
    save_hint: 'Progress is saved automatically on this device.',
    reset_view: 'Center view',
    supply: 'Supply',
    demand: 'Demand',
    build: 'Build',
    per_sec: '/s',
    items: {
      iron_ore: 'Iron ore',
      copper_ore: 'Copper ore',
      quartz: 'Quartz',
      ice: 'Ice',
      oil: 'Crude oil',
      iron_plate: 'Iron plate',
      copper_plate: 'Copper plate',
      copper_wire: 'Copper wire',
      glass: 'Glass',
      silicon: 'Silicon',
      water: 'Water',
      fuel: 'Rocket fuel',
      steel_frame: 'Steel frame',
      circuit: 'Circuit board',
      hull_plate: 'Hull plate',
      engine: 'Engine',
      nav_computer: 'Nav computer',
      fuel_cell: 'Fuel cell',
      life_support: 'Life support',
    },
    buildings: {
      core: 'Landing Core',
      conveyor: 'Conveyor',
      miner: 'Miner',
      smelter: 'Smelter',
      assembler: 'Assembler',
      refinery: 'Refinery',
      solar: 'Solar panel',
      generator: 'Fuel generator',
      storage: 'Storage',
      splitter: 'Splitter',
    },
    building_desc: {
      core: 'Accepts everything. Delivered items become your building resources and ship parts.',
      conveyor: 'Moves items in the arrow direction. Drag to lay several at once.',
      miner: 'Place on a deposit. Extracts ore and pushes it out the front.',
      smelter: 'Ore in, plates out. Picks the recipe automatically from its input.',
      assembler: 'Combines parts into components. Choose a recipe by tapping it.',
      refinery: 'Processes ice, quartz and oil into water, silicon and fuel.',
      solar: 'Produces 4 power. No fuel needed.',
      generator: 'Burns rocket fuel for 20 power.',
      storage: 'Buffers up to 60 items and passes them on at the front.',
      splitter: 'Takes items from behind and splits them left, forward and right.',
    },
    missions_text: {
      m1: { title: 'First ore', text: 'Place a Miner on iron ore and connect it to the Landing Core with a conveyor.' },
      m2: { title: 'Hot metal', text: 'Route ore through a Smelter before it reaches the Core.' },
      m3: { title: 'Wires and frames', text: 'Build an Assembler. Copper plates become wire, iron plates become frames.' },
      m4: { title: 'Electronics', text: 'Circuits need iron plates AND copper wire in one Assembler. Smelt quartz into glass.' },
      m5: { title: 'Liquids', text: 'A Refinery turns ice into water. Fuel needs oil and water together.' },
      m6: { title: 'Build the ship', text: 'Assemble all ship parts and deliver them to the Landing Core.' },
    },
  },
  de: {
    title: 'Planet Escape',
    tagline: 'Gestrandet. Bauen. Starten.',
    continue: 'Weiterspielen',
    new_game: 'Neues Spiel',
    new_game_confirm: 'Neues Spiel starten? Deine aktuelle Basis geht verloren.',
    language: 'Sprache',
    play: 'Los',
    intro:
      'Dein Schiff ist auf einer toten Welt abgestürzt. Der Landekern hat überlebt. Abbauen, schmelzen, montieren: Baue Produktionsketten, die Schiffsteile zum Kern liefern, und entkomme dem Planeten.',
    how_to: 'So funktioniert es',
    how_to_text:
      '• Wähle unten ein Gebäude und tippe auf die Karte, um es zu platzieren.\n• Ziehe, um Förderbänder zu verlegen. Bänder liefern in das, worauf sie zeigen.\n• Bohrer müssen auf einem Vorkommen stehen. Maschinen geben vorne (Pfeil) aus.\n• Liefere Gegenstände zum Landekern, um Missionen zu erfüllen und mehr freizuschalten.\n• Behalte die Energie im Blick: Maschinen werden langsamer, wenn der Bedarf das Angebot übersteigt.',
    ok: 'OK',
    cancel: 'Abbrechen',
    close: 'Schließen',
    menu: 'Menü',
    missions: 'Missionen',
    mission: 'Mission',
    mission_done: 'Mission erfüllt!',
    unlocked: 'Freigeschaltet',
    deliver: 'Zum Landekern liefern',
    power: 'Energie',
    inventory: 'Kern-Lager',
    rotate: 'Drehen',
    delete: 'Entfernen',
    delete_mode: 'Abrissmodus – tippe auf Gebäude, um sie zu entfernen',
    select_recipe: 'Rezept wählen',
    no_recipe: 'Kein Rezept',
    recipe: 'Rezept',
    input: 'Eingang',
    output: 'Ausgang',
    idle: 'Bereit',
    working: 'Arbeitet',
    no_power: 'Zu wenig Energie',
    waiting_input: 'Wartet auf Material',
    output_full: 'Ausgang blockiert',
    cost: 'Kosten',
    locked: 'Gesperrt',
    locked_hint: 'Erfülle Missionen zum Freischalten',
    err_locked: 'Noch nicht freigeschaltet',
    err_bounds: 'Außerhalb der Karte',
    err_occupied: 'Feld ist belegt',
    err_deposit: 'Bohrer müssen auf einem Vorkommen stehen',
    err_cost: 'Nicht genug Ressourcen im Kern',
    fuel_left: 'Treibstoff',
    stored: 'Gelagert',
    ship_progress: 'Schiffsfortschritt',
    launch_title: 'Abheben!',
    launch_text: 'Dein Schiff ist fertig. Du bist dem Planeten in {time} entkommen.',
    play_again: 'Nochmal spielen (neuer Planet)',
    keep_playing: 'Weiterbauen',
    tip_first:
      'Tipp: Setze einen Bohrer auf das rote Eisenerz und verlege ein Band von dort zum Landekern in der Mitte.',
    hint_pan: 'Ziehen zum Verschieben • Pinch / Mausrad zum Zoomen',
    settings: 'Einstellungen',
    sound: 'Ton',
    on: 'An',
    off: 'Aus',
    save_hint: 'Der Fortschritt wird auf diesem Gerät automatisch gespeichert.',
    reset_view: 'Ansicht zentrieren',
    supply: 'Angebot',
    demand: 'Bedarf',
    build: 'Bauen',
    per_sec: '/s',
    items: {
      iron_ore: 'Eisenerz',
      copper_ore: 'Kupfererz',
      quartz: 'Quarz',
      ice: 'Eis',
      oil: 'Rohöl',
      iron_plate: 'Eisenplatte',
      copper_plate: 'Kupferplatte',
      copper_wire: 'Kupferdraht',
      glass: 'Glas',
      silicon: 'Silizium',
      water: 'Wasser',
      fuel: 'Raketentreibstoff',
      steel_frame: 'Stahlrahmen',
      circuit: 'Platine',
      hull_plate: 'Rumpfplatte',
      engine: 'Triebwerk',
      nav_computer: 'Navigationscomputer',
      fuel_cell: 'Treibstoffzelle',
      life_support: 'Lebenserhaltung',
    },
    buildings: {
      core: 'Landekern',
      conveyor: 'Förderband',
      miner: 'Bohrer',
      smelter: 'Schmelzofen',
      assembler: 'Montagewerk',
      refinery: 'Raffinerie',
      solar: 'Solarpanel',
      generator: 'Treibstoffgenerator',
      storage: 'Lager',
      splitter: 'Verteiler',
    },
    building_desc: {
      core: 'Nimmt alles an. Gelieferte Gegenstände werden zu Bauressourcen und Schiffsteilen.',
      conveyor: 'Transportiert Gegenstände in Pfeilrichtung. Ziehen, um mehrere zu verlegen.',
      miner: 'Auf ein Vorkommen setzen. Fördert Erz und gibt es vorne aus.',
      smelter: 'Erz rein, Platten raus. Wählt das Rezept automatisch nach Eingang.',
      assembler: 'Kombiniert Teile zu Bauteilen. Rezept durch Antippen wählen.',
      refinery: 'Verarbeitet Eis, Quarz und Öl zu Wasser, Silizium und Treibstoff.',
      solar: 'Erzeugt 4 Energie. Kein Treibstoff nötig.',
      generator: 'Verbrennt Raketentreibstoff für 20 Energie.',
      storage: 'Puffert bis zu 60 Gegenstände und gibt sie vorne weiter.',
      splitter: 'Nimmt Gegenstände von hinten und verteilt sie nach links, vorne und rechts.',
    },
    missions_text: {
      m1: { title: 'Erstes Erz', text: 'Setze einen Bohrer auf Eisenerz und verbinde ihn per Förderband mit dem Landekern.' },
      m2: { title: 'Heißes Metall', text: 'Leite das Erz durch einen Schmelzofen, bevor es den Kern erreicht.' },
      m3: { title: 'Draht und Rahmen', text: 'Baue ein Montagewerk. Kupferplatten werden zu Draht, Eisenplatten zu Rahmen.' },
      m4: { title: 'Elektronik', text: 'Platinen brauchen Eisenplatten UND Kupferdraht in einem Montagewerk. Schmelze Quarz zu Glas.' },
      m5: { title: 'Flüssigkeiten', text: 'Eine Raffinerie macht aus Eis Wasser. Treibstoff braucht Öl und Wasser zusammen.' },
      m6: { title: 'Bau das Schiff', text: 'Montiere alle Schiffsteile und liefere sie zum Landekern.' },
    },
  },
} as const;

type Dict = (typeof dict)['en'];
type FlatKey = { [K in keyof Dict]: Dict[K] extends string ? K : never }[keyof Dict];

let current: Lang = detect();

function detect(): Lang {
  try {
    const stored = localStorage.getItem('pe_lang');
    if (stored === 'en' || stored === 'de') return stored;
  } catch {
    /* ignore */
  }
  return navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang) {
  current = l;
  try {
    localStorage.setItem('pe_lang', l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l;
}

export function t(key: FlatKey, vars?: Record<string, string | number>): string {
  let s: string = dict[current][key] ?? dict.en[key] ?? key;
  if (vars) for (const k in vars) s = s.replace(`{${k}}`, String(vars[k]));
  return s;
}

export function tItem(id: string): string {
  return (dict[current].items as Record<string, string>)[id] ?? id;
}

export function tBuilding(id: string): string {
  return (dict[current].buildings as Record<string, string>)[id] ?? id;
}

export function tBuildingDesc(id: string): string {
  return (dict[current].building_desc as Record<string, string>)[id] ?? '';
}

export function tMission(id: string): { title: string; text: string } {
  return (dict[current].missions_text as Record<string, { title: string; text: string }>)[id] ?? { title: id, text: '' };
}
