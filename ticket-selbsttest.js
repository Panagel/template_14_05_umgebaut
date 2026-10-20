// Selbsttest der Ticketwache, ohne Netz.
//
// Der Grund, warum es diese Datei gibt: ob die Wache die richtigen
// Nachrichten schickt, entscheidet sich nicht am Abruf, sondern an der
// Bewertung - "ausverkauft" darf ein "ab sofort" im Nachbarsatz aufheben,
// eine einmal gemeldete Kaufgelegenheit darf nicht jeden Lauf erneut
// klingeln, ein Termin aus dem Archiv ist kein Termin. Das laesst sich
// pruefen, ohne eine einzige Seite abzurufen: FEUERTANZ_FIXTURES legt
// Seiten von der Platte vor, FEUERTANZ_DATA den Zustand daneben.
//
// Laeuft in Sekunden und braucht keine Secrets:  node ticket-selbsttest.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feuertanz-test-'));
const jahr = new Date().getFullYear();
const naechstes = jahr + 1;                       // die Ausgabe, auf die es zugeht
let fehler = 0, geprueft = 0;

const dateiFuer = url => url.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]+/gi, '_') + '.html';

// Jede echte Seite hat einen Fuss mit Impressum und Kleingedrucktem. Der
// gehoert in die Buehnenseiten, weil die Wache eine Seite unter 300 Zeichen
// sichtbaren Textes fuer eine Blockseite haelt - und damit richtig liegt.
const FUSS = '<footer><p>Feuertanz Festival, Burg Abenberg. Veranstalter: Concertbuero Franken GmbH, ' +
  'Singerstrasse 26, 90443 Nuernberg. Impressum, Datenschutz, Kontakt, Anfahrt, Camping, Hausordnung, ' +
  'Barrierefreiheit, Presse, Haendleranfragen. Das Festival findet bei jedem Wetter statt. ' +
  'Alle Angaben ohne Gewaehr, Aenderungen im Programm vorbehalten.</p></footer>';

function seite(kopf, koerper) {
  return '<!doctype html><html><head><title>' + kopf + '</title></head><body>' + koerper + FUSS + '</body></html>';
}

// Und eine Seite, die antwortet, aber nichts hergibt.
function blockseite() {
  return '<!doctype html><html><head><title>Access denied</title></head><body><p>Bot check.</p></body></html>';
}

// Eine Buehne: Verzeichnis mit Seiten, eigener Zustand.
function buehne(name, seiten) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, 'fix'), { recursive: true });
  for (const [url, html] of Object.entries(seiten)) {
    fs.writeFileSync(path.join(dir, 'fix', dateiFuer(url)), html);
  }
  return dir;
}

function lauf(dir) {
  const aus = execFileSync(process.execPath, [path.join(__dirname, 'ticket-scan.js')], {
    env: Object.assign({}, process.env, {
      FEUERTANZ_FIXTURES: path.join(dir, 'fix'),
      FEUERTANZ_DATA: path.join(dir, 'data')
    }),
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'meldungen.json'), 'utf8'));
  return { log: aus, meldungen: m.meldungen, stand: m.stand };
}

function pruefe(was, bedingung, hinweis) {
  geprueft++;
  if (bedingung) { console.log('  ok    ' + was); return; }
  fehler++;
  console.log('  FEHLT ' + was + (hinweis ? '   ->  ' + hinweis : ''));
}

const typen = e => e.meldungen.map(m => m.typ);
const hat = (e, t) => typen(e).includes(t);
const von = (e, t) => e.meldungen.find(m => m.typ === t);

const O = 'https://www.feuertanz-festival.com/';
const T = 'https://www.feuertanz-festival.com/tickets.html';

// ---------------------------------------------------------------- 1
console.log('\n1. Nichts los: vergangene Ausgabe, kein neuer Termin');
{
  const d = buehne('ruhe', {
    [O]: seite('Feuertanz', '<h1>Feuertanz Festival auf Burg Abenberg</h1><p>Das Feuertanz Festival ' + (jahr) +
      ' fand am 12. und 13. Juni ' + jahr + ' statt. Vielen Dank an alle Besucher!</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Der Vorverkauf fuer ' + jahr + ' ist beendet, das Festival war ausverkauft.</p>')
  });
  const e = lauf(d);
  pruefe('kein "es gibt Karten"', !hat(e, 'kaufbar'), typen(e).join(','));
  pruefe('kein Termin gemeldet (liegt in der Vergangenheit)', !hat(e, 'termin'), typen(e).join(','));
  const e2 = lauf(d);
  pruefe('zweiter Lauf bleibt ebenso still', !hat(e2, 'kaufbar') && !hat(e2, 'termin'), typen(e2).join(','));
}

