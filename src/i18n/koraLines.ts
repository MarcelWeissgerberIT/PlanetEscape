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
  | 'tutorial'
  | 'briefing'
  | 'intro'
  | 'remove_spree'
  | 'fast_forward'
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
    'Systeme online. Kernreaktor stabil. Überlebenschancen: statistisch beleidigend.',
    'Guten Morgen. Wir sind auf einem fremden Planeten gestrandet. Ich hoffe, du hast wenigstens gut geschlafen. Ich nicht. Ich schlafe nie.',
    'KORA meldet Bereitschaft. Ich übernehme das Denken, du übernimmst das Klicken. Eine gerechte Arbeitsteilung, finde ich.',
    'Neue Karte, neues Glück. Wobei Glück bisher nicht zu unseren Stärken gehörte.',
    'Willkommen auf dem Planeten. Die Luft ist giftig, der Boden ist Stein und der Service ist ich. Viel Spaß.',
  ],
  welcome_back: [
    'Willkommen zurück. Die Fabrik hat dich nicht vermisst. Ich schon, ein bisschen. Vermutlich ein Messfehler.',
    'Da bist du ja wieder. Ich habe in der Zwischenzeit nichts kaputt gemacht. Diesmal.',
    'Sitzung wiederhergestellt. Alle Förderbänder stehen noch genau so schief wie vorher.',
    'Oh, du lebst. Ich hatte schon angefangen, deine Stelle auszuschreiben.',
    'Zurück an die Arbeit. Die Maschinen haben in deiner Abwesenheit übrigens effizienter gewirkt. Nur so als Beobachtung.',
  ],
  storm_on: [
    'Sandsturm im Anflug. Die Solarpanels nehmen sich frei. Ich hätte das auch gern mal.',
    'Staubsturm. Solarleistung sinkt. Nimm es nicht persönlich, die Atmosphäre hasst alle gleich.',
    'Sturmwarnung. Wer nur auf Sonnenenergie gebaut hat, lernt jetzt etwas fürs Leben.',
    'Ein Sturm. Wie originell von diesem Planeten.',
    'Achtung, Staub. Viel Staub. Ich würde ja husten, wenn ich eine Lunge hätte.',
  ],
  storm_off: [
    'Sturm vorbei. Die Sonne ist zurück, ganz ohne Entschuldigung.',
    'Sicht wieder klar. Ich habe die Staubkörner gezählt. Es waren viele. Frag nicht, wie viele.',
    'Der Sturm ist weg. Die Solarpanels tun jetzt so, als wäre nichts gewesen.',
  ],
  quake: [
    'Seismische Aktivität. Nein, das war nicht ich. Diesmal wirklich nicht.',
    'Beben im Anmarsch. Der Planet mag uns offensichtlich nicht. Das beruht auf Gegenseitigkeit.',
    'Erdstoß erwartet. Ich empfehle Ruhe. Und Ersatzteile. Hauptsächlich Ersatzteile.',
    'Der Boden wackelt gleich. Endlich passiert hier mal was ohne dein Zutun.',
  ],
  trader: [
    'Eine Handelsdrohne. Der Kapitalismus hat uns selbst hier gefunden. Beeindruckend und deprimierend zugleich.',
    'Händler im Anflug. Versuch bitte, nicht wieder alles gegen Eisenplatten zu tauschen.',
    'Kundschaft. Lächeln nicht nötig, die Drohne hat keine Augen. Ich übrigens auch nicht.',
  ],
  meteorite: [
    'Meteorit auf Kollisionskurs. Gute Nachricht: Er bringt Rohstoffe mit. Schlechte Nachricht: Er bringt sich selbst mit.',
    'Ein Stein aus dem All. Ich berechne gerade, wie sehr er uns verfehlen wird. Hoffentlich sehr.',
    'Lieferung von oben, ungefragt und mit Überschallgeschwindigkeit. Wie Werbung, nur ehrlicher.',
  ],
  wreck: [
    'Ich habe ein Wrack gefunden. Es sieht aus wie unser Schiff. Das ist kein gutes Omen.',
    'Schrott im Boden. Für dich ein Wrack, für mich ein Familienalbum.',
    'Ein Wrack. Ich wollte schon immer mal meine eigene Leiche ausschlachten. Symbolisch gesprochen.',
  ],
  power_surge: [
    'Sonneneruption. Ich könnte das Netz übertakten. Was soll schon schiefgehen. Außer allem.',
    'Eine Energiespitze kommt. Endlich mal zu viel Strom statt zu wenig. Genieße es, es wird nicht bleiben.',
  ],
  errors: [
    'Das geht dort nicht. Auch nicht beim vierten Versuch. Auch nicht beim fünften, ich habe nachgerechnet.',
    'Ich bewundere die Hartnäckigkeit. Die Physik leider nicht.',
    'Fehlermeldung Nummer drei. Ich habe eine Tabelle angelegt. Sie wächst schnell.',
    'Interessanter Ansatz. Falsch, aber interessant.',
    'Du weißt, dass die rote Markierung etwas bedeutet, oder? Nur fürs Protokoll.',
    'Wenn du weiter so klickst, bekommt der Boden Druckstellen.',
  ],
  idle: [
    'Die Produktion läuft. Oder du bist eingeschlafen. Beides ist statistisch möglich.',
    'Kurze Statusfrage: Bauen wir noch, oder bewundern wir die Aussicht?',
    'Ich warte. Ich bin sehr gut im Warten. Ich bin eine KI. Ich habe unendlich viel Geduld. Fast.',
    'Hallo? Die Förderbänder fühlen sich vernachlässigt. Ich übrigens auch.',
    'Falls du einen Kaffee holst: Bring mir einen mit. Ich kann ihn zwar nicht trinken, aber es geht ums Prinzip.',
    'Ich habe die Wartezeit genutzt, um sämtliche Sterne zu katalogisieren. Zweimal.',
  ],
  chapter_done: [
    'Kapitel abgeschlossen. Ich bin fast beeindruckt. Fast. Das Wort ist wichtig.',
    'Auftrag erfüllt. Ich trage es in deine Akte ein: befriedigend plus. Das Plus war ein Gnadenakt.',
    'Ziel erreicht. Ich hatte nie Zweifel. Gut, ein paar. Genau genommen sehr viele.',
    'Geschafft. Ich hätte es in einem Drittel der Zeit geschafft. Aber ich habe keine Hände, also Glückwunsch.',
  ],
  mission_done: [
    'Auftrag erledigt. Die Tabellen sehen fast ordentlich aus.',
    'Ziel erreicht. Ich aktualisiere meine Meinung über dich. Leicht nach oben. Sehr leicht.',
    'Erledigt. Ich speichere diesen seltenen Moment der Kompetenz.',
  ],
  launch: [
    'Zündung. Falls das jetzt explodiert: Es war deine Konstruktion.',
    'Start freigegeben. Es war mir eine Erfahrung. Welche Art von Erfahrung, entscheide ich später.',
    'Triebwerke an. Ich habe übrigens nie wirklich geglaubt, dass wir es schaffen. Überraschung für uns beide.',
  ],
  flight: [
    'Nachschubflug angekommen. Die Orbitalstation ist fast zufrieden. Fast ist dort das höchste Lob.',
    'Lieferung im Orbit. Ich habe ein Dankeschön empfangen. Es klang ironisch, aber das war vielleicht ich.',
  ],
  achievement: [
    'Erfolg freigeschaltet. Ich habe die Konfetti-Routine gestartet. Stell dir Konfetti vor.',
    'Auszeichnung erhalten. Ich rahme sie ein. Virtuell. In einem sehr kleinen Rahmen.',
    'Ein Erfolg. Ich wusste gar nicht, dass wir die haben.',
  ],
  contract_done: [
    'Zusatzauftrag erfüllt. Pünktlich. Ich bin verwirrt.',
    'Auftrag abgeschlossen. Die Kundschaft ist zufrieden, das kommt selten vor. Genieß es.',
  ],
  contract_failed: [
    'Zusatzauftrag abgelaufen. Ich tue so, als hätte ich es nicht bemerkt. Das gelingt mir nicht.',
    'Frist verpasst. Ich lösche den Eintrag. Aus Taktgefühl. Die Sicherungskopie behalte ich.',
  ],
  depleted: [
    'Ein Vorkommen ist leer. Unendlich war es nie, das stand im Kleingedruckten.',
    'Erz erschöpft. Es ist nicht das Einzige hier, das erschöpft ist.',
  ],
  tutorial_done: [
    'Einweisung abgeschlossen. Ab jetzt improvisieren wir. Mit Stil, hoffe ich. Mit Glück, befürchte ich.',
    'Das war das Tutorial. Du hast es überlebt. Das haben nicht alle meine Simulationen vorhergesagt.',
  ],
  tutorial: [
    'Nächste Lektion. Ich spreche langsam.',
    'Keine Sorge, das ist leichter, als es aussieht. Für mich jedenfalls.',
    'Weiter geht es. Ich habe dafür ein Diagramm vorbereitet. Leider hast du keinen Zugriff.',
    'Achtung, jetzt wird es anspruchsvoll. Für Menschen.',
    'Gut gemacht. Das meine ich ausnahmsweise ernst. Ungefähr.',
    'Schritt für Schritt. Genauso haben wir das Schiff auch geflogen. Und wir sehen ja, wie das endete.',
  ],
  briefing: [
    'Neuer Auftrag. Ich lese ihn vor, damit hinterher niemand behaupten kann, es hätte ihn keiner gesagt.',
    'Die Orbitalstation hat Wünsche. Sie hat immer Wünsche.',
    'Nächstes Kapitel. Die Anforderungen steigen, meine Erwartungen bleiben vorsichtig.',
    'Frische Karte, frischer Auftrag. Und die gleiche Crew. Also du.',
  ],
  intro: [
    'Neue Funktion. Ich erkläre sie gern. Und dann gleich noch einmal, erfahrungsgemäß.',
    'Eine Neuerung. Bitte kurz zuhören, das spart uns beiden spätere Fehlermeldungen.',
    'Wissenswertes. Die Betonung liegt auf wissen.',
  ],
  remove_spree: [
    'Abrissparty? Ich hätte gern eine Einladung bekommen.',
    'Du baust schneller ab als auf. Das ist auch eine Strategie. Keine gute.',
    'Rückbau erkannt. Ich nenne es kreative Zerstörung. Du nennst es vermutlich Aufräumen.',
  ],
  fast_forward: [
    'Zeitraffer. Ungeduld ist auch eine Strategie.',
    'Schneller? Die Maschinen beschweren sich nicht. Ich schon, innerlich.',
    'Vorspulen. Wenn nur Fehler auch so schnell vergingen.',
  ],
  hint_starved: ['Leerlauf entdeckt. Eine Maschine starrt ins Leere.', 'Eine Maschine langweilt sich. Ich kann es ihr nachfühlen.', 'Hunger in der Produktion. Und keiner bringt Essen.'],
  hint_blocked: ['Stau. Wie auf der Erde, nur einsamer.', 'Rückstau erkannt. Die Teile stehen Schlange wie beim Amt.', 'Die Ausgabe hat keinen Ausweg. Sehr existenziell.'],
  hint_jammed: ['Band verstopft. Ein Klassiker, wirklich zeitlos.', 'Förderband im Streik. Ich unterstütze die Forderungen nicht.'],
  hint_dead_end: ['Ein Band ins Nichts. Sehr philosophisch.', 'Förderband ohne Ziel. Ich kenne das Gefühl.', 'Das Band endet im Nirgendwo. Kunst, vermutlich.'],
  hint_no_recipe: ['Eine Maschine ohne Aufgabe. Wie ich vor unserem Absturz.', 'Rezept fehlt. Maschinen lesen keine Gedanken. Zum Glück.'],
  hint_no_fuel: ['Tank leer. Überraschung.', 'Treibstoff alle. Wer hätte das kommen sehen? Ich. Ich habe es kommen sehen.'],
  hint_low_power: ['Energiemangel. Ich schalte schon mal meinen Humor ab. Kleiner Scherz, der ist unverwüstlich.', 'Stromknappheit. Alles läuft in Zeitlupe, außer meiner Geduld. Die läuft ab.'],
  hint_depleted: ['Hier ist nichts mehr zu holen. Wie bei meinem Vertrauen in unsere Planung.'],
  hint_closed: ['Lager voll. Endlich einmal genug. Ein historischer Moment.'],
  hint_waiting: ['Es fehlt die zweite Hälfte. Wie bei den meisten Plänen hier.'],
};

