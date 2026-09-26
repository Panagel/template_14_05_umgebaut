// Quellen der Ticketwache und das Werkzeug, mit dem aus einer Seite ein
// Befund wird.
//
// Drei Wege, absteigend nach Belastbarkeit:
//
//   1. schema.org-Event mit Angebot (JSON-LD). Datum, Preis und
//      Verfuegbarkeit stehen als Felder da - so gut wird es nicht mehr.
//      Ticketportale pflegen das fuer Google, also ist es stabiler als
//      jedes Markup.
//   2. Datumsangaben im sichtbaren Text. Ein Festivaltermin steht auf jeder
//      Seite des Veranstalters, auch ohne JSON-LD.
//   3. Wortlaute im sichtbaren Text ("Vorverkauf ab sofort", "ausverkauft").
//      Satzweise ausgewertet, damit ein "ausverkauft" im Nachbarsatz einen
//      Kaufhinweis nicht stillschweigend aufhebt - und umgekehrt.
//
// Kein Weg wird vorausgesetzt. Was eine Quelle nicht hergibt, fehlt eben;
// die anderen Quellen laufen weiter.
const fs = require('fs');
const path = require('path');
const { get, textOf, unent, cents, jsonLdBloecke, linksMitModell } = require('./lib.js');
const CFG = require('./ticket-config.js');

const heute = () => new Date().toISOString().slice(0, 10);

// Abruf mit Pruefstand-Klappe: liegt FEUERTANZ_FIXTURES, werden Seiten von
// der Platte gelesen statt aus dem Netz. Nur dafuer da, die Bewertung ohne
// Netz pruefen zu koennen (siehe ticket-selbsttest.js).
async function holen(url) {
  const fix = process.env.FEUERTANZ_FIXTURES;
  if (!fix) return get(url);
  const name = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]+/gi, '_') + '.html';
  try {
    return { status: 200, body: fs.readFileSync(path.join(fix, name), 'utf8'), url: url, pruefstand: name };
  } catch (e) {
    return { status: 0, body: '', url: url, pruefstand: name, fehlt: true };
  }
}

