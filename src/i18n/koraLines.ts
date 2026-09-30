// KORA's remarks: a technical ship AI with a dry, sarcastic streak. Short lines she adds to what happens (storms,
// quakes, errors, long pauses, finished chapters) and in front of her problem hints. Picked at random, never the
// same line twice in a row.
import { getLang } from './index';

export type KoraKind =
  | 'welcome'
  | 'welcome_back'
  | 'storm_on'
  | 'storm_off'
  | 'quake'
  | 'trader'
  | 'meteorite'
  | 'wreck'
  | 'power_surge'
  | 'errors'
  | 'idle'
  | 'chapter_done'
  | 'mission_done'
  | 'launch'
  | 'flight'
  | 'achievement'
  | 'contract_done'
  | 'contract_failed'
  | 'depleted'
  | 'tutorial_done'
  | 'hint_starved'
  | 'hint_blocked'
  | 'hint_jammed'
  | 'hint_dead_end'
  | 'hint_no_recipe'
  | 'hint_no_fuel'
  | 'hint_low_power'
  | 'hint_depleted'
  | 'hint_closed'
  | 'hint_waiting';

const DE: Record<KoraKind, string[]> = {
  welcome: [
    'Systeme online. Kernreaktor stabil. Überlebenschancen: ausbaufähig.',
    'Guten Morgen. Wir sind auf einem fremden Planeten gestrandet. Ich hoffe, du hast gut geschlafen.',
    'KORA meldet Bereitschaft. Ich übernehme das Denken, du übernimmst das Bauen. Faire Arbeitsteilung.',
  ],
  welcome_back: [
    'Willkommen zurück. Die Fabrik hat dich nicht vermisst. Ich schon, ein bisschen. Vermutlich ein Messfehler.',
    'Da bist du ja wieder. Ich habe in der Zwischenzeit nichts kaputt gemacht. Diesmal.',
    'Sitzung wiederhergestellt. Alle Förderbänder stehen noch genau so schief wie vorher.',
  ],
  storm_on: [
    'Sandsturm im Anflug. Die Solarpanels nehmen sich frei. Ich hätte das auch gern.',
    'Staubsturm. Solarleistung sinkt. Bitte nicht persönlich nehmen, die Atmosphäre hasst alle gleich.',
    'Sturmwarnung. Wer nur auf Sonnenenergie gebaut hat, lernt jetzt etwas fürs Leben.',
  ],
  storm_off: [
    'Sturm vorbei. Die Sonne ist zurück, ganz ohne Entschuldigung.',
    'Sicht wieder klar. Ich habe die Staubkörner gezählt. Es waren viele.',
  ],
  quake: [
    'Seismische Aktivität. Nein, das war nicht ich.',
    'Beben im Anmarsch. Der Planet mag uns offenbar nicht. Das beruht auf Gegenseitigkeit.',
    'Erdstoß erwartet. Ich empfehle Ruhe. Und Ersatzteile.',
  ],
  trader: [
    'Eine Handelsdrohne. Der Kapitalismus hat uns selbst hier gefunden.',
    'Händler im Anflug. Versuch bitte, nicht wieder alles gegen Eisenplatten zu tauschen.',
  ],
  meteorite: [
    'Meteorit auf Kollisionskurs. Gute Nachricht: Er bringt Rohstoffe mit. Schlechte Nachricht: Er bringt sich selbst mit.',
    'Ein Stein aus dem All. Ich berechne gerade, wie sehr er uns verfehlen wird. Hoffentlich sehr.',
  ],
  wreck: [
    'Ich habe ein Wrack gefunden. Es sieht aus wie unser Schiff. Das ist kein gutes Omen.',
    'Schrott im Boden. Für dich ein Wrack, für mich ein Familienalbum.',
  ],
  power_surge: [
    'Sonneneruption. Ich könnte das Netz übertakten. Was soll schon schiefgehen.',
    'Eine Energiespitze kommt. Endlich mal zu viel Strom statt zu wenig.',
  ],
  errors: [
    'Das geht dort nicht. Auch nicht beim vierten Versuch.',
    'Ich bewundere die Hartnäckigkeit. Die Physik leider nicht.',
    'Fehlermeldung Nummer drei. Ich fange an, eine Tabelle zu führen.',
    'Interessanter Ansatz. Falsch, aber interessant.',
  ],
  idle: [
    'Die Produktion läuft. Oder du bist eingeschlafen. Beides ist statistisch möglich.',
    'Kurze Statusfrage: Bauen wir noch, oder bewundern wir die Aussicht?',
    'Ich warte. Ich bin sehr gut im Warten. Ich bin eine KI.',
    'Hallo? Die Förderbänder fühlen sich vernachlässigt.',
  ],
  chapter_done: [
    'Kapitel abgeschlossen. Ich bin fast beeindruckt. Fast.',
    'Auftrag erfüllt. Ich trage es in deine Akte ein: befriedigend plus.',
    'Ziel erreicht. Ich hatte nie Zweifel. Gut, ein paar. Genau genommen viele.',
  ],
  mission_done: [
    'Auftrag erledigt. Die Tabellen sehen fast ordentlich aus.',
    'Ziel erreicht. Ich aktualisiere meine Meinung über dich. Leicht nach oben.',
  ],
  launch: [
    'Zündung. Falls das jetzt explodiert: Es war deine Konstruktion.',
    'Start freigegeben. Es war mir eine Erfahrung. Welche, entscheide ich später.',
  ],
  flight: [
    'Nachschubflug angekommen. Die Orbitalstation ist fast zufrieden.',
    'Lieferung im Orbit. Ich habe ein Dankeschön empfangen. Es klang ironisch, aber das war vielleicht ich.',
  ],
  achievement: [
    'Erfolg freigeschaltet. Ich habe die Konfetti-Routine gestartet. Stell dir Konfetti vor.',
    'Auszeichnung erhalten. Ich rahme sie ein. Virtuell.',
  ],
  contract_done: [
    'Zusatzauftrag erfüllt. Pünktlich. Ich bin verwirrt.',
    'Auftrag abgeschlossen. Die Kundschaft ist zufrieden, das kommt selten vor.',
  ],
  contract_failed: [
    'Zusatzauftrag abgelaufen. Ich tue so, als hätte ich es nicht bemerkt.',
    'Frist verpasst. Ich lösche den Eintrag. Aus Taktgefühl.',
  ],
  depleted: [
    'Ein Vorkommen ist leer. Unendlich war es nie, das stand im Kleingedruckten.',
    'Erz erschöpft. Es ist nicht das Einzige hier, das erschöpft ist.',
  ],
  tutorial_done: [
    'Einweisung abgeschlossen. Ab jetzt improvisieren wir. Mit Stil, hoffe ich.',
  ],
  hint_starved: ['Leerlauf entdeckt.', 'Eine Maschine langweilt sich.', 'Hunger in der Produktion.'],
  hint_blocked: ['Stau. Wie auf der Erde, nur einsamer.', 'Rückstau erkannt.', 'Die Ausgabe hat keinen Ausweg.'],
  hint_jammed: ['Band verstopft. Ein Klassiker.', 'Förderband im Streik.'],
  hint_dead_end: ['Ein Band ins Nichts. Sehr philosophisch.', 'Förderband ohne Ziel. Ich kenne das Gefühl.'],
  hint_no_recipe: ['Eine Maschine ohne Aufgabe. Wie ich vor unserem Absturz.', 'Rezept fehlt. Maschinen lesen keine Gedanken.'],
  hint_no_fuel: ['Tank leer. Überraschung.', 'Treibstoff alle. Wer hätte das kommen sehen. Ich. Ich habe es kommen sehen.'],
  hint_low_power: ['Energiemangel. Ich schalte schon mal meinen Humor ab. Kleiner Scherz.', 'Stromknappheit. Alles läuft in Zeitlupe, außer meiner Geduld.'],
  hint_depleted: ['Hier ist nichts mehr zu holen.'],
  hint_closed: ['Lager voll. Endlich einmal genug.'],
  hint_waiting: ['Es fehlt die zweite Hälfte.'],
};