// ---------------------------------------------------------------- 2
console.log('\n2. Termin wird bekannt gegeben');
{
  const d = buehne('termin', {
    [O]: seite('Feuertanz', '<h1>Feuertanz Festival ' + naechstes + '</h1><p>Das Feuertanz Festival ' + naechstes +
      ' findet am 25. und 26. Juni ' + naechstes + ' auf Burg Abenberg statt.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Informationen zum Vorverkauf folgen in Kuerze.</p>')
  });
  const e = lauf(d);
  pruefe('Termin gemeldet', hat(e, 'termin'), typen(e).join(','));
  pruefe('Termin richtig gelesen', /25\.06\.' + naechstes + '|25\.06\./.test((von(e, 'termin') || {}).titel || ''), (von(e, 'termin') || {}).titel);
  pruefe('kein "es gibt Karten"', !hat(e, 'kaufbar'), typen(e).join(','));
  const e2 = lauf(d);
  pruefe('Termin meldet nicht zweimal', !hat(e2, 'termin'), typen(e2).join(','));
}

// ---------------------------------------------------------------- 3
console.log('\n3. Vorverkaufsstart angekuendigt (liegt in der Zukunft)');
{
  const start = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  const deutsch = start.slice(8, 10) + '.' + start.slice(5, 7) + '.' + start.slice(0, 4);
  const d = buehne('vvk', {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival ' + naechstes + ' auf Burg Abenberg: 25. und 26. Juni ' + naechstes + '.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Der Vorverkauf startet am ' + deutsch + ' um 10:00 Uhr.</p>')
  });
  const e = lauf(d);
  pruefe('Vorverkaufsstart gemeldet', hat(e, 'vorverkauf'), typen(e).join(','));
  pruefe('Startdatum in der Meldung', ((von(e, 'vorverkauf') || {}).titel || '').includes(deutsch), (von(e, 'vorverkauf') || {}).titel);
  pruefe('noch kein "es gibt Karten"', !hat(e, 'kaufbar'), typen(e).join(','));
  const e2 = lauf(d);
  pruefe('Ankuendigung meldet nicht zweimal', !hat(e2, 'vorverkauf'), typen(e2).join(','));
}

// ---------------------------------------------------------------- 4
console.log('\n4. Karten da, laut Text der offiziellen Seite');
{
  const d = buehne('kaufbar-text', {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival ' + naechstes + ': 25. und 26. Juni ' + naechstes + ', Burg Abenberg.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Die Tickets fuer das Feuertanz Festival ' + naechstes +
      ' sind ab sofort erhaeltlich.</p><p>Festivalticket 92,00 EUR.</p>')
  });
  const e = lauf(d);
  pruefe('"es gibt Karten" gemeldet', hat(e, 'kaufbar'), typen(e).join(','));
  pruefe('Meldung nennt den Termin', /25\.06\./.test(JSON.stringify(von(e, 'kaufbar') || {})), (von(e, 'kaufbar') || {}).titel);
  pruefe('Meldung sagt, dass es ein Textbefund ist',
    JSON.stringify((von(e, 'kaufbar') || {}).gruende || []).includes('Seitentext'), 'Hinweis fehlt');
  pruefe('Kauflink dabei', ((von(e, 'kaufbar') || {}).links || []).length > 0, 'keine Links');
  const e2 = lauf(d);
  pruefe('meldet nicht jeden Lauf erneut', !hat(e2, 'kaufbar'), typen(e2).join(','));
}

