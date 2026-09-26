// Hauptlauf der Ticketwache: Quellen lesen, Befunde gegen den eigenen
// Zustand halten, Meldungen nach data-feuertanz/meldungen.json schreiben.
// Der Push liegt in notify.js - so laesst sich der Lauf ohne Secrets proben.
//
// Der Zweck bestimmt die Reihenfolge: die eine Nachricht, auf die es
// ankommt, ist "es gibt Karten". Alles andere - Termin, angekuendigter
// Vorverkaufsstart, ausverkauft, umformulierte Ticketseite - dient dazu,
// diese eine Nachricht rechtzeitig und ohne Fehlalarm hinzubekommen.
const fs = require('fs');
const path = require('path');
const { geld } = require('./lib.js');
const { leseQuelle, istVoraus, heute } = require('./ticket-quellen.js');
const CFG = require('./ticket-config.js');

// Wie bei den Quellen eine Klappe fuer den Pruefstand: FEUERTANZ_DATA legt
// den Zustand woanders ab, damit der Selbsttest den echten nicht anfasst.
const DATA = process.env.FEUERTANZ_DATA
  ? path.resolve(process.env.FEUERTANZ_DATA)
  : path.join(__dirname, 'data-feuertanz');
const STATE = path.join(DATA, 'state.json');
const MELD = path.join(DATA, 'meldungen.json');

const HEUTE = heute();
const JAHR = +HEUTE.slice(0, 4);
const log = s => console.log(s);

// Wie viele Laeufe ohne Befund noetig sind, bis ein gemeldeter Zustand als
// beendet gilt. Eine Quelle, die zwischendurch 403 antwortet, soll nicht
// jedes Mal eine neue "Karten sind da"-Meldung ausloesen, sobald sie
// wieder antwortet.
const STILL_BIS_ZURUECK = 3;

// Obergrenze fuer den Ausfallzaehler: eine Stelle ueber der letzten Schwelle.
// Damit meldet jede Schwelle genau einmal, und eine Quelle, die dauerhaft
// sperrt - bei Ticketportalen der Normalfall -, aendert den Zustand nicht bei
// jedem Lauf. Sonst waere die Sperre eines Portals ein Commit alle 30
// Minuten, bis in alle Ewigkeit.
const AUSFALL_MAX = Math.max.apply(null, CFG.ausfallBei) + 1;

function ladeState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {
    return { version: 1, quellen: {}, ausgaben: {} };
  }
}

const tagDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

// Eine Ausgabe ist offen, solange ihr Termin nicht vorbei ist. Ein Termin,
// der hinter uns liegt, ist Archiv - und ein "ausverkauft" von damals darf
// die naechste Ausgabe nicht blockieren.
function istOffen(a) {
  if (!a || !a.datum) return true;
  return (a.bis || a.datum) >= HEUTE;
}

function jahreOffen(state) {
  return Object.keys(state.ausgaben)
    .filter(j => j !== 'offen' && istOffen(state.ausgaben[j]))
    .sort();
}

// Welcher Ausgabe gehoert ein Satz? Steht eine Jahreszahl drin, die noch
// kommt, gilt die. Sonst die naechste bekannte Ausgabe. Weiss der Watcher
// noch keinen Termin, landet der Befund unter "offen" - genau der Fall im
// Herbst, wenn Karten vor dem Termin verkauft werden.
function jahrZu(satz, state) {
  const jahre = String(satz || '').match(/\b20\d\d\b/g) || [];
  for (const j of jahre.map(Number).sort()) {
    if (j < JAHR || j > JAHR + CFG.jahreVoraus) continue;
    const a = state.ausgaben[String(j)];
    if (a && !istOffen(a)) continue;      // Ausgabe ist vorbei: Altlast
    return String(j);
  }
  const offen = jahreOffen(state);
  return offen.length ? offen[0] : 'offen';
}

