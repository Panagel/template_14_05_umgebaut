// Diagnose der Ticketwache: was liefert welche Quelle von diesem Netz aus,
// und in welchen Worten?
//
// Warum das eine eigene Datei ist: die Wache haengt an zwei Dingen, die sich
// nicht erraten lassen - ob eine Seite ueberhaupt antwortet (Ticketportale
// sperren Cloud-IPs, genau wie die Preisvergleicher beim Preiswatcher) und
// wie sie ihre Karten ankuendigt ("ab sofort", "hat begonnen", "startet am").
// Dieser Lauf zeigt beides im Klartext. Was hier gut liest, gehoert in
// ticket-config.js unter quellenAktiv; welche Formulierung noch fehlt, steht
// als Satz in der Ausgabe.
//
// Von Hand starten: Workflow "Feuertanz-Quellendiagnose".
const { get, textOf } = require('./lib.js');
const { saetze, datenAusText, eventsAusSeite, heute } = require('./ticket-quellen.js');
const CFG = require('./ticket-config.js');

// [Gruppe, [Beschriftung, URL], ...]
//
// Die Kandidaten stehen mit drin, weil sich das aendert: nimmt ein Portal
// das Festival auf oder lockert seine Sperre, faellt es beim naechsten Lauf
// hier auf - dann genuegt ein Eintrag in ticket-config.js.
const ZIELE = [
  ['aktiv: Veranstalterseite',
    ['Startseite',            'https://www.feuertanz-festival.com/'],
    ['Tickets',               'https://www.feuertanz-festival.com/tickets.html'],
    ['Programm',              'https://www.feuertanz-festival.com/programm.html'],
    ['Festival',              'https://www.feuertanz-festival.com/festival.html'],
    ['robots.txt',            'https://www.feuertanz-festival.com/robots.txt'],
    ['Sitemap',               'https://www.feuertanz-festival.com/sitemap.xml']],

  ['aktiv: Veranstalter und Portale',
    ['Concertbuero Franken',  'https://www.concertbuero-franken.de/'],
    ['Eventim (Kuenstler)',   'https://www.eventim.de/artist/feuertanz-festival/'],
    ['Reservix (Burg)',       'https://www.reservix.de/abenberg/venue/burg-abenberg/v15023']],

  ['Kandidaten: weitere Adressen derselben Quellen',
    ['ohne www',              'https://feuertanz-festival.com/'],
    ['.de statt .com',        'https://www.feuertanz-festival.de/'],
    ['News',                  'https://www.feuertanz-festival.com/news.html'],
    ['Concertbuero Konzerte', 'https://www.concertbuero-franken.de/konzerte.html'],
    ['Eventim Suche',         'https://www.eventim.de/search/?searchterm=feuertanz'],
    ['ticketonline',          'https://www.ticketonline.de/artist/feuertanz-festival/'],
    ['fanSALE (Zweitmarkt)',  'https://www.fansale.de/tickets/all/feuertanz-festival/476186']],

  ['Kandidaten: Dritte, die den Termin fuehren',
    ['Burg Abenberg',         'https://www.burg-abenberg.de/termine.htm'],
    ['festivalhopper',        'https://www.festivalhopper.de/festival/feuertanz-festival'],
    ['festival-alarm',        'https://www.festival-alarm.com/de/Festivals/Feuertanz-Festival'],
    ['metalcrew',             'https://www.metalcrew.de/community/calendar/event/5634-feuertanz-festival/'],
    ['mittelaltermarkt',      'https://mittelaltermarkt.online/']]
];

const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
const kurz = (s, n) => String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s);

function sitemapZeilen(body) {
  const out = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(body)) && out.length < 40) out.push(m[1]);
  return out;
}