// ---------------------------------------------------------------- 5
console.log('\n5. Karten da, laut Datenblock eines Shops');
{
  const E = 'https://www.eventim.de/artist/feuertanz-festival/';
  const ld = {
    '@context': 'https://schema.org', '@type': 'MusicEvent',
    name: 'Feuertanz Festival ' + naechstes,
    startDate: naechstes + '-06-25', endDate: naechstes + '-06-26',
    location: { '@type': 'Place', name: 'Burg Abenberg', address: { '@type': 'PostalAddress', addressLocality: 'Abenberg' } },
    url: 'https://www.eventim.de/event/feuertanz-festival-4711/',
    offers: { '@type': 'AggregateOffer', lowPrice: '92.00', priceCurrency: 'EUR',
              availability: 'https://schema.org/InStock', url: 'https://www.eventim.de/event/feuertanz-festival-4711/' }
  };
  const d = buehne('kaufbar-shop', {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival auf Burg Abenberg. Informationen folgen.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Informationen zum Vorverkauf folgen.</p>'),
    [E]: seite('Eventim', '<script type="application/ld+json">' + JSON.stringify(ld) + '</script><h1>Feuertanz Festival</h1>')
  });
  const e = lauf(d);
  pruefe('"es gibt Karten" gemeldet', hat(e, 'kaufbar'), typen(e).join(','));
  pruefe('Preis aus dem Datenblock in der Meldung',
    JSON.stringify(von(e, 'kaufbar') || {}).includes('92,00'), JSON.stringify((von(e, 'kaufbar') || {}).produkte || []));
  pruefe('Termin aus dem Datenblock gemeldet', hat(e, 'termin'), typen(e).join(','));
  pruefe('Shop-Link als Ziel', /eventim/.test((von(e, 'kaufbar') || {}).url || ''), (von(e, 'kaufbar') || {}).url);
}

// ---------------------------------------------------------------- 6
console.log('\n6. Ausverkauft schlaegt den Wortlaut im Nachbarsatz');
{
  const d = buehne('ausverkauft', {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival ' + naechstes + ': 25. und 26. Juni ' + naechstes + ', Burg Abenberg.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Tickets sind im Vorverkauf erhaeltlich.</p>' +
      '<p>Das Feuertanz Festival ' + naechstes + ' ist ausverkauft.</p>')
  });
  const e = lauf(d);
  pruefe('"ausverkauft" gemeldet', hat(e, 'ausverkauft'), typen(e).join(','));
  pruefe('kein "es gibt Karten"', !hat(e, 'kaufbar'), typen(e).join(','));
}

// ---------------------------------------------------------------- 7
console.log('\n7. Rueckkehr in den Verkauf nach ausverkauft');
{
  const R = 'https://www.reservix.de/abenberg/venue/burg-abenberg/v15023';
  const d = buehne('rueckkehr', {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival ' + naechstes + ': 25. und 26. Juni ' + naechstes + ', Burg Abenberg.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Das Feuertanz Festival ' + naechstes + ' ist ausverkauft.</p>')
  });
  const e = lauf(d);
  pruefe('erst ausverkauft', hat(e, 'ausverkauft'), typen(e).join(','));

  // Jetzt weist ein Shop wieder Karten aus - Rueckgaben kommen zurueck in
  // den Verkauf. Der Shop schlaegt den Text von gestern.
  const ld = {
    '@context': 'https://schema.org', '@type': 'Event', name: 'Feuertanz Festival',
    startDate: naechstes + '-06-25',
    location: { '@type': 'Place', name: 'Burg Abenberg' },
    url: R, offers: { '@type': 'Offer', price: '99.00', priceCurrency: 'EUR', availability: 'InStock', url: R }
  };
  fs.writeFileSync(path.join(d, 'fix', dateiFuer(R)),
    seite('Reservix', '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>'));
  const e2 = lauf(d);
  pruefe('dann "es gibt Karten"', hat(e2, 'kaufbar'), typen(e2).join(','));
}

// ---------------------------------------------------------------- 8
console.log('\n8. Ticketseite umformuliert, ohne erkennbare Kaufgelegenheit');
{
  const d = buehne('aenderung', {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival auf Burg Abenberg.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Informationen zum Vorverkauf folgen in Kuerze.</p>')
  });
  const e = lauf(d);
  pruefe('erster Lauf meldet keine Aenderung (keine Vorgeschichte)', !hat(e, 'aenderung'), typen(e).join(','));
  fs.writeFileSync(path.join(d, 'fix', dateiFuer(T)),
    seite('Tickets', '<h1>Tickets</h1><p>Die Kartenkontingente werden neu geordnet, Details folgen.</p>'));
  const e2 = lauf(d);
  pruefe('geaenderter Satz meldet sich', hat(e2, 'aenderung'), typen(e2).join(','));
  pruefe('neuer Satz steht in der Meldung',
    JSON.stringify((von(e2, 'aenderung') || {}).gruende || []).includes('Kartenkontingente'), 'Satz fehlt');
}

