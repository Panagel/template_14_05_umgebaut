// Taeglicher Scan des Gebrauchtmarkts: Bestand erfassen, Verschwundene
// verifizieren, Zustand fortschreiben. Gleiche Logik wie beim F900R-Monitor.
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');
const { kalkulation } = require('./kalkulation.js');

const DATA = path.join(__dirname, 'data');
const STATE = path.join(DATA, 'state.json');
const MELD = path.join(DATA, 'meldungen.json');

// Sofortmeldung fuer eine guenstige gebrauchte Combo. Mit Stundenangabe
// zaehlt die Kalkulation (7 % unter dem Schaetzpreis fuer diese Stunden),
// ohne Stunden oder solange es kein Stundenmodell gibt die Schwelle gegen
// den Neupreis.
const ALARM_ABWEICHUNG = -0.07;
const ALARM_RESTWERT_MAX = 0.80;

const today = () => new Date().toISOString().slice(0, 10);
const log = m => console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + m);

function loadState() {
  if (!fs.existsSync(STATE)) return { listings: {}, runs: [] };
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}
function saveState(st) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(st, null, 1));
}

// Was sich an einer Anzeige aendern kann, ohne dass sie neu ist: der
// Verkaeufer ergaenzt die Stunden, schreibt "AMS dabei" nach. Neuere Angaben
// gewinnen, eine fehlende Angabe loescht keine vorhandene.
function angabenNachziehen(cur, d) {
  if (d.stunden != null) { cur.stunden = d.stunden; cur.stundenArt = d.stundenArt; cur.stundenText = d.stundenText; }
  if (d.alterMonate != null) cur.alterMonate = d.alterMonate;
  for (const k of ['titel', 'zustand', 'klasse', 'ams', 'laserW', 'mehrereDrucker', 'neuware', 'defekt', 'beigaben', 'gewerblich']) {
    const v = k === 'titel' ? d.title : d[k];
    if (v != null && v !== '') cur[k] = v;
  }
}

