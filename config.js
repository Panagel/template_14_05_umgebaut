// Schwellen des Watchers. Hier drehst du, wie laut er ist.
module.exports = {
  // --- Was ueberhaupt gesucht wird ---------------------------------------
  // Der Name muss das Modell nennen. Wortgrenze vorn, damit nicht jedes
  // Zubehoerteil mit "H2D" im Titel als Drucker durchgeht; nach hinten offen,
  // damit spaetere Ableger (H2D Pro, H2D Combo) von allein mitlaufen.
  modellRe: /\bH2D\b/i,

  // Dasselbe fuer die Adressen in der Sitemap des Herstellershops: der
  // Kurzname muss mit dem Modell beginnen. "h2d" und "h2d-pro" passen,
  // "dual-extruder-unit-h2d-h2c" nicht - Zubehoer traegt den Modellnamen
  // hinten.
  modellSlugRe: /^h2d(?:[-_][a-z0-9-]*)?$/i,

  // Locker: das Modell kommt im Kurznamen als eigenes Wort vor, egal an
  // welcher Stelle. Wird nur zusammen mit gebrauchtRe benutzt, denn
  // aufgearbeitete Geraete heissen andersherum - "refurbished-h2d-..." -
  // und sind trotzdem dasselbe Geraet, meist die guenstigste Fassung davon.
  modellImSlugRe: /(^|[-_])h2d([-_]|$)/i,

  // Zubehoer, Ersatzteile und Garantien tragen denselben Modellnamen. Was
  // hier passt, ist kein Drucker.
  //
  // Zwei Sorten Treffer, und die zweite ist der Grund, warum die Liste so
  // aussieht: englische Bezeichnungen stehen als eigene Woerter da
  // ("Nozzle", "Build Plate") und bekommen Wortgrenzen. Deutsche
  // Zusammensetzungen haengen das Grundwort hinten an - vor dem "modul" in
  // "Lasermodul" ist keine Wortgrenze, \bmodul\b greift dort also nicht.
  // Diese Grundwoerter stehen deshalb mit offenem Vorderteil.
  ausschlussRe: new RegExp([
    '\\b(?:nozzle|hotend|heatbed|bed\\s*plate|build\\s*plate|sheet|filament|spool|belt|fan',
    '|camera|goggles|cover|door|screw|adapter|holder|mount|bag|sticker|mat|cleaner|maintenance',
    '|spare|kit|set|accessor|warranty|protection\\s*plan|shipping|gift\\s*card|tube',
    '|unit|board|sensor|module|upgrade|refill|ptfe|toolbox|tool\\s*box|hardware|ersatz',
    '|deckel|t[uü]r|schraube|spule|aufkleber|nachr[uü]st)\\b',
    '|[a-zäöüß]*(?:d[uü]se|modul|platte|platine|kabel|matte|riemen|filter|halter|tasche|schlauch',
    '|reiniger|bl[oö]cker|geh[aä]use|glas|brille|beutel|lager|einheit)n?\\b',
    // Und andersherum: "Garantieverlaengerung" haengt hinten an, nicht vorn.
    '|\\b(?:garantie|versicherung|wartung|schutz|versand|zubeh[oö]r)[a-zäöüß]*\\b'
  ].join(''), 'i'),

  // --- Varianten wiedererkennen ------------------------------------------
  // Fuer den Tiefstpreis ueber alle Shops muss dasselbe Geraet
  // wiedererkannt werden, obwohl jeder Shop es anders nennt: der
  // Herstellershop schreibt "H2D Laser Full Combo / 10W", reichelt
  // "3D Drucker, Bambu Lab H2D, 10 W Laser". Dasselbe Geraet, derselbe
  // Preisvergleich.
  //
  // Der erste passende Eintrag gewinnt, das Genauere steht deshalb oben.
  // Der letzte Eintrag faengt alles uebrige: das nackte Geraet.
  varianten: [
    ['laser40',    /\b40\s*w\b/i,                   'H2D Laser 40 W'],
    ['laser10',    /\b10\s*w\b/i,                   'H2D Laser 10 W'],
    ['laser',      /laser/i,                        'H2D Laser'],
    ['combo-dual', /\bdual\s*ams\b/i,               'H2D AMS Combo (Dual AMS 2 Pro)'],
    ['combo-ht',   /\bams\s*ht\b|\bht\s*bundle\b/i, 'H2D AMS Combo (AMS HT)'],
    ['combo',      /\bams\b|\bcombo\b/i,            'H2D AMS Combo'],
    ['basis',      /./,                             'H2D']
  ],

  // "Pro" zaehlt getrennt, sonst wuerde ein Pro-Geraet den Tiefstpreis des
  // einfachen Modells setzen. Wortnah gepruefte Stelle: "AMS 2 Pro" im
  // Bundle-Namen ist nicht das Pro-Modell.
  proRe: /h2d\s*pro\b/i,

  // Gebrauchtes und Neuware nie in einen Topf: der Herstellershop fuehrt
  // aufgearbeitete Geraete mit im Sortiment.
  gebrauchtRe: /\brefurb|\bb-?ware\b|\bgebraucht\b|\bopen\s*box\b/i,

  // Plausible Preisspanne eines Geraets in Cent. Das ist der wirksamere der
  // beiden Filter: Duesen kosten zweistellig, Drucker vierstellig.
  //
  // Gemessen am 26.09.2026: das billigste Geraet stand bei 1.549, das
  // teuerste (H2D Pro) bei 2.949. Die Spanne ist mit Absicht weit, damit
  // auch eine ungewoehnlich tiefe Aktion noch hineinfaellt.
  preisMin: 80000,             //    800 EUR
  preisMax: 900000,            //  9.000 EUR

  // Welche Shops laufen. Zum Abschalten auf false setzen.
  // Weitere Shops stehen in shops.js; welche davon ein Runner ueberhaupt
  // lesen kann, zeigt "node diag.js".
  aktiv: { bambulab: true, reichelt: true },

  // --- Signal 1: Preis ---------------------------------------------------
  // Gemessen wird gegen den Median der letzten Laeufe, nicht gegen gestern:
  // ein einzelner Fehlgriff beim Parsen soll keinen Alarm ausloesen.
  baselineLaeufe: 14,
  preisSprungProzent: 4,       // ab -4 % gegen den Median wird gemeldet
  bestpreisMelden: true,       // Tiefstand in diesem Shop meldet immer

  // Der Tiefstpreis ueber alle Shops. Das ist die Meldung, auf die es
  // ankommt: billiger als alles, was der Watcher fuer dieses Geraet je
  // gesehen hat - unabhaengig davon, welcher Shop es damals war. Sie geht
  // mit hoechster Prioritaet raus und wird von der Meldebremse nie
  // zurueckgehalten.
  tiefstpreisMelden: true,

  // Dieselbe Preissenkung nur einmal melden. Erst wenn der Preis noch
  // tiefer faellt, kommt die naechste Nachricht - sonst pusht ein zwei
  // Wochen laufender Sale jeden Morgen aufs Neue.
  nurTieferMelden: true,

  // --- Signal 2: ausgewiesener Rabatt ------------------------------------
  // Streichpreis im Shop. Der Bambu-Shop schreibt ihn als
  // StrikethroughPrice in seinen JSON-LD-Block, Haendler fuehren ihn
  // praktisch nie - dort greift nur Signal 1.
  rabattMinProzent: 5,

  // --- Signal 3: beworbene Kampagne --------------------------------------
  // Ein Banner meldet sich, sobald er neu ist. Danach erst wieder, wenn er
  // laenger als diese Frist verschwunden war.
  kampagneStillTage: 30,
  // Hardware wird selten zweistellig rabattiert. 20 % wie bei Bekleidung
  // waere hier zu hoch angesetzt - dann bliebe der Watcher stumm.
  kampagneMinProzent: 10,

  // --- Signal 4: Lieferbarkeit ------------------------------------------
  // Wieder-verfuegbar ist bei einem gefragten Drucker eine eigene Nachricht.
  verfuegbarkeitMelden: true,

  // Eine neu aufgetauchte Variante melden (etwa ein Pro-Modell). Nur, wenn
  // der Shop vorher schon Daten geliefert hat - beim ersten Lauf sind alle
  // elf Varianten neu, und niemand will elf Nachrichten auf einmal.
  neueVariantenMelden: true
};
