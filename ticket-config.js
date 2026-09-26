// Schwellen und Filter der Feuertanz-Ticketwache. Hier drehst du, wie laut
// sie ist und wo sie hinschaut.
module.exports = {
  // --- Was beobachtet wird ----------------------------------------------
  festival: 'Feuertanz Festival',
  ort: 'Burg Abenberg',

  // Der Name muss das Festival nennen. "Feuer Tanz" getrennt kommt in
  // Programmheften vor, deshalb ist die Luecke erlaubt.
  festivalRe: /feuer\s?tanz/i,

  // Nicht verwechseln: derselbe Veranstalter fuehrt das Funkentanz-Festival
  // an einem anderen Ort. Wer hier passt, ist nicht gemeint.
  nichtRe: /funkentanz|feuertanz\s*events\b(?!.*abenberg)/i,

  // Der Ort dient als Bestaetigung, nicht als Pflicht: die offizielle Seite
  // nennt Abenberg auf jeder Unterseite, ein Ticketshop manchmal nur im
  // Veranstaltungsort-Feld.
  ortRe: /abenberg/i,

  // Wie weit nach vorn geschaut wird. Ein Termin, der weiter weg liegt, ist
  // eher eine Zahl im Impressum als eine Ausgabe des Festivals.
  jahreVoraus: 2,

  // Das Festival lag bisher immer im Juni (2025: 13./14., 2026: 12./13.).
  // Das ist ein Hinweis zur Einordnung, kein Filter - ein Termin in einem
  // anderen Monat wird gemeldet und dabei als ungewoehnlich gekennzeichnet.
  monateUeblich: [6],

  // --- Woher die Angaben kommen -----------------------------------------
  // Zum Abschalten auf false setzen. Was eine Quelle von einem Runner aus
  // ueberhaupt hergibt, zeigt "node ticket-diag.js".
  quellenAktiv: {
    offiziell: true,
    concertbuero: true,
    eventim: true,
    reservix: true
  },

  // --- Wortlaute ---------------------------------------------------------
  // Ein Satz, der so klingt, heisst: es gibt Karten. Absichtlich eng
  // gefasst - das blosse Wort "Tickets" steht in jeder Navigationsleiste und
  // sagt nichts darueber, ob gerade etwas zu kaufen ist.
  kaufbarRe: new RegExp([
    'vorverkauf\\s+(?:hat\\s+begonnen|l[aä]uft|ist\\s+er[oö]ffnet|gestartet)',
    '|(?:tickets?|karten|vvk)[^.!?]{0,40}\\bab\\s+sofort\\b',
    '|\\bab\\s+sofort\\b[^.!?]{0,40}(?:tickets?|karten|erh[aä]ltlich)',
    '|(?:tickets?|karten)[^.!?]{0,30}(?:sind\\s+)?(?:jetzt\\s+)?(?:erh[aä]ltlich|verf[uü]gbar|im\\s+vorverkauf|zu\\s+haben)',
    '|jetzt\\s+(?:tickets?|karten)\\s+(?:sichern|kaufen|bestellen|holen)',
    '|(?:tickets?|karten)\\s+(?:jetzt\\s+)?(?:sichern|kaufen|bestellen)',
    '|in\\s+den\\s+warenkorb|zur\\s+kasse|tickets?\\s+w[aä]hlen',
    '|\\bpresale\\s+(?:is\\s+)?(?:live|open|started)|tickets?\\s+on\\s+sale'
  ].join(''), 'i'),

  // Gegenprobe. Steht das im selben Satz, zaehlt der Satz nicht als
  // Kaufhinweis - "Tickets sind erhaeltlich, Samstag ist ausverkauft" ist
  // keine Kaufgelegenheit fuer Samstag.
  ausverkauftRe: /ausverkauft|sold\s?out|vergriffen|keine\s+(?:tickets?|karten)\s+mehr|restkarten\s+aufgebraucht/i,

  // Der Vorverkauf laeuft schon. Zaehlt wie ein Kaufhinweis - und muss
  // getrennt von der Ankuendigung stehen, weil beide dieselben Woerter
  // benutzen: "Vorverkauf ist gestartet" heisst kaufen, "Vorverkauf startet
  // am 1.12." heisst warten. Unterscheiden laesst sich das nicht am Verb,
  // sondern daran, ob ein Datum dabeisteht, das noch kommt.
  vvkLaeuftRe: new RegExp([
    'vorverkauf[^.!?]{0,60}(?:hat\\s+begonnen|ist\\s+gestartet|gestartet|l[aä]uft|ist\\s+er[oö]ffnet|er[oö]ffnet|ist\\s+angelaufen|ist\\s+da)',
    '|(?:tickets?|karten)[^.!?]{0,30}(?:sind\\s+)?im\\s+vorverkauf',
    '|(?:tickets?|karten)[^.!?]{0,20}(?:gibt\\s+es|sind)\\s+(?:jetzt|nun|ab\\s+sofort)'
  ].join(''), 'i'),

  // Angekuendigter Vorverkaufsstart. Das ist die Nachricht, mit der man sich
  // den Wecker stellt - deshalb ein eigenes Signal. Als Ankuendigung zaehlt
  // sie nur mit einem Datum, das noch kommt.
  vvkStartRe: new RegExp([
    'vorverkauf[^.!?]{0,40}(?:startet|beginnt|start|beginn)',
    '|(?:vvk|ticket)[-\\s]?(?:start|beginn)',
    '|(?:tickets?|karten)[^.!?]{0,20}(?:gibt\\s+es|es\\s+gibt)[^.!?]{0,20}\\bab\\s+dem?\\b',
    '|(?:tickets?|karten)\\s+ab\\s+(?:dem\\s+)?\\d{1,2}\\.',
    '|presale\\s+(?:starts|begins)'
  ].join(''), 'i'),

  // Alles, was ueberhaupt mit Karten zu tun hat. Dient nur dazu, die
  // Saetze auszuwaehlen, deren Aenderung beobachtet wird.
  ticketWortRe: /tickets?|karten|vvk|vorverkauf|eintritt|presale|ausverkauft/i,

  // Ist ein angekuendigter Vorverkaufsstart verstrichen, gilt der Satz
  // selbst als Kaufhinweis - so viele Tage lang. Danach ist er
  // vermutlich eine Altlast aus dem Vorjahr und zaehlt nicht mehr.
  vvkFrischTage: 7,

  // --- Plausible Kartenpreise (in Cent) ---------------------------------
  // Darunter liegen Programmhefte und Parkplaetze, darueber Reisepakete und
  // Ritteressen fuer Gruppen. Beides ist kein Festivalticket.
  preisMin: 1500,              //     15 EUR
  preisMax: 50000,             //    500 EUR

  // --- Welche Signale melden dürfen -------------------------------------
  kaufbarMelden: true,         // Signal 1: es gibt Karten (urgent)
  terminMelden: true,          // Signal 2: Termin steht oder aendert sich
  vvkStartMelden: true,        // Signal 3: Vorverkaufsstart angekuendigt
  ausverkauftMelden: true,     // Signal 4: Ausgabe ist ausverkauft
  aenderungMelden: true,       // Signal 5: Ticketseite umformuliert

  // Darf ein reiner Textbefund "kaufbar" ausloesen, oder nur ein Shop mit
  // ausgewiesener Verfuegbarkeit? true ist die frueherere, aber auch
  // irrtumsanfaelligere Meldung - und Frueh ist hier der Zweck.
  textBefundGenuegt: true,

  // Wie oft eine stumme Quelle meldet, dass sie stumm ist.
  ausfallBei: [3, 12],

  // Ab wie vielen Zeichen sichtbaren Textes eine Seite als gelesen gilt.
  // Darunter ist es keine Seite, sondern eine Blockseite oder eine
  // JavaScript-Wand: beim Preiswatcher im selben Repo antworteten Amazon mit
  // 2 242 Byte und 0 Zeichen Text, notebooksbilliger mit 32 Zeichen. Eine
  // Seite ohne Neuigkeit ist dagegen kein Ausfall - sie sagt nur nichts.
  minZeichen: 300,

  // --- Adressen ---------------------------------------------------------
  // Eine Quelle ist ein Name, eine Basis und die Seiten, die gelesen
  // werden. Mehr braucht ein Adapter nicht.
  quellen: {
    offiziell: {
      name: 'feuertanz-festival.com',
      basis: 'https://www.feuertanz-festival.com',
      seiten: ['/', '/tickets.html', '/programm.html', '/festival.html'],
      // Die Seite des Veranstalters ist die belastbare Quelle: was hier
      // steht, gilt. Shops hinken hinterher oder eilen voraus.
      leitquelle: true
    },
    concertbuero: {
      name: 'Concertbuero Franken',
      basis: 'https://www.concertbuero-franken.de',
      seiten: ['/', '/konzerte.html'],
      // Der Veranstalter listet seine Termine als Detailseiten. Welche das
      // sind, sagt die Startseite - die Adressen tragen den Namen.
      linksFolgen: true,
      maxLinks: 6
    },
    eventim: {
      name: 'Eventim',
      basis: 'https://www.eventim.de',
      seiten: ['/artist/feuertanz-festival/'],
      // Grosse Ticketportale stehen hinter einem Bot-Schutz. Antwortet es
      // nicht, ist das kein Fehler des Watchers.
      darfSchweigen: true
    },
    reservix: {
      name: 'Reservix (Burg Abenberg)',
      basis: 'https://www.reservix.de',
      seiten: ['/abenberg/venue/burg-abenberg/v15023'],
      darfSchweigen: true
    }
  }
};