// --------------------------------------------------------------- Saetze
// Der sichtbare Text kommt als eine Zeile ohne Absaetze. Fuer die
// Wortlaut-Pruefung muss er in Saetze zerfallen, denn die Bedeutung eines
// Kaufhinweises haengt daran, was im selben Satz steht. Ueberschriften haben
// keinen Punkt, deshalb trennen auch Listenzeichen - und ein zu langer Rest
// wird stumpf zerlegt, damit nie der ganze Seitentext als ein Satz gilt.
// Vor dem trennenden Punkt muss ein Buchstabe stehen. Sonst zerfaellt
// jede deutsche Tagesangabe: "am 25. und 26. Juni 2027" wuerde zu "am 25.",
// "und 26." und "Juni 2027" - drei Stuecke, in denen der Termin nicht mehr
// steht. Dieselbe Sorte Extrawurst, die auch der Namensfilter des
// Preiswatchers fuers Deutsche braucht.
function saetze(text) {
  const roh = String(text)
    .split(/(?<=[\p{L})"»\]][.!?:;])\s+|\s*[|•·▪●]\s*|\s{3,}/u)
    .map(s => s.trim())
    .filter(Boolean);
  const out = [];
  for (const s of roh) {
    if (s.length <= 240) { out.push(s); continue; }
    for (let i = 0; i < s.length; i += 200) out.push(s.slice(i, i + 240));
  }
  return out;
}

// --------------------------------------------------------------- Datum
const MONATE = {
  januar: 1, jan: 1, februar: 2, feb: 2, 'märz': 3, maerz: 3, mrz: 3, april: 4, apr: 4,
  mai: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9,
  sep: 9, oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12
};
const MON_RE = Object.keys(MONATE).join('|');

// Nur echte Kalendertage. Der Rueckweg durch Date faengt den 31.02. ab -
// eine Zahlenreihe, die wie ein Datum aussieht, ist noch kein Datum.
function tag(j, m, t) {
  if (!(j >= 2000 && j <= 2100) || !(m >= 1 && m <= 12) || !(t >= 1 && t <= 31)) return null;
  const iso = j + '-' + String(m).padStart(2, '0') + '-' + String(t).padStart(2, '0');
  const d = new Date(iso + 'T12:00:00Z');
  return (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso) ? iso : null;
}

const mon = w => MONATE[String(w).toLowerCase()] || null;

// Deutsche Schreibweisen, die auf Festivalseiten wirklich vorkommen:
// "13.06.2026", "12.-13.06.2026", "12. Juni 2026", "30. Mai - 1. Juni 2026",
// dazu ISO aus JSON-LD. Zeitspannen zuerst, damit "12.-13.06." nicht als
// der 13. allein durchgeht.
const DATUM_MUSTER = [
  // 2026-06-12
  { re: /(20\d\d)-(\d{1,2})-(\d{1,2})/g, bau: m => ({ von: tag(+m[1], +m[2], +m[3]) }) },
  // 12.06.2026 - 13.06.2026
  { re: /(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d\d)?\s*(?:bis|[-–—])\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d\d)/g,
    bau: m => ({ von: tag(+(m[3] || m[6]), +m[2], +m[1]), bis: tag(+m[6], +m[5], +m[4]) }) },
  // 30. Mai - 1. Juni 2026
  { re: new RegExp('(\\d{1,2})\\.?\\s*(' + MON_RE + ')\\s*(?:bis|[-–—])\\s*(\\d{1,2})\\.?\\s*(' + MON_RE + ')\\s*(20\\d\\d)', 'gi'),
    bau: m => ({ von: tag(+m[5], mon(m[2]), +m[1]), bis: tag(+m[5], mon(m[4]), +m[3]) }) },
  // 12.-13.06.2026
  { re: /(\d{1,2})\.\s*(?:bis|und|&|[-–—/])\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d\d)/g,
    bau: m => ({ von: tag(+m[4], +m[3], +m[1]), bis: tag(+m[4], +m[3], +m[2]) }) },
  // 12. und 13. Juni 2026
  { re: new RegExp('(\\d{1,2})\\.?\\s*(?:bis|und|&|[-–—/])\\s*(\\d{1,2})\\.?\\s*(' + MON_RE + ')\\s*(20\\d\\d)', 'gi'),
    bau: m => ({ von: tag(+m[4], mon(m[3]), +m[1]), bis: tag(+m[4], mon(m[3]), +m[2]) }) },
  // 13.06.2026
  { re: /(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d\d)/g, bau: m => ({ von: tag(+m[3], +m[2], +m[1]) }) },
  // 13. Juni 2026
  { re: new RegExp('(\\d{1,2})\\.?\\s*(' + MON_RE + ')\\s*(20\\d\\d)', 'gi'),
    bau: m => ({ von: tag(+m[3], mon(m[2]), +m[1]) }) }
];

// Alle Termine eines Textstuecks. Schon von einem Muster belegte Stellen
// werden nicht zweimal gelesen.
function datenAusText(s) {
  const txt = String(s);
  const belegt = [];
  const out = [];
  for (const m of DATUM_MUSTER) {
    m.re.lastIndex = 0;
    let t;
    while ((t = m.re.exec(txt))) {
      const von = t.index, bis = t.index + t[0].length;
      if (belegt.some(b => von < b[1] && bis > b[0])) continue;
      const d = m.bau(t);
      if (!d.von) continue;
      belegt.push([von, bis]);
      out.push({ von: d.von, bis: (d.bis && d.bis > d.von) ? d.bis : null, roh: t[0].trim(), pos: von });
    }
  }
  return out;
}

// --------------------------------------------------------- schema.org
const EVENT_TYP = /^(?:music|theater|social|sports|festival|screening|comedy|dance|literary|food|education|business|childrens|delivery|exhibition|hackathon|publication|sale|visualarts)?(?:event|festival)(?:series)?$/i;