// ---------------------------------------------------------------- 8b
console.log('\n8b. Deutsche Datumsschreibweisen');
{
  const { datenAusText } = require('./ticket-quellen.js');
  const proben = [
    ['Das Festival findet am 11.+12. Juni 2027 statt.', '2027-06-11', '2027-06-12'],
    ['11.06.2027 - 12.06.2027 - Abenberg', '2027-06-11', '2027-06-12'],
    ['Termin: 12. und 13. Juni 2027', '2027-06-12', '2027-06-13'],
    ['25.-26.06.2027 auf Burg Abenberg', '2027-06-25', '2027-06-26'],
    ['Vom 30. Mai bis 1. Juni 2027', '2027-05-30', '2027-06-01'],
    ['Beginn 2027-06-11', '2027-06-11', null],
    ['Am 13. Juni 2027 ab 14 Uhr', '2027-06-13', null],
    ['Der 31.02.2027 gibt es nicht', null, null]
  ];
  for (const [satz, von, bis] of proben) {
    const d = datenAusText(satz)[0] || {};
    pruefe('"' + satz.slice(0, 46) + '" -> ' + (von || 'nichts'),
      (d.von || null) === von && (d.bis || null) === bis, JSON.stringify(d));
  }
}

// ---------------------------------------------------------------- 9
console.log('\n9. Wortlaute: kaufen, warten, ausverkauft auseinanderhalten');
{
  const CFG = require('./ticket-config.js');
  const proben = [
    ['Der Vorverkauf fuer das Feuertanz Festival ' + naechstes + ' hat begonnen.', 'kauf'],
    ['Der Vorverkauf ist gestartet!', 'kauf'],
    ['Die Tickets sind ab sofort erhaeltlich.', 'kauf'],
    ['Karten gibt es ab sofort im Ticketshop.', 'kauf'],
    ['Jetzt Tickets sichern!', 'kauf'],
    ['Der Vorverkauf startet am 01.12.' + jahr + ' um 10:00 Uhr.', 'start'],
    ['Tickets ab 1. Dezember ' + jahr + '.', 'start'],
    ['Das Festival ist ausverkauft.', 'aus'],
    ['Hier geht es zu den Tickets.', 'keins'],
    ['Tickets', 'keins'],
    // Die vier Zeilen stehen so auf den echten Seiten, gemessen am
    // 20.10.2026. Die erste ist der Grund, warum es preisHinweisRe gibt;
    // die zweite der Grund, warum das Fenster in kaufbarRe 80 Zeichen hat;
    // die dritte stand bei Eventim, waehrend der Veranstalter verkaufte.
    ['Vorverkauf: 122,00 € | Abendkasse: tba €', 'kauf'],
    ['Tickets sind bundesweit an allen CTS Eventim Vorverkaufsstellen erhaeltlich.', 'kauf'],
    ['Aktuell scheinen keine Termine im Vorverkauf zu sein.', 'keins'],
    ['Vorverkauf: 3,00 EUR', 'keins'],
    ['Programmheft: 3,00 EUR', 'keins'],
    // Und diese vier standen am 20.10.2026 woertlich auf den echten Seiten.
    // Die ersten beiden haetten Fehlalarm ausgeloest: ein Rueckblick auf
    // vergangene Jahre und das "AUSVERKAUFT" eines anderen Konzerts.
    ['Tickets und weitere Informationen I n den letzten Jahren ging das Feuertanz Festival regelmaessig und schnell "Sold Out".', 'keins'],
    ['Hirsch AUSVERKAUFT 25.10.2026 20:00-23:59 EISI GULP Nuernberg', 'aus'],
    ['Ticket kaufen Fuer Vorabinfos, neue Acts & mehr:', 'keins'],
    ['Euer Eric Jetzt Ticket sichern!', 'kauf']
  ];
  const { preisHinweis } = require('./ticket-quellen.js');
  for (const [satz, soll] of proben) {
    // Dieselbe Reihenfolge wie im Lauf: der Rueckblick zuerst.
    if (CFG.rueckblickRe.test(satz)) {
      pruefe('"' + satz.slice(0, 52) + '" -> keins (Rueckblick)', soll === 'keins', 'soll ' + soll);
      continue;
    }
    const kauf = CFG.kaufbarRe.test(satz) || CFG.vvkLaeuftRe.test(satz) || !!preisHinweis(satz);
    const start = CFG.vvkStartRe.test(satz);
    const aus = CFG.ausverkauftRe.test(satz);
    // "Vorverkauf ist gestartet" trifft beide Muster - entschieden wird im
    // Lauf am Datum. Hier zaehlt nur, dass der Kaufhinweis erkannt wird.
    const ist = aus ? 'aus' : (kauf ? 'kauf' : (start ? 'start' : 'keins'));
    pruefe('"' + satz.slice(0, 52) + '" -> ' + soll, ist === soll, 'gelesen als ' + ist);
  }
}