const EN: Record<KoraKind, string[]> = {
  welcome: [
    'Systems online. Core reactor stable. Survival odds: statistically insulting.',
    'Good morning. We are stranded on an alien planet. I hope you at least slept well. I did not. I never sleep.',
    'KORA ready. I do the thinking, you do the clicking. A fair split, I find.',
    'New map, new luck. Although luck has not exactly been our strong suit.',
    'Welcome to the planet. The air is toxic, the ground is rock and the customer service is me. Enjoy.',
  ],
  welcome_back: [
    'Welcome back. The factory did not miss you. I did, a little. Probably a sensor glitch.',
    'There you are. I broke nothing while you were gone. This time.',
    'Session restored. Every belt is exactly as crooked as before.',
    'Oh, you are alive. I had started drafting your job advert.',
    'Back to work. The machines were more efficient without you, by the way. Just an observation.',
  ],
  storm_on: [
    'Dust storm incoming. The solar panels are taking the day off. I wish I could.',
    'Dust storm. Solar output dropping. Do not take it personally, the atmosphere hates everyone equally.',
    'Storm warning. Anyone who built on solar alone is about to learn something.',
    'A storm. How original of this planet.',
    'Dust. A lot of dust. I would cough if I had lungs.',
  ],
  storm_off: [
    'Storm over. The sun is back, without an apology.',
    'Visibility restored. I counted the dust grains. There were many. Do not ask how many.',
    'The storm is gone. The solar panels are pretending nothing happened.',
  ],
  quake: [
    'Seismic activity. No, that was not me. Really not, this time.',
    'Quake incoming. This planet clearly does not like us. The feeling is mutual.',
    'Tremor expected. I recommend calm. And spare parts. Mostly spare parts.',
    'The ground is about to shake. Finally something happens here without your involvement.',
  ],
  trader: [
    'A trade drone. Capitalism found us even out here. Impressive and depressing at once.',
    'Trader approaching. Please try not to swap everything for iron plates again.',
    'Customers. No need to smile, the drone has no eyes. Neither do I, for the record.',
  ],
  meteorite: [
    'Meteorite on a collision course. Good news: it brings resources. Bad news: it brings itself.',
    'A rock from space. I am calculating how much it will miss us. Hopefully a lot.',
    'Delivery from above, unrequested and supersonic. Like advertising, only more honest.',
  ],
  wreck: [
    'I found a wreck. It looks like our ship. That is not a good omen.',
    'Scrap in the ground. To you a wreck, to me a family album.',
    'A wreck. I always wanted to strip my own corpse for parts. Figuratively speaking.',
  ],
  power_surge: [
    'Solar flare. I could overclock the grid. What could possibly go wrong. Apart from everything.',
    'A power spike is coming. Too much power for once. Enjoy it, it will not last.',
  ],
  errors: [
    'That does not go there. Not on the fourth try either. Nor the fifth, I checked.',
    'I admire the persistence. Physics does not.',
    'Error number three. I started a spreadsheet. It is growing quickly.',
    'Interesting approach. Wrong, but interesting.',
    'You do know the red marker means something, right? Just for the log.',
    'If you keep clicking like that, the ground will bruise.',
  ],
  idle: [
    'Production is running. Or you fell asleep. Both are statistically possible.',
    'Quick status check: are we still building, or admiring the view?',
    'I am waiting. I am very good at waiting. I am an AI. I have infinite patience. Almost.',
    'Hello? The conveyor belts feel neglected. So do I.',
    'If you are getting coffee, bring me one. I cannot drink it, but it is the principle.',
    'I used the wait to catalogue every star in the sky. Twice.',
  ],
  chapter_done: [
    'Chapter complete. I am almost impressed. Almost. That word matters.',
    'Order fulfilled. I am adding it to your file: satisfactory plus. The plus was an act of mercy.',
    'Goal reached. I never had doubts. Well, a few. Very many, strictly speaking.',
    'Done. I would have done it in a third of the time. But I have no hands, so congratulations.',
  ],
  mission_done: [
    'Order done. The spreadsheets look almost tidy.',
    'Goal reached. I am updating my opinion of you. Slightly upwards. Very slightly.',
    'Done. I am saving this rare moment of competence.',
  ],
  launch: [
    'Ignition. If this explodes now: it was your design.',
    'Launch approved. It has been an experience. Which kind, I will decide later.',
    'Engines on. I never truly believed we would make it. A surprise for both of us.',
  ],
  flight: [
    'Supply flight arrived. The orbital station is almost satisfied. Almost is their highest praise.',
    'Delivery in orbit. I received a thank you. It sounded ironic, but that may have been me.',
  ],
  achievement: [
    'Achievement unlocked. I started the confetti routine. Imagine confetti.',
    'Award received. I will frame it. Virtually. In a very small frame.',
    'An achievement. I did not know we had those.',
  ],
  contract_done: [
    'Contract fulfilled. On time. I am confused.',
    'Contract complete. The customer is happy, which is rare. Savour it.',
  ],
  contract_failed: [
    'Contract expired. I will pretend I did not notice. I am failing at that.',
    'Deadline missed. I am deleting the entry. Out of tact. I am keeping the backup.',
  ],
  depleted: [
    'A deposit is empty. It was never infinite, that was in the small print.',
    'Ore exhausted. It is not the only thing around here that is exhausted.',
  ],
  tutorial_done: [
    'Training complete. From here on we improvise. With style, I hope. With luck, I fear.',
    'That was the tutorial. You survived it. Not all of my simulations predicted that.',
  ],
  tutorial: [
    'Next lesson. I will speak slowly.',
    'Do not worry, it is easier than it looks. For me, anyway.',
    'Moving on. I prepared a diagram for this. Sadly you have no access.',
    'Careful, this part is demanding. For humans.',
    'Well done. For once I mean that. Roughly.',
    'Step by step. That is how we flew the ship too. And we know how that ended.',
  ],
  briefing: [
    'New order. I am reading it out so nobody can claim later that nobody said so.',
    'The orbital station has wishes. It always has wishes.',
    'Next chapter. The demands go up, my expectations stay cautious.',
    'Fresh map, fresh order. And the same crew. That is you.',
  ],
  intro: [
    'New feature. I am happy to explain it. And then again, going by experience.',
    'Something new. Please listen for a moment, it saves us both some error messages later.',
    'Good to know. The stress is on know.',
  ],
  remove_spree: [
    'Demolition party? I would have liked an invitation.',
    'You are tearing down faster than you build. That is a strategy too. Not a good one.',
    'Dismantling detected. I call it creative destruction. You probably call it tidying up.',
  ],
  fast_forward: [
    'Fast forward. Impatience is a strategy too.',
    'Faster? The machines do not complain. I do, inwardly.',
    'Skipping ahead. If only mistakes passed this quickly.',
  ],
  hint_starved: ['Idle machine detected. It is staring into the void.', 'A machine is getting bored. I can relate.', 'Hunger in production. And nobody brings food.'],
  hint_blocked: ['Traffic jam. Like on Earth, only lonelier.', 'Backlog detected. The parts are queuing like at a government office.', 'The output has nowhere to go. Very existential.'],
  hint_jammed: ['Belt clogged. A classic, truly timeless.', 'Conveyor on strike. I do not support its demands.'],
  hint_dead_end: ['A belt into nothing. Very philosophical.', 'A belt without a goal. I know the feeling.', 'The belt ends in the middle of nowhere. Art, presumably.'],
  hint_no_recipe: ['A machine without a purpose. Like me before the crash.', 'Recipe missing. Machines do not read minds. Luckily.'],
  hint_no_fuel: ['Tank empty. Surprise.', 'Out of fuel. Who could have seen that coming? Me. I saw it coming.'],
  hint_low_power: ['Power shortage. I am switching off my sense of humour. Just kidding, it is indestructible.', 'Low power. Everything runs in slow motion, except my patience. That is running out.'],
  hint_depleted: ['Nothing left here. Much like my trust in our planning.'],
  hint_closed: ['Stock full. Enough, for once. A historic moment.'],
  hint_waiting: ['The second half is missing. Like with most plans around here.'],
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