const EN: Record<KoraKind, string[]> = {
  welcome: [
    'Systems online. Core reactor stable. Survival odds: room for improvement.',
    'Good morning. We are stranded on an alien planet. I hope you slept well.',
    'KORA ready. I do the thinking, you do the building. A fair split.',
  ],
  welcome_back: [
    'Welcome back. The factory did not miss you. I did, a little. Probably a sensor glitch.',
    'There you are. I broke nothing while you were gone. This time.',
    'Session restored. Every belt is exactly as crooked as before.',
  ],
  storm_on: [
    'Dust storm incoming. The solar panels are taking the day off. I wish I could.',
    'Dust storm. Solar output dropping. Do not take it personally, the atmosphere hates everyone equally.',
    'Storm warning. Anyone who built on solar alone is about to learn something.',
  ],
  storm_off: [
    'Storm over. The sun is back, without an apology.',
    'Visibility restored. I counted the dust grains. There were many.',
  ],
  quake: [
    'Seismic activity. No, that was not me.',
    'Quake incoming. This planet clearly does not like us. The feeling is mutual.',
    'Tremor expected. I recommend calm. And spare parts.',
  ],
  trader: [
    'A trade drone. Capitalism found us even out here.',
    'Trader approaching. Please try not to swap everything for iron plates again.',
  ],
  meteorite: [
    'Meteorite on a collision course. Good news: it brings resources. Bad news: it brings itself.',
    'A rock from space. I am calculating how much it will miss us. Hopefully a lot.',
  ],
  wreck: [
    'I found a wreck. It looks like our ship. That is not a good omen.',
    'Scrap in the ground. To you a wreck, to me a family album.',
  ],
  power_surge: [
    'Solar flare. I could overclock the grid. What could possibly go wrong.',
    'A power spike is coming. Too much power for once, instead of too little.',
  ],
  errors: [
    'That does not go there. Not on the fourth try either.',
    'I admire the persistence. Physics does not.',
    'Error number three. I am starting a spreadsheet.',
    'Interesting approach. Wrong, but interesting.',
  ],
  idle: [
    'Production is running. Or you fell asleep. Both are statistically possible.',
    'Quick status check: are we still building, or admiring the view?',
    'I am waiting. I am very good at waiting. I am an AI.',
    'Hello? The conveyor belts feel neglected.',
  ],
  chapter_done: [
    'Chapter complete. I am almost impressed. Almost.',
    'Order fulfilled. I am adding it to your file: satisfactory plus.',
    'Goal reached. I never had doubts. Well, a few. Many, strictly speaking.',
  ],
  mission_done: [
    'Order done. The spreadsheets look almost tidy.',
    'Goal reached. I am updating my opinion of you. Slightly upwards.',
  ],
  launch: [
    'Ignition. If this explodes now: it was your design.',
    'Launch approved. It has been an experience. Which kind, I will decide later.',
  ],
  flight: [
    'Supply flight arrived. The orbital station is almost satisfied.',
    'Delivery in orbit. I received a thank you. It sounded ironic, but that may have been me.',
  ],
  achievement: [
    'Achievement unlocked. I started the confetti routine. Imagine confetti.',
    'Award received. I will frame it. Virtually.',
  ],
  contract_done: [
    'Contract fulfilled. On time. I am confused.',
    'Contract complete. The customer is happy, which is rare.',
  ],
  contract_failed: [
    'Contract expired. I will pretend I did not notice.',
    'Deadline missed. I am deleting the entry. Out of tact.',
  ],
  depleted: [
    'A deposit is empty. It was never infinite, that was in the small print.',
    'Ore exhausted. It is not the only thing around here that is exhausted.',
  ],
  tutorial_done: [
    'Training complete. From here on we improvise. With style, I hope.',
  ],
  hint_starved: ['Idle machine detected.', 'A machine is getting bored.', 'Hunger in production.'],
  hint_blocked: ['Traffic jam. Like on Earth, only lonelier.', 'Backlog detected.', 'The output has nowhere to go.'],
  hint_jammed: ['Belt clogged. A classic.', 'Conveyor on strike.'],
  hint_dead_end: ['A belt into nothing. Very philosophical.', 'A belt without a goal. I know the feeling.'],
  hint_no_recipe: ['A machine without a purpose. Like me before the crash.', 'Recipe missing. Machines do not read minds.'],
  hint_no_fuel: ['Tank empty. Surprise.', 'Out of fuel. Who could have seen that coming. Me. I saw it coming.'],
  hint_low_power: ['Power shortage. I am switching off my sense of humour. Just kidding.', 'Low power. Everything runs in slow motion, except my patience.'],
  hint_depleted: ['Nothing left to dig here.'],
  hint_closed: ['Stock full. Enough, for once.'],
  hint_waiting: ['The second half is missing.'],
};

const last = new Map<KoraKind, string>();

/** A random remark of this kind (not the one used last time). */
export function koraLine(kind: KoraKind): string {
  const pool = (getLang() === 'de' ? DE : EN)[kind];
  if (!pool?.length) return '';
  let line = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && line === last.get(kind)) line = pool[(pool.indexOf(line) + 1) % pool.length];
  last.set(kind, line);
  return line;
}

export function hasKoraLine(kind: string): kind is KoraKind {
  return kind in DE;
}