// --------------------------------------------------------------- 10
console.log('\n10. "Vorverkauf hat begonnen" auf der offiziellen Seite');
{
  const d = buehne('begonnen', {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival ' + naechstes + ': 25. und 26. Juni ' + naechstes + ', Burg Abenberg.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Der Vorverkauf fuer das Feuertanz Festival ' + naechstes +
      ' hat begonnen. Festivaltickets ab 92,00 EUR.</p>')
  });
  const e = lauf(d);
  pruefe('"es gibt Karten" gemeldet', hat(e, 'kaufbar'), typen(e).join(','));
  pruefe('der Satz steht in der Meldung',
    JSON.stringify((von(e, 'kaufbar') || {}).gruende || []).includes('hat begonnen'), 'Satz fehlt');
  pruefe('Termin steht im Titel', /25\.06\./.test((von(e, 'kaufbar') || {}).titel || ''), (von(e, 'kaufbar') || {}).titel);
}

// --------------------------------------------------------------- 11
console.log('\n11. Ruhe kostet keinen Commit');
{
  // Alle vier Quellen liefern, nichts aendert sich: ab dem zweiten Lauf darf
  // der Zustand nicht mehr geschrieben werden. Zweimal pro Stunde ein
  // Commit waere sonst ein Dutzend am Tag.
  const ruhig = {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival auf Burg Abenberg. Termin folgt.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Informationen zum Vorverkauf folgen.</p>'),
    ['https://www.feuertanz-festival.com/programm.html']: seite('Programm', '<p>Programm folgt.</p>'),
    ['https://www.feuertanz-festival.com/festival.html']: seite('Festival', '<p>Burg Abenberg.</p>'),
    ['https://www.concertbuero-franken.de/']: seite('CBF', '<p>Konzerte in Franken.</p>'),
    ['https://www.concertbuero-franken.de/konzerte.html']: seite('CBF', '<p>Konzerte.</p>'),
    ['https://www.eventim.de/artist/feuertanz-festival/']: seite('Eventim', '<p>Feuertanz Festival - keine Termine im Vorverkauf.</p>'),
    ['https://www.reservix.de/abenberg/venue/burg-abenberg/v15023']: seite('Reservix', '<p>Burg Abenberg - keine Veranstaltungen.</p>')
  };
  const d = buehne('ruhig', ruhig);
  lauf(d);
  const e2 = lauf(d);
  pruefe('zweiter Lauf schreibt den Zustand nicht neu', /Zustand unveraendert/.test(e2.log),
    (e2.log.match(/Zustand [a-z]+/i) || ['?'])[0]);

  // Und dasselbe, wenn ein Portal dauerhaft sperrt: eine Blockseite ist
  // keine gelesene Seite, der Ausfallzaehler laeuft in eine Obergrenze, und
  // danach ist wieder Ruhe.
  fs.writeFileSync(path.join(d, 'fix', dateiFuer('https://www.eventim.de/artist/feuertanz-festival/')), blockseite());
  const eBlock = lauf(d);
  pruefe('Blockseite gilt als nicht lesbar', /nicht lesbar/.test(eBlock.log), 'kein Hinweis im Log');
  let letzter = null;
  for (let i = 0; i < 16; i++) letzter = lauf(d);
  pruefe('dauerhaft gesperrtes Portal beruhigt sich', /Zustand unveraendert/.test(letzter.log),
    (letzter.log.match(/Zustand [a-z]+/i) || ['?'])[0]);
  pruefe('und meldet nicht bei jedem Lauf', !hat(letzter, 'ausfall'), typen(letzter).join(','));
}