async function main() {
  const T = today();
  const st = loadState();
  // Beim ersten Lauf ist alles neu - da wird nichts gemeldet, sonst kommt
  // der ganze Markt auf einmal aufs Handy.
  const ersterLauf = Object.keys(st.listings).length === 0;
  // Wird der Filter schaerfer, fliegt raus, was nach heutigem Stand kein
  // Drucker ist - sonst haelt die Nachpruefung es ewig am Leben.
  for (const id of Object.keys(st.listings)) {
    if (!L.istH2D(st.listings[id].titel)) { log('  x kein Drucker mehr: ' + st.listings[id].titel); delete st.listings[id]; }
  }
  log('Scan ' + T + ' - Bestand bisher: ' + Object.keys(st.listings).length);

  // 1) Listen crawlen
  const { ads, roh } = await L.crawlLists(6, log);
  log('Listen-Crawl: ' + roh + ' Treffer, davon ' + ads.length + ' H2D-Drucker');
  const letzterLauf = st.runs[st.runs.length - 1];
  // Abbruch an der Rohzahl, nicht an den Druckern: dass einmal kein
  // gebrauchter H2D inseriert ist, kommt vor. Dass "h2d" ab 500 EUR gar
  // nichts liefert - nicht einmal Transporter -, heisst blockiert.
  if (roh === 0) {
    console.error('ABBRUCH: keine einzige Anzeige gefunden - vermutlich blockiert oder Seitenstruktur geaendert.');
    process.exit(2);
  }
  if (letzterLauf && letzterLauf.aktiv >= 5 && ads.length < letzterLauf.aktiv * 0.4) {
    console.error('ABBRUCH: nur ' + ads.length + ' Drucker gefunden, zuletzt ' + letzterLauf.aktiv + '. Sieht nach Teilblockade aus - Zustand bleibt unveraendert.');
    process.exit(2);
  }

  // 2) Details holen
  const details = await L.fetchDetails(ads, Number(process.env.CONC || 4), log);
  log('Details geladen: ' + details.length);

  const aktiv = new Set();
  let neu = 0, preisAenderungen = 0, wiederDa = 0, verdacht = 0;

  for (const d of details) {
    if (d.gone) continue;
    // Die Detailseite hat das letzte Wort: steht dort ein Zubehoerteil,
    // war der Listentitel irrefuehrend.
    if (!L.istH2D(d.title)) continue;
    aktiv.add(d.id);
    const cur = st.listings[d.id];
    if (!cur) {
      st.listings[d.id] = {
        id: d.id, titel: d.title, href: d.href,
        erstGesehen: T, zuletztGesehen: T,
        inseratDatum: d.datum || null,
        preisErst: d.preis, preisAktuell: d.preis,
        preisVerlauf: [{ d: T, p: d.preis }],
        vb: d.vb, zustand: d.zustand,
        stunden: d.stunden, stundenArt: d.stundenArt, stundenText: d.stundenText,
        alterMonate: d.alterMonate,
        klasse: d.klasse, ams: d.ams, laserW: d.laserW, mehrereDrucker: d.mehrereDrucker,
        neuware: d.neuware, defekt: d.defekt,
        ort: d.ort, plz: d.plz, gewerblich: d.gewerblich,
        beigaben: d.beigaben,
        weg: false, wegSeit: null, wegNach: null
      };
      neu++;
      log('  + ' + (d.preis != null ? d.preis + ' EUR' : '?') + '  ' + d.klasse + '  ' +
          (d.stunden != null ? d.stunden + ' h' : 'Stunden ?') + '  ' + d.title.slice(0, 60));
    } else {
      cur.zuletztGesehen = T;
      angabenNachziehen(cur, d);
      if (cur.weg || cur.fehlendSeit) wiederDa++;
      cur.weg = false; cur.wegSeit = null; cur.wegNach = null;
      cur.fehlendSeit = null; cur.standzeit = null;
      if (d.preis != null && d.preis !== cur.preisAktuell) {
        cur.preisVerlauf.push({ d: T, p: d.preis });
        log('  ~ ' + cur.preisAktuell + ' -> ' + d.preis + ' EUR  ' + d.title.slice(0, 60));
        cur.preisAktuell = d.preis;
        preisAenderungen++;
      }
      if (d.datum && !cur.inseratDatum) cur.inseratDatum = d.datum;
    }
  }

  // 3) Fehlende verifizieren (Crawl-Luecken vermeiden)
  const vermisst = Object.values(st.listings).filter(x => !aktiv.has(x.id) && !x.weg);
  log('Zu verifizieren (nicht im Crawl gefunden): ' + vermisst.length);
  const verify = await L.fetchDetails(vermisst.map(x => ({ id: x.id, href: x.href })), Number(process.env.CONC || 4), log);
  let wegNeu = 0;
  for (const v of verify) {
    const cur = st.listings[v.id];
    if (!cur) continue;
    if (v.gone || !v.title) {
      // Eine einzelne Abwesenheit ist nur ein Verdacht - nach einer
      // Preisaenderung ist eine Anzeige kurz nicht abrufbar.
      if (!cur.fehlendSeit) {
        cur.fehlendSeit = T;
        verdacht++;
      } else if (cur.fehlendSeit < T) {
        cur.weg = true;
        cur.wegSeit = cur.fehlendSeit;
        cur.wegNach = Math.round((new Date(cur.fehlendSeit) - new Date(cur.erstGesehen)) / 86400000);
        cur.standzeit = null;
        const m = String(cur.inseratDatum || '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (m) {
          const d = Math.round((new Date(cur.fehlendSeit) - new Date(m[3] + '-' + m[2] + '-' + m[1])) / 86400000);
          if (d >= 0 && d < 400) cur.standzeit = d;
        }
        log('  - weg nach ' + (cur.standzeit != null ? cur.standzeit : cur.wegNach) + ' Tagen: ' + cur.preisAktuell + ' EUR  ' + (cur.titel || '').slice(0, 60));
        wegNeu++;
      }
    } else if (!L.istH2D(v.title)) {
      delete st.listings[v.id];
    } else {
      cur.zuletztGesehen = T;
      if (cur.fehlendSeit) { cur.fehlendSeit = null; wiederDa++; }
      angabenNachziehen(cur, v);
      if (v.preis != null && v.preis !== cur.preisAktuell) {
        cur.preisVerlauf.push({ d: T, p: v.preis });
        cur.preisAktuell = v.preis;
      }
    }
  }

  const aktivGesamt = Object.values(st.listings).filter(x => !x.weg).length;
  const eintrag = { datum: T, aktiv: aktivGesamt, neu: neu, verschwunden: wegNeu, preisAenderungen: preisAenderungen, verdacht: verdacht, wiederDa: wiederDa };
  const idx = st.runs.findIndex(r => r.datum === T);
  if (idx >= 0) {
    eintrag.neu += st.runs[idx].neu;
    eintrag.verschwunden += st.runs[idx].verschwunden;
    eintrag.preisAenderungen += st.runs[idx].preisAenderungen;
    eintrag.verdacht += st.runs[idx].verdacht || 0;
    eintrag.wiederDa += st.runs[idx].wiederDa || 0;
    st.runs[idx] = eintrag;
  } else {
    st.runs.push(eintrag);
  }
  const meldungen = ersterLauf ? [] : schnaeppchen(st, T);
  for (const m of meldungen) log('  ! ' + m.titel);
  if (!process.env.TROCKEN) {
    saveState(st);
    fs.writeFileSync(MELD, JSON.stringify({ datum: T, meldungen: meldungen }, null, 1));
  }

  log('FERTIG: aktiv=' + aktivGesamt + ' neu=' + neu + ' verschwunden=' + wegNeu +
      ' (Verdacht offen: ' + verdacht + ', wieder aufgetaucht: ' + wiederDa + ') preisAenderungen=' + preisAenderungen);
}