(async () => {
  console.log('Feuertanz-Quellendiagnose, ' + heute() + '\n');
  const brauchbar = [];

  for (const gruppe of ZIELE) {
    console.log('');
    console.log('== ' + gruppe[0]);
    for (let i = 1; i < gruppe.length; i++) {
      const [label, url] = gruppe[i];
      const r = await get(url, { tries: 2 });
      const text = textOf(r.body);
      console.log('');
      console.log('   ' + pad(label, 22) + 'HTTP ' + pad(r.status, 5) + pad((r.body || '').length + ' B', 12) +
                  pad(text.length + ' Zeichen', 16) + (r.url !== url ? '-> ' + r.url : ''));

      if (r.status !== 200 || !r.body) {
        console.log('      ' + (r.status === 403 ? 'gesperrt (IP-Reputation)' : r.status === 404 ? 'Adresse gibt es nicht' : 'keine Antwort'));
        continue;
      }
      if (/sitemap|robots/i.test(label)) {
        const locs = sitemapZeilen(r.body);
        if (locs.length) locs.slice(0, 20).forEach(l => console.log('      ' + l));
        else console.log('      ' + kurz(text || r.body.slice(0, 300), 240));
        continue;
      }
      if (text.length < 300) {
        console.log('      wenig sichtbarer Text - Blockseite oder JavaScript-Wall:');
        console.log('      ' + kurz(text, 200));
      }

      // schema.org
      const evs = eventsAusSeite(r.body, r.url);
      const meine = evs.filter(e => CFG.festivalRe.test([e.name, e.ort, e.url].filter(Boolean).join(' ')));
      console.log('      schema.org: ' + evs.length + ' Event(s), davon ' + meine.length + ' mit "Feuertanz"');
      for (const e of (meine.length ? meine : evs).slice(0, 6)) {
        const a = e.angebote.map(x => [x.verfuegbar || '?', x.preis !== null ? (x.preis / 100).toFixed(2) + ' ' + (x.waehrung || '') : 'kein Preis'].join(' '));
        console.log('        - ' + pad(kurz(e.name || '(ohne Namen)', 40), 42) + pad(e.von || '(kein Datum)', 13) +
                    (e.ort ? kurz(e.ort, 24) : '') + (a.length ? '  [' + a.join(' | ') + ']' : ''));
      }

      // Termine im Text
      const daten = datenAusText(text).filter(d => d.von >= heute());
      if (daten.length) {
        console.log('      Termine im Text: ' + daten.slice(0, 8).map(d => d.von + (d.bis ? '..' + d.bis.slice(8) : '')).join(', '));
      }

      // Wortlaute - der eigentliche Grund fuer diesen Lauf
      const treffer = { kaufen: [], start: [], ausverkauft: [] };
      for (const s of saetze(text)) {
        if (!CFG.ticketWortRe.test(s)) continue;
        if (CFG.ausverkauftRe.test(s)) treffer.ausverkauft.push(s);
        else if (CFG.vvkStartRe.test(s)) treffer.start.push(s);
        else if (CFG.kaufbarRe.test(s) || CFG.vvkLaeuftRe.test(s)) treffer.kaufen.push(s);
      }
      for (const art of ['kaufen', 'start', 'ausverkauft']) {
        for (const s of treffer[art].slice(0, 2)) console.log('      [' + art + '] "' + kurz(s, 150) + '"');
      }

      // Und die Saetze, in denen "Ticket" vorkommt, ohne dass ein Muster
      // griff. Genau hier stehen die Formulierungen, die noch fehlen.
      const ungedeutet = saetze(text)
        .filter(s => /ticket|karte|vorverkauf|vvk/i.test(s))
        .filter(s => !treffer.kaufen.includes(s) && !treffer.start.includes(s) && !treffer.ausverkauft.includes(s))
        .slice(0, 4);
      for (const s of ungedeutet) console.log('      [offen ] "' + kurz(s, 150) + '"');

      if (meine.length || daten.length || treffer.kaufen.length || treffer.start.length || treffer.ausverkauft.length) {
        brauchbar.push(label + '  (' + url + ')');
      }
    }
  }

  console.log('');
  console.log('== Ergebnis');
  if (!brauchbar.length) console.log('   Keine Quelle lieferte etwas Lesbares. Dann stimmt etwas mit dem Netz nicht.');
  for (const b of brauchbar) console.log('   lesbar: ' + b);
  console.log('');
  console.log('Was hier lesbar ist und noch nicht in ticket-config.js unter quellenAktiv steht,');
  console.log('gehoert dort hinein. Zeilen mit [offen ] sind Formulierungen, die die Wache noch');
  console.log('nicht deutet - passt dann kaufbarRe, vvkLaeuftRe oder vvkStartRe an.');
})().catch(e => { console.error(e); process.exit(1); });