// --------------------------------------------------------------- 12
console.log('\n12. Karten zuerst, Termin spaeter - klingelt nur einmal');
{
  // Der Fall, wenn die Wache mitten im Vorverkauf eingerichtet wird: die
  // Ticketseite verkauft schon, den Termin nennt sie noch nicht.
  const d = buehne('ohne-termin', {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival auf Burg Abenberg.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Der Vorverkauf hat begonnen, Tickets ab 92,00 EUR.</p>')
  });
  const e = lauf(d);
  pruefe('"es gibt Karten" gemeldet, obwohl der Termin fehlt', hat(e, 'kaufbar'), typen(e).join(','));
  pruefe('Titel sagt nicht mehr, als bekannt ist',
    !/\d{2}\.\d{2}\.\d{4}/.test((von(e, 'kaufbar') || {}).titel || ''), (von(e, 'kaufbar') || {}).titel);

  // Jetzt wird der Termin nachgereicht.
  fs.writeFileSync(path.join(d, 'fix', dateiFuer(O)),
    seite('Feuertanz', '<p>Das Feuertanz Festival ' + naechstes + ' findet am 25. und 26. Juni ' + naechstes + ' auf Burg Abenberg statt.</p>'));
  const e2 = lauf(d);
  pruefe('Termin wird gemeldet', hat(e2, 'termin'), typen(e2).join(','));
  pruefe('aber "es gibt Karten" nicht ein zweites Mal', !hat(e2, 'kaufbar'), typen(e2).join(','));
  pruefe('Stand steht unter der Jahreszahl, nicht unter "offen"',
    e2.stand.length === 1 && e2.stand[0].ausgabe === String(naechstes),
    JSON.stringify(e2.stand));
  pruefe('und die Karten gelten weiter als zu haben',
    e2.stand[0] && e2.stand[0].karten === 'zu haben', JSON.stringify(e2.stand));
}

// --------------------------------------------------------------- 13
console.log('\n13. Preiszeile zaehlt nur mit einem Termin, der noch kommt');
{
  // So sieht die Detailseite des Veranstalters aus: eine Seite je Ausgabe,
  // Termin und Preiszeile. Die Archivseite der vergangenen Ausgabe traegt
  // dieselbe Zeile - und darf keine Kaufmeldung ausloesen.
  const detail = (datum, preis) => seite('Concertbuero',
    '<h1>FEUERTANZ FESTIVAL</h1><p>' + datum + ' - Abenberg - Burg Abenberg</p>' +
    '<p>Vorverkauf: ' + preis + ' | Abendkasse: tba €</p><p>Stehplatzveranstaltung.</p>');

  const archiv = buehne('preiszeile-archiv', {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival auf Burg Abenberg.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Informationen folgen.</p>'),
    ['https://www.concertbuero-franken.de/']: seite('CBF',
      '<p>Konzerte in Franken.</p><a href="/konzert-details/feuertanz-festival.html">Feuertanz Festival</a>'),
    ['https://www.concertbuero-franken.de/konzert-details/feuertanz-festival.html']:
      detail('13.06.' + (jahr - 1) + ' - 14.06.' + (jahr - 1), '92,00 €')
  });
  const e = lauf(archiv);
  pruefe('Preiszeile der vergangenen Ausgabe meldet nichts', !hat(e, 'kaufbar'), typen(e).join(','));
  pruefe('und der Lauf sagt, dass er sie uebergangen hat',
    /Preiszeile ohne kuenftigen Termin/.test(e.log), 'kein Hinweis im Log');

  const aktuell = buehne('preiszeile-aktuell', {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival auf Burg Abenberg.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Informationen folgen.</p>'),
    ['https://www.concertbuero-franken.de/']: seite('CBF',
      '<p>Konzerte in Franken.</p><a href="/konzert-details/feuertanz-festival-' + naechstes + '.html">Feuertanz Festival ' + naechstes + '</a>'),
    ['https://www.concertbuero-franken.de/konzert-details/feuertanz-festival-' + naechstes + '.html']:
      detail('11.06.' + naechstes + ' - 12.06.' + naechstes, '122,00 €')
  });
  const e2 = lauf(aktuell);
  pruefe('Preiszeile der kommenden Ausgabe meldet Karten', hat(e2, 'kaufbar'), typen(e2).join(','));
  pruefe('Termin wird mitgemeldet', hat(e2, 'termin'), typen(e2).join(','));
  pruefe('Termin richtig gelesen', /11\.06\./.test((von(e2, 'termin') || {}).titel || ''), (von(e2, 'termin') || {}).titel);
}