function tiefeObjekte(wurzel) {
  const out = [];
  const gesehen = new Set();
  const rein = (o, t) => {
    if (!o || typeof o !== 'object' || t > 8 || gesehen.has(o)) return;
    gesehen.add(o);
    if (Array.isArray(o)) { for (const x of o) rein(x, t + 1); return; }
    out.push(o);
    for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') rein(o[k], t + 1);
  };
  rein(wurzel, 0);
  return out;
}

function typen(o) {
  const v = o && o['@type'];
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map(x => String(x).replace(/^.*[/#]/, ''));
}

const VERF_NEIN = /soldout|outofstock|discontinued/i;
const VERF_JA = /instock|presale|limitedavailability|onlineonly|instoreonly|onsiteonly/i;
const VERF_VOR = /preorder|backorder|madetoorder/i;

function verfuegbarAus(wert) {
  const a = String(wert || '');
  if (!a) return null;
  if (VERF_NEIN.test(a)) return 'nein';
  if (VERF_JA.test(a)) return 'ja';
  if (VERF_VOR.test(a)) return 'vorbestellung';
  return null;
}

// Angebote eines Events. AggregateOffer ist bei Ticketshops die Regel: die
// Preisspanne aller Kategorien. lowPrice ist dann das billigste Ticket.
function angeboteAus(event, basisUrl) {
  const out = [];
  for (const o of tiefeObjekte(event.offers)) {
    const istAngebot = typen(o).some(t => /^(?:aggregate)?offer$/i.test(t)) ||
      o.price !== undefined || o.lowPrice !== undefined || o.availability !== undefined;
    if (!istAngebot) continue;
    const preis = cents(o.price !== undefined ? o.price : (o.lowPrice !== undefined ? o.lowPrice : null));
    const verf = verfuegbarAus(o.availability);
    if (preis === null && !verf) continue;
    out.push({
      name: unent(String(o.name || o.category || '')).trim() || null,
      preis: preis,
      waehrung: o.priceCurrency ? String(o.priceCurrency).toUpperCase() : null,
      verfuegbar: verf,
      gueltigAb: o.validFrom ? String(o.validFrom).slice(0, 10) : null,
      url: o.url ? absolut(String(o.url), basisUrl) : null,
      roh: String(o.availability || '').replace(/^.*[/#]/, '') || null
    });
  }
  return out;
}

function absolut(u, basis) {
  if (!u) return null;
  if (/^https?:/i.test(u)) return u;
  try { return new URL(u, basis).href; } catch (e) { return null; }
}

function ortAus(event) {
  const namen = [];
  for (const o of tiefeObjekte(event.location)) {
    for (const f of ['name', 'addressLocality', 'streetAddress', 'addressRegion']) {
      if (typeof o[f] === 'string') namen.push(unent(o[f]).trim());
    }
  }
  if (typeof event.location === 'string') namen.push(unent(event.location).trim());
  return namen.filter(Boolean).join(', ') || null;
}

// Alle Events mit Datum aus einer Seite.
function eventsAusSeite(html, seitenUrl) {
  const out = [];
  for (const blk of jsonLdBloecke(html)) {
    for (const o of tiefeObjekte(blk)) {
      if (!typen(o).some(t => EVENT_TYP.test(t))) continue;
      const name = unent(String(o.name || '')).trim();
      const start = o.startDate ? String(o.startDate).slice(0, 10) : null;
      if (!name && !start) continue;
      const ende = o.endDate ? String(o.endDate).slice(0, 10) : null;
      out.push({
        name: name || null,
        von: /^20\d\d-\d\d-\d\d$/.test(start || '') ? start : null,
        bis: (/^20\d\d-\d\d-\d\d$/.test(ende || '') && ende !== start) ? ende : null,
        ort: ortAus(o),
        url: absolut(o.url || (o.mainEntityOfPage && o.mainEntityOfPage.url) || null, seitenUrl) || seitenUrl,
        abgesagt: /cancel/i.test(String(o.eventStatus || '')),
        angebote: angeboteAus(o, seitenUrl)
      });
    }
  }
  return out;
}

// ---------------------------------------------------- gehoert das hierher
// "Feuertanz" muss vorkommen und darf nicht das Funkentanz-Festival sein.
// Der Ort ist Bestaetigung, keine Pflicht: die offizielle Seite nennt
// Abenberg staendig, ein Shop manchmal nur im Veranstaltungsort-Feld.
function istFeuertanz(...stuecke) {
  const s = stuecke.filter(Boolean).join(' ');
  if (!s) return false;
  if (CFG.nichtRe.test(s) && !CFG.ortRe.test(s)) return false;
  return CFG.festivalRe.test(s);
}

// Nur was noch kommt, und nicht zu weit weg. Ein Termin von vorletztem Jahr
// im Archiv ist keine Kaufgelegenheit.
function istVoraus(iso) {
  if (!iso) return false;
  const h = heute();
  if (iso < h) return false;
  return +iso.slice(0, 4) <= +h.slice(0, 4) + CFG.jahreVoraus;
}

const preisPlausibel = c => c === null || (c >= CFG.preisMin && c <= CFG.preisMax);

// ------------------------------------------------------------ ein Befund
function leererBefund(key, qcfg) {
  return {
    quelle: key, name: qcfg.name, basis: qcfg.basis, leitquelle: !!qcfg.leitquelle,
    seiten: [], termine: [], angebote: [], kaufSaetze: [], ausverkauftSaetze: [],
    vvkSaetze: [], ticketSaetze: [], hinweise: []
  };
}

// Eine Seite auswerten und in den Befund einhaengen.
function seiteLesen(befund, r, qcfg) {
  const text = textOf(r.body);
  befund.seiten.push({ url: r.url, status: r.status, bytes: (r.body || '').length, zeichen: text.length });
  if (!r.body) return;

  const seiteMeint = istFeuertanz(text.slice(0, 4000), r.url) || !!qcfg.leitquelle;

  // --- schema.org
  for (const ev of eventsAusSeite(r.body, r.url)) {
    if (!istFeuertanz(ev.name, ev.ort, ev.url) && !(qcfg.leitquelle && seiteMeint)) continue;
    if (ev.abgesagt) { befund.hinweise.push('Als abgesagt ausgezeichnet: ' + (ev.name || ev.von)); continue; }
    if (ev.von && istVoraus(ev.von)) {
      befund.termine.push({
        von: ev.von, bis: ev.bis, url: ev.url, herkunft: 'jsonld',
        satz: [ev.name, ev.ort].filter(Boolean).join(' - ') || null
      });
    }
    for (const a of ev.angebote) {
      if (!preisPlausibel(a.preis)) {
        befund.hinweise.push('Preis ausserhalb der Spanne, uebergangen: ' + (a.preis / 100) + ' ' + (a.waehrung || ''));
        continue;
      }
      befund.angebote.push(Object.assign({
        termin: ev.von || null, eventName: ev.name || null, url: a.url || ev.url
      }, a));
    }
  }

  // --- Text: Wortlaute, satzweise
  // Satzweise, weil die Bedeutung am Nachbarwort haengt: "Tickets sind
  // erhaeltlich" und "ist ausverkauft" stehen auf derselben Seite, und nur
  // der Satz sagt, was wovon gilt.
  const vvkDaten = new Set();
  for (const s of saetze(text)) {
    if (!CFG.ticketWortRe.test(s)) continue;
    if (!seiteMeint && !CFG.festivalRe.test(s)) continue;
    befund.ticketSaetze.push(s);

    const aus = CFG.ausverkauftRe.test(s);
    if (aus) befund.ausverkauftSaetze.push({ satz: s, url: r.url });

    const daten = datenAusText(s).map(x => x.von).filter(Boolean).sort();
    const kommtNoch = daten.filter(x => x > heute());
    // Ankuendigung: Startwort plus Datum. Liegt das Datum noch vor uns, ist
    // das eine Vorwarnung und ausdruecklich kein Kaufhinweis. Liegt es
    // hinter uns, bleibt der Satz als Ankuendigung stehen - der Lauf
    // entscheidet dann, ob der Start gerade erreicht wurde.
    const ankuendigung = CFG.vvkStartRe.test(s) && daten.length > 0;
    if (ankuendigung) {
      for (const x of daten) vvkDaten.add(x);
      befund.vvkSaetze.push({ satz: s, url: r.url, start: kommtNoch[0] || daten[0] });
    }
    // Ein Kaufhinweis zaehlt nur, wenn im selben Satz kein "ausverkauft"
    // steht und der Satz nicht bloss einen Start ankuendigt, der noch kommt.
    if (!aus && kommtNoch.length === 0 && (CFG.kaufbarRe.test(s) || CFG.vvkLaeuftRe.test(s))) {
      befund.kaufSaetze.push({ satz: s, url: r.url });
    }
  }

  // --- Text: Termine, ueber den ganzen Seitentext
  // Nicht satzweise: ein Termin steht oft als Ueberschrift ohne Satzzeichen
  // oder ueber eine Trennung hinweg. Als Zusammenhang dient ein Fenster um
  // die Fundstelle - das reicht, um zu gewichten und in der Meldung zu
  // zitieren. Ein angekuendigter Vorverkaufsstart ist hier ausgenommen: das
  // ist ein Datum, aber nicht der Festivaltermin.
  for (const d of datenAusText(text)) {
    if (!istVoraus(d.von) || vvkDaten.has(d.von)) continue;
    const fenster = text.slice(Math.max(0, d.pos - 140), d.pos + 140).trim();
    if (!seiteMeint && !CFG.festivalRe.test(fenster)) continue;
    befund.termine.push({ von: d.von, bis: d.bis, url: r.url, herkunft: 'text', satz: fenster.slice(0, 220) });
  }
}

// ------------------------------------------------------------- Adapter
// Ein Adapter fuer alle Quellen: Seiten holen, auf Wunsch den Links mit dem
// Festivalnamen folgen, alles in einen Befund schreiben. Die Quellen
// unterscheiden sich in Adressen, nicht in der Arbeitsweise - solange sie
// HTML mit schema.org oder lesbarem Text liefern.
async function leseQuelle(key, log) {
  const qcfg = CFG.quellen[key];
  const befund = leererBefund(key, qcfg);
  const gesehen = new Set();

  for (const p of qcfg.seiten) {
    const url = absolut(p, qcfg.basis);
    if (!url || gesehen.has(url)) continue;
    gesehen.add(url);
    const r = await holen(url);
    if (r.status !== 200 || !r.body) {
      befund.hinweise.push('HTTP ' + r.status + ' fuer ' + url + (r.fehlt ? ' (Pruefstand: Datei fehlt)' : ''));
      befund.seiten.push({ url: url, status: r.status, bytes: 0, zeichen: 0 });
      continue;
    }
    seiteLesen(befund, r, qcfg);

    // Detailseiten des Veranstalters: die Adressen tragen den Namen.
    if (qcfg.linksFolgen) {
      const links = linksMitModell(r.body, qcfg.basis, CFG.festivalRe).slice(0, qcfg.maxLinks || 6);
      for (const l of links) {
        if (gesehen.has(l)) continue;
        gesehen.add(l);
        const rr = await holen(l);
        if (rr.status === 200 && rr.body) seiteLesen(befund, rr, qcfg);
        else befund.hinweise.push('HTTP ' + rr.status + ' fuer ' + l);
      }
    }
  }

  if (log) {
    for (const s of befund.seiten) log('    ' + s.status + '  ' + s.zeichen + ' Zeichen  ' + s.url);
    log('    ' + befund.termine.length + ' Termin(e), ' + befund.angebote.length + ' Angebot(e), ' +
        befund.kaufSaetze.length + ' Kaufhinweis(e), ' + befund.ausverkauftSaetze.length + ' x ausverkauft, ' +
        befund.vvkSaetze.length + ' VVK-Ankuendigung(en)');
  }
  return befund;
}

module.exports = {
  holen, saetze, datenAusText, eventsAusSeite, angeboteAus, verfuegbarAus,
  istFeuertanz, istVoraus, leseQuelle, seiteLesen, leererBefund, absolut, heute, tag
};