function ausgabe(state, jahr) {
  if (!state.ausgaben[jahr]) {
    state.ausgaben[jahr] = {
      datum: null, bis: null, terminQuelle: null, terminSatz: null, terminUrl: null,
      kaufbar: false, kaufbarSeit: null, kaufbarStill: 0,
      ausverkauft: false, ausverkauftStill: 0,
      vvkGemeldet: [], gesehenSeit: HEUTE
    };
  }
  return state.ausgaben[jahr];
}

// Aus mehreren Datumskandidaten den glaubwuerdigsten waehlen. JSON-LD
// schlaegt Text, der Veranstalter schlaegt den Shop, und ein Satz, der von
// "findet statt" spricht, schlaegt eine Zahl, die bloss herumsteht.
const TERMIN_SATZ_RE = /\bstatt\b|\btermin\b|festival|open\s?air|burg|einlass|beginn|samstag|freitag/i;

function terminPunkte(t) {
  let p = 0;
  if (t.herkunft === 'jsonld') p += 3;
  if (t.leitquelle) p += 3;
  if (TERMIN_SATZ_RE.test(t.satz || '')) p += 2;
  if (CFG.monateUeblich.includes(+t.von.slice(5, 7))) p += 1;
  if (t.bis) p += 1;
  return p;
}

// Bei Gleichstand gilt die Seite des Veranstalters, dann der Datenblock,
// dann der fruehere Termin. Sonst haengt es von der Reihenfolge der Quellen
// ab, wer gewinnt - und das waere keine Begruendung.
function besterTermin(liste) {
  return liste.slice().sort((a, b) =>
    (terminPunkte(b) - terminPunkte(a)) ||
    ((b.leitquelle ? 1 : 0) - (a.leitquelle ? 1 : 0)) ||
    ((b.herkunft === 'jsonld' ? 1 : 0) - (a.herkunft === 'jsonld' ? 1 : 0)) ||
    a.von.localeCompare(b.von))[0];
}

const fmt = iso => iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '?';

function spanne(a) {
  if (!a.datum) return 'Termin offen';
  return a.bis ? fmt(a.datum) + ' - ' + fmt(a.bis) : fmt(a.datum);
}

const zeileVon = a => ({
  name: [a.eventName, a.name].filter(Boolean).join(' - ').slice(0, 60) || 'Ticket',
  jetzt: a.preis !== null && a.preis !== undefined ? geld(a.preis, a.waehrung || 'EUR') : '-',
  vorher: null, rabatt: null, bestpreis: null,
  verfuegbar: a.verfuegbar, url: a.url
});