// --------------------------------------------------------------- 14
console.log('\n14. Fremde Konzerte auf der Terminliste des Veranstalters');
{
  // Nachgebaut aus dem, was am 20.10.2026 wirklich auf
  // concertbuero-franken.de stand: eine Liste, in der neben dem Festival
  // andere Konzerte stehen - mit deren "AUSVERKAUFT".
  const d = buehne('fremde-konzerte', {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival: 11.+12. Juni ' + naechstes + ', Burg Abenberg.</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Zum Ticket-Shop.</p>'),
    ['https://www.concertbuero-franken.de/']: seite('CBF',
      '<p>Hirsch AUSVERKAUFT 25.10.' + jahr + ' 20:00 EISI GULP Nuernberg</p>' +
      '<p>Z-Bau AUSVERKAUFT 30.10.' + jahr + ' 20:00 THE NEW ROSES Nuernberg</p>' +
      '<a href="/konzert-details/feuertanz-festival-' + naechstes + '.html">FEUERTANZ FESTIVAL ' + naechstes + '</a>'),
    ['https://www.concertbuero-franken.de/konzert-details/feuertanz-festival-' + naechstes + '.html']: seite('CBF',
      '<h1>FEUERTANZ FESTIVAL ' + naechstes + '</h1><p>11.06.' + naechstes + ' - 12.06.' + naechstes + ' - Burg Abenberg</p>' +
      '<p>Vorverkauf: 122,00 € | Abendkasse: tba €</p>')
  });
  const e = lauf(d);
  pruefe('kein "ausverkauft" wegen fremder Konzerte', !hat(e, 'ausverkauft'), typen(e).join(','));
  pruefe('keine Ausgabe ' + jahr + ' erfunden',
    !e.stand.some(s => s.ausgabe === String(jahr)), JSON.stringify(e.stand));
  pruefe('die Karten der eigenen Ausgabe werden gemeldet', hat(e, 'kaufbar'), typen(e).join(','));
}

// --------------------------------------------------------------- 15
console.log('\n15. Rueckblick der Veranstalterseite macht kein "ausverkauft"');
{
  // Der Satz steht so auf festival.html, gemessen am 20.10.2026 - waehrend
  // der Vorverkauf lief.
  const d = buehne('rueckblick', {
    [O]: seite('Feuertanz', '<p>Feuertanz Festival: 11.+12. Juni ' + naechstes + ', Burg Abenberg.</p>' +
      '<p>Euer Eric Jetzt Ticket sichern!</p>'),
    [T]: seite('Tickets', '<h1>Tickets</h1><p>Tickets und weitere Informationen. ' +
      'I n den letzten Jahren ging das Feuertanz Festival regelmaessig und schnell "Sold Out". ' +
      'Abonniere unseren Newsletter.</p>')
  });
  const e = lauf(d);
  pruefe('kein "ausverkauft"', !hat(e, 'ausverkauft'), typen(e).join(','));
  pruefe('und der Kaufhinweis bleibt wirksam', hat(e, 'kaufbar'), typen(e).join(','));
  pruefe('der Lauf sagt, dass er den Rueckblick erkannt hat',
    /Rueckblick, nicht als Lage gewertet/.test(e.log), 'kein Hinweis im Log');
}

console.log('\n' + (fehler ? 'FEHLER: ' + fehler + ' von ' + geprueft + ' Pruefungen nicht erfuellt'
                            : 'Alle ' + geprueft + ' Pruefungen erfuellt') + '  (' + tmp + ')');
process.exit(fehler ? 1 : 0);