// Welche aktive gebrauchte Combo ist guenstig? Gemeldet wird eine Anzeige
// einmal; erneut erst, wenn ihr Preis unter den zuletzt gemeldeten faellt.
function schnaeppchen(st, T) {
  const K = kalkulation(st);
  const eur = v => Math.round(v).toLocaleString('de-DE') + ' EUR';
  const out = [];
  for (const r of K.proAnzeige) {
    const x = st.listings[r.id];
    if (!x || x.zuletztGesehen !== T || r.mehrereDrucker) continue;
    if (x.gemeldetBei != null && r.preis >= x.gemeldetBei) continue;
    const gruende = [];
    if (r.abweichung != null) {
      if (r.abweichung > ALARM_ABWEICHUNG) continue;
      gruende.push(Math.round(-100 * r.abweichung) + ' % unter dem Schaetzpreis fuer ' + r.stunden + ' h (' + eur(r.schaetzwert) + ')');
    } else {
      if (r.restwert > ALARM_RESTWERT_MAX) continue;
      gruende.push(Math.round(100 * r.restwert) + ' % vom Neupreis (' + eur(K.neupreis.preis) + ')' +
        (r.stunden == null ? ', Stunden nicht genannt' : ''));
      if (r.impliziteStunden != null) gruende.push('der Preis passt zu etwa ' + Math.round(r.impliziteStunden / 10) * 10 + ' Druckstunden');
    }
    if (x.preisVerlauf.length > 1 && x.preisErst > r.preis) gruende.push('gesenkt von ' + eur(x.preisErst));
    if (K.stundensatz != null) gruende.push('Wertverlust je 100 h laut Kalkulation: ' + eur(K.stundensatz * 100));
    x.gemeldetBei = r.preis;
    out.push({
      titel: 'Guenstige H2D Combo: ' + eur(r.preis) + (r.vb ? ' VB' : '') + ', ' + (r.stunden != null ? r.stunden + ' h' : 'Stunden ?'),
      name: r.titel, ort: r.ort, gewerblich: r.gewerblich, gruende: gruende,
      url: 'https://www.kleinanzeigen.de' + r.href
    });
  }
  return out;
}

main().catch(e => { console.error('FEHLER', e); process.exit(1); });