async function main() {
  fs.mkdirSync(DATA, { recursive: true });
  const state = ladeState();
  if (!state.quellen) state.quellen = {};
  if (!state.ausgaben) state.ausgaben = {};

  const meldungen = [];
  const befunde = [];
  let quellenMitDaten = 0;

  // ---------------------------------------------------------- erheben
  for (const key of Object.keys(CFG.quellen)) {
    const qcfg = CFG.quellen[key];
    if (!CFG.quellenAktiv[key]) { log('== ' + qcfg.name + ' (aus)'); continue; }
    log('== ' + qcfg.name);
    // Absichtlich kein Laufzaehler: er wuerde sich bei jedem Lauf aendern,
    // und damit haette die Wache zweimal pro Stunde einen Commit, obwohl
    // nichts passiert ist. Gezaehlt wird nur, was etwas bedeutet.
    const st = state.quellen[key] || (state.quellen[key] = { ausfaelle: 0 });

    let b;
    try {
      b = await leseQuelle(key, log);
    } catch (e) {
      log('   FEHLER: ' + e.message);
      b = null;
    }

    // Lesbar heisst: mindestens eine Seite kam an und hatte sichtbaren Text.
    // Das ist nicht dasselbe wie "hat etwas gefunden" - eine Ticketseite,
    // auf der noch nichts steht, ist der Normalfall und kein Ausfall. Ein
    // Ausfall ist, wenn die Wache nicht hinsehen kann.
    const zeichen = b ? Math.max.apply(null, [0].concat(b.seiten.map(s => s.status === 200 ? s.zeichen : 0))) : 0;
    const lesbar = zeichen >= CFG.minZeichen;
    const fund = !!b && (b.termine.length || b.angebote.length || b.ticketSaetze.length);
    for (const h of (b ? b.hinweise : [])) log('   ? ' + h);

    if (!lesbar) {
      st.ausfaelle = Math.min((st.ausfaelle || 0) + 1, AUSFALL_MAX);
      if (!st.stummSeit) st.stummSeit = HEUTE;
      log('   ? nicht lesbar' + (zeichen ? ' (nur ' + zeichen + ' Zeichen - Blockseite oder JavaScript-Wand)' : '') +
          ' (Ausfall ' + st.ausfaelle + (st.ausfaelle === AUSFALL_MAX ? '+' : '') +
          ', stumm seit ' + st.stummSeit + ')' + (qcfg.darfSchweigen ? ' - darf schweigen' : ''));
      // Bei der Leitquelle ist Stille das Problem: dort steht die Wahrheit.
      // Ein Ticketportal hinter Bot-Schutz darf schweigen, ohne dass
      // deswegen das Handy klingelt.
      if (!qcfg.darfSchweigen && CFG.ausfallBei.includes(st.ausfaelle)) {
        meldungen.push({
          typ: 'ausfall', quelle: qcfg.name, url: qcfg.basis,
          titel: qcfg.name + ': seit ' + st.ausfaelle + ' Laeufen nichts Lesbares',
          gruende: ['Stumm seit ' + st.stummSeit + '.',
                    zeichen
                      ? 'Die Seite antwortet, hat aber nur ' + zeichen + ' Zeichen sichtbaren Text - Blockseite oder ohne JavaScript nicht lesbar.'
                      : 'Die Quelle blockt, ist umgebaut oder die Adresse stimmt nicht mehr.',
                    'Solange das so bleibt, kann die Wache einen Vorverkaufsstart dort nicht sehen.',
                    'Pruefen mit dem Workflow "Feuertanz-Quellendiagnose".'],
          produkte: []
        });
      }
      continue;
    }
    if (st.ausfaelle) {
      log('   wieder lesbar nach ' + st.ausfaelle + ' Ausfaellen');
      st.ausfaelle = 0;
      delete st.stummSeit;
    }
    st.zuletztDaten = HEUTE;
    quellenMitDaten++;
    if (!fund) log('   . gelesen, aber nichts zum Thema Karten - das ist der Normalfall, bis sich etwas regt');
    befunde.push(b);
  }

  // ------------------------------------------------- Signal 2: Termin
  // Erst die Termine, dann alles andere: die Jahreszuordnung der uebrigen
  // Befunde haengt daran, welche Ausgabe der Watcher kennt.
  const kandidaten = {};
  for (const b of befunde) {
    for (const t of b.termine) {
      const j = t.von.slice(0, 4);
      (kandidaten[j] = kandidaten[j] || []).push(Object.assign({}, t, { quelle: b.name, leitquelle: b.leitquelle }));
    }
  }
  for (const j of Object.keys(kandidaten).sort()) {
    const t = besterTermin(kandidaten[j]);
    const a = ausgabe(state, j);
    const alt = a.datum;
    if (alt === t.von && (a.bis || null) === (t.bis || null)) continue;
    a.datum = t.von; a.bis = t.bis || null;
    a.terminQuelle = t.quelle; a.terminSatz = t.satz || null; a.terminUrl = t.url || null;
    if (!CFG.terminMelden) continue;
    const ungewoehnlich = !CFG.monateUeblich.includes(+t.von.slice(5, 7));
    const weitere = kandidaten[j].filter(x => x.von !== t.von)
      .map(x => '  auch gelesen: ' + fmt(x.von) + ' (' + x.quelle + ', ' + x.herkunft + ')');
    meldungen.push({
      typ: 'termin', quelle: t.quelle, url: t.url || CFG.quellen.offiziell.basis,
      titel: alt
        ? CFG.festival + ' ' + j + ': Termin geaendert auf ' + spanne(a)
        : CFG.festival + ' ' + j + ': Termin steht - ' + spanne(a),
      gruende: [(alt ? 'Bisher ' + fmt(alt) + ', jetzt ' + spanne(a) : 'Termin ' + spanne(a)) +
                ' auf ' + CFG.ort + '.',
                'Quelle: ' + t.quelle + ' (' + (t.herkunft === 'jsonld' ? 'schema.org-Datenblock' : 'Seitentext') + ')']
        .concat(t.satz ? ['Gelesen: "' + t.satz.slice(0, 180) + '"'] : [])
        .concat(ungewoehnlich ? ['Ungewoehnlicher Monat - bisher lag das Festival im Juni. Bitte nachsehen.'] : [])
        .concat(weitere.length ? ['Weitere Datumsangaben auf den Seiten:'].concat(weitere) : [])
        .concat(t.herkunft === 'text' ? ['Aus dem Seitentext gelesen, nicht aus einem Datenblock - im Zweifel selbst nachsehen.'] : []),
      produkte: []
    });
    log('   ! Termin ' + j + ': ' + spanne(a) + ' (' + t.quelle + ', ' + t.herkunft + ')');
  }

  // ------------------------------------------ Befunde je Ausgabe buendeln
  const je = {};
  const bucket = j => (je[j] = je[j] || { kauf: [], aus: [], vvk: [], angebote: [] });

  for (const b of befunde) {
    for (const k of b.kaufSaetze) bucket(jahrZu(k.satz, state)).kauf.push({ quelle: b.name, leitquelle: b.leitquelle, satz: k.satz, url: k.url });
    for (const s of b.ausverkauftSaetze) bucket(jahrZu(s.satz, state)).aus.push({ quelle: b.name, leitquelle: b.leitquelle, satz: s.satz, url: s.url });
    for (const v of b.vvkSaetze) bucket(jahrZu(v.satz + ' ' + (v.start || ''), state)).vvk.push({ quelle: b.name, satz: v.satz, url: v.url, start: v.start });
    for (const a of b.angebote) {
      const j = a.termin ? a.termin.slice(0, 4) : jahrZu([a.eventName, a.name].filter(Boolean).join(' '), state);
      // Ein Angebot zu einem Termin, der vorbei ist, ist ein Archivfund.
      if (a.termin && !istVoraus(a.termin)) continue;
      bucket(j).angebote.push(Object.assign({ quelle: b.name }, a));
    }
  }

  // "offen" ist der Behelfsbehaelter fuer alles ohne Jahresangabe - "Tickets
  // ab sofort erhaeltlich" nennt kein Jahr. Sobald genau eine Ausgabe mit
  // Termin bekannt ist, gehoeren beide zusammen, und zwar in zwei
  // Hinsichten: die Befunde dieses Laufs, sonst stuende der Kaufhinweis
  // unter "offen" waehrend das "ausverkauft" derselben Seite unter der
  // Jahreszahl steht - und das Gedaechtnis, sonst klingelt eine schon
  // gemeldete Kaufgelegenheit ein zweites Mal, sobald der Termin bekannt
  // wird.
  const offeneJahre = jahreOffen(state);
  if (offeneJahre.length === 1) {
    const ziel = offeneJahre[0];
    if (je.offen) {
      const z = bucket(ziel);
      for (const f of ['kauf', 'aus', 'vvk', 'angebote']) z[f] = z[f].concat(je.offen[f]);
      delete je.offen;
      log('   (Befunde ohne Jahresangabe der Ausgabe ' + ziel + ' zugeordnet)');
    }
    const alt = state.ausgaben.offen;
    if (alt) {
      const neu = ausgabe(state, ziel);
      if (alt.kaufbar && !neu.kaufbar) { neu.kaufbar = true; neu.kaufbarSeit = alt.kaufbarSeit; neu.kaufbarStill = alt.kaufbarStill || 0; }
      if (alt.ausverkauft && !neu.ausverkauft) { neu.ausverkauft = true; neu.ausverkauftStill = alt.ausverkauftStill || 0; }
      neu.vvkGemeldet = Array.from(new Set((neu.vvkGemeldet || []).concat(alt.vvkGemeldet || []))).slice(-8);
      delete state.ausgaben.offen;
      log('   (Gedaechtnis von "offen" auf die Ausgabe ' + ziel + ' uebertragen)');
    }
  }

  // --------------------------------- Signal 3: Vorverkaufsstart steht an
  for (const j of Object.keys(je)) {
    if (!CFG.vvkStartMelden) break;
    const a = ausgabe(state, j);
    for (const v of je[j].vvk) {
      if (!v.start || v.start <= HEUTE) continue;          // schon gelaufen: siehe Signal 1
      const sk = v.start + '|' + (v.satz.match(/\d{1,2}[:.]\d\d/) || [''])[0];
      if ((a.vvkGemeldet || []).includes(sk)) continue;
      a.vvkGemeldet = (a.vvkGemeldet || []).concat([sk]).slice(-8);
      const tage = tagDiff(v.start, HEUTE);
      meldungen.push({
        typ: 'vorverkauf', quelle: v.quelle, url: v.url,
        titel: CFG.festival + (j !== 'offen' ? ' ' + j : '') + ': Vorverkauf startet ' + fmt(v.start),
        gruende: ['In ' + tage + ' Tag(en) gibt es Karten - ' + fmt(v.start) + '.',
                  'Gelesen bei ' + v.quelle + ': "' + v.satz.slice(0, 200) + '"',
                  'Die Wache meldet sich am Starttag von allein wieder, sobald wirklich etwas zu kaufen ist.',
                  'Wer auf die Minute genau dabei sein will: den Zeitplan in .github/workflows/feuertanz-tickets.yml vorher engmaschiger stellen.'],
        produkte: []
      });
      log('   ! Vorverkaufsstart ' + fmt(v.start) + ' angekuendigt (' + v.quelle + ')');
    }
  }

  // ------------------------------------ Signal 1 und 4: kaufbar / ausverkauft
  for (const j of Object.keys(je).sort()) {
    const a = ausgabe(state, j);
    if (!istOffen(a)) continue;                             // Ausgabe ist vorbei
    const f = je[j];

    // Harter Befund: ein Shop weist ein Angebot als verfuegbar aus.
    const hart = f.angebote.filter(x => x.verfuegbar === 'ja');
    // Weicher Befund: die Seite sagt es in Worten.
    const weich = CFG.textBefundGenuegt ? f.kauf : [];
    // Und der Fall, auf den diese Wache eigentlich wartet: ein
    // angekuendigter Vorverkaufsstart ist gerade verstrichen. Dann steht auf
    // der Seite oft noch derselbe Satz - und trotzdem gibt es jetzt Karten.
    const gestartet = f.vvk.filter(v => v.start && v.start <= HEUTE && tagDiff(HEUTE, v.start) <= CFG.vvkFrischTage);

    const ausverkauft = f.aus.filter(x => x.leitquelle).length > 0 ||
                        (f.aus.length > 0 && f.angebote.every(x => x.verfuegbar !== 'ja'));

    // Ausverkauft schlaegt den Wortlaut, aber nicht ein Angebot, das der
    // Shop selbst als verfuegbar fuehrt: Rueckgaben kommen zurueck in den
    // Verkauf, und dann zaehlt der Shop, nicht der Text von gestern.
    const kaufbar = hart.length > 0 || (!ausverkauft && (weich.length > 0 || gestartet.length > 0));

    if (kaufbar) {
      a.kaufbarStill = 0;
      if (!a.kaufbar) {
        a.kaufbar = true;
        a.kaufbarSeit = HEUTE;
        a.ausverkauft = false;
        if (CFG.kaufbarMelden) {
          const wo = [];
          for (const x of hart) wo.push('  ' + x.quelle + ': ' + (x.preis !== null ? geld(x.preis, x.waehrung || 'EUR') : 'Preis nicht ausgewiesen') +
                                        (x.name ? ' - ' + x.name : '') + (x.roh ? ' [' + x.roh + ']' : ''));
          const gruende = [];
          if (hart.length) gruende.push('Ein Shop fuehrt Karten als verfuegbar:');
          if (wo.length) gruende.push.apply(gruende, wo);
          for (const w of weich.slice(0, 3)) gruende.push(w.quelle + ': "' + w.satz.slice(0, 180) + '"');
          for (const g of gestartet.slice(0, 2)) gruende.push('Angekuendigter Vorverkaufsstart ' + fmt(g.start) + ' ist erreicht: "' + g.satz.slice(0, 140) + '"');
          gruende.push('Termin: ' + spanne(a) + (a.datum ? '' : ' - der Termin stand noch nicht auf der Seite') + ', ' + CFG.ort + '.');
          if (!hart.length) gruende.push('Befund aus dem Seitentext, nicht aus einem Shop-Datenblock: bitte selbst pruefen, bevor du dich freust.');
          const links = [].concat(
            hart.map(x => x.url).filter(Boolean),
            weich.map(x => x.url), gestartet.map(x => x.url),
            [CFG.quellen.offiziell.basis + '/tickets.html']
          ).filter(Boolean);
          meldungen.push({
            typ: 'kaufbar',
            quelle: hart.length ? hart[0].quelle : (weich[0] ? weich[0].quelle : 'Ticketwache'),
            url: links[0],
            titel: CFG.festival + (j !== 'offen' ? ' ' + j : '') + ': es gibt Karten' + (a.datum ? ' (' + spanne(a) + ')' : ''),
            gruende: gruende,
            links: Array.from(new Set(links)).slice(0, 6),
            standTitel: 'Angebote:',
            produkte: f.angebote.slice(0, 10).map(zeileVon)
          });
          log('   !! KARTEN ' + j + ': ' + (hart.length ? hart.length + ' Angebot(e) verfuegbar' : 'Textbefund') );
        }
      } else {
        log('   = Karten ' + j + ' weiterhin zu haben (schon gemeldet am ' + a.kaufbarSeit + ')');
      }
    } else if (a.kaufbar) {
      // Nicht beim ersten stummen Lauf abschalten: eine Quelle, die kurz
      // 403 antwortet, wuerde sonst beim naechsten Mal eine zweite
      // "es gibt Karten"-Meldung ausloesen.
      a.kaufbarStill = (a.kaufbarStill || 0) + 1;
      if (a.kaufbarStill >= STILL_BIS_ZURUECK) {
        a.kaufbar = false;
        log('   . Karten ' + j + ': kein Befund mehr seit ' + a.kaufbarStill + ' Laeufen');
      }
    }

    if (ausverkauft) {
      a.ausverkauftStill = 0;
      if (!a.ausverkauft) {
        a.ausverkauft = true;
        a.kaufbar = false;
        if (CFG.ausverkauftMelden) {
          meldungen.push({
            typ: 'ausverkauft', quelle: f.aus[0].quelle, url: f.aus[0].url,
            titel: CFG.festival + (j !== 'offen' ? ' ' + j : '') + ': ausverkauft',
            gruende: [f.aus[0].quelle + ': "' + f.aus[0].satz.slice(0, 200) + '"',
                      'Termin: ' + spanne(a) + '.',
                      'Die Wache laeuft weiter: kommen Karten zurueck in den Verkauf, meldet sie sich wieder.'],
            produkte: []
          });
          log('   ! ' + j + ' ausverkauft');
        }
      }
    } else if (a.ausverkauft) {
      a.ausverkauftStill = (a.ausverkauftStill || 0) + 1;
      if (a.ausverkauftStill >= STILL_BIS_ZURUECK) { a.ausverkauft = false; }
    }
  }

  // --------------------------- Signal 5: Ticketseite umformuliert
  // Nur die Leitquelle, und nur ihre Saetze zum Thema Karten: Shopseiten
  // aendern staendig irgendetwas, der Veranstalter nicht.
  const leit = befunde.find(b => b.leitquelle);
  if (leit) {
    const jetzt = Array.from(new Set(leit.ticketSaetze.map(s => s.replace(/\s+/g, ' ').trim()))).sort().slice(0, 80);
    const alt = state.ticketSaetze || null;
    if (alt) {
      const altSet = new Set(alt);
      const neu = jetzt.filter(s => !altSet.has(s));
      const weg = alt.filter(s => !jetzt.includes(s));
      if ((neu.length || weg.length) && CFG.aenderungMelden && !meldungen.some(m => m.typ === 'kaufbar' || m.typ === 'termin' || m.typ === 'vorverkauf')) {
        meldungen.push({
          typ: 'aenderung', quelle: leit.name, url: CFG.quellen.offiziell.basis + '/tickets.html',
          titel: leit.name + ': Ticketseite umformuliert',
          gruende: ['Auf der Seite hat sich etwas zum Thema Karten geaendert, ohne dass die Wache daraus schon eine Kaufgelegenheit lesen kann.']
            .concat(neu.slice(0, 4).map(s => '+ "' + s.slice(0, 180) + '"'))
            .concat(weg.slice(0, 3).map(s => '- "' + s.slice(0, 180) + '"'))
            .concat(['Bitte selbst nachsehen - vielleicht ist es eine neue Formulierung, die die Wache noch nicht kennt.']),
          produkte: []
        });
        log('   ! Ticketseite geaendert (' + neu.length + ' neu, ' + weg.length + ' weg)');
      }
    }
    state.ticketSaetze = jetzt;
  }

  // ------------------------------------------------------------- Ausgabe
  const stand = Object.keys(state.ausgaben).sort().filter(j => istOffen(state.ausgaben[j])).map(j => {
    const a = state.ausgaben[j];
    return {
      ausgabe: j, termin: spanne(a),
      karten: a.kaufbar ? 'zu haben' : (a.ausverkauft ? 'ausverkauft' : 'noch nichts'),
      quelle: a.terminQuelle || null, url: a.terminUrl || null
    };
  });

  fs.writeFileSync(MELD, JSON.stringify({ datum: HEUTE, meldungen: meldungen, stand: stand }, null, 1));

  // Zustand nur schreiben, wenn sich etwas geaendert hat - oder einmal am
  // Tag als Lebenszeichen. Sonst haette jeder Lauf einen Commit, und bei
  // dieser Taktung waeren das Dutzende am Tag. Einmal taeglich genuegt
  // zugleich als Aktivitaet, damit GitHub den Zeitplan nicht nach 60 Tagen
  // Stille abschaltet.
  const ohneTag = s => JSON.stringify(Object.assign({}, s, { tag: undefined, letzterLauf: undefined }));
  const vorher = ladeState();
  const geaendert = ohneTag(state) !== ohneTag(vorher);
  if (geaendert || vorher.tag !== HEUTE) {
    state.tag = HEUTE;
    state.letzterLauf = new Date().toISOString();
    fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
    log('');
    log('Zustand gesichert' + (geaendert ? ' (Aenderung)' : ' (Lebenszeichen)'));
  } else {
    log('');
    log('Zustand unveraendert - nichts zu sichern');
  }

  log('');
  log('Stand:');
  if (!stand.length) log('   noch keine Ausgabe erkannt');
  for (const s of stand) {
    log('   ' + (s.ausgabe === 'offen' ? 'Jahr? ' : s.ausgabe.padEnd(6)) +
        spanne(state.ausgaben[s.ausgabe]).padEnd(26) + 'Karten: ' + s.karten);
  }
  log('');
  log('Meldungen: ' + meldungen.length + ' | Quellen mit Daten: ' + quellenMitDaten);

  if (quellenMitDaten === 0) {
    console.error('Keine einzige Quelle lieferte etwas Lesbares.');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
