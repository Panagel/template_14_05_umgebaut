// Wochenbericht Gebrauchtmarkt als Markdown. Schwerpunkt: H2D mit AMS 2 Pro
// (Combo), bewertet nach Druckstunden.
const fs = require('fs');
const path = require('path');
const { kalkulation, med, q } = require('./kalkulation.js');

const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'state.json'), 'utf8'));
const K = kalkulation(st);
const all = K.segmente.all;

const HEUTE = new Date();
const T = HEUTE.toISOString().slice(0, 10);
const dParse = s => { const m = String(s || '').match(/(\d{2})\.(\d{2})\.(\d{4})/); return m ? new Date(m[3] + '-' + m[2] + '-' + m[1]) : null; };
const tage = (a, b) => Math.round((b - a) / 86400000);
const eur = v => v == null ? '–' : Math.round(v).toLocaleString('de-DE') + ' €';
const pct = v => v == null ? '–' : (v > 0 ? '+' : '') + Math.round(100 * v) + ' %';
const std = x => x.stunden == null ? '–' : (x.stundenArt === 'max' ? '< ' : x.stundenArt === 'ca' ? '~' : '') + x.stunden.toLocaleString('de-DE') + ' h' + (x.mehrereDrucker ? '*' : '');
const link = x => x.href ? '[' + (x.titel || 'Anzeige').slice(0, 42).replace(/\|/g, '/') + '](https://www.kleinanzeigen.de' + x.href + ')' : (x.titel || '').slice(0, 42);
const KLASSEN = require('./lib.js').KLASSEN;

const L = [];
const w = s => L.push(s);

const combo = K.segmente.combo;
const comboAktiv = combo.filter(x => !x.weg);
const N = K.neupreis;

w('# H2D Gebrauchtmarkt – ' + T);
w('');
w('Quelle: kleinanzeigen.de, deutschlandweit, alle Rubriken. Scan Nr. ' + st.runs.length + ' seit ' + (st.runs[0] ? st.runs[0].datum : '–') + '.');
w('Gesucht: **Bambu Lab H2D mit AMS 2 Pro (Combo), gebraucht.** Neupreis zum Vergleich: **' + eur(N.preis) + '** (' + N.quelle + (N.datum ? ', ' + N.datum : '') + ').');
w('');

// ---- Kurzfassung ----
w('## Kurzfassung');
w('');
const wocheRuns = st.runs.slice(-7);
const neuWoche = wocheRuns.reduce((s, r) => s + (r.neu || 0), 0);
const wegWoche = wocheRuns.reduce((s, r) => s + (r.verschwunden || 0), 0);
w('- Gebrauchte Combos aktiv: **' + comboAktiv.length + '** (alle H2D-Fassungen: ' + all.filter(x => !x.weg).length + ').');
w('- Diese Woche: **' + neuWoche + '** neu eingestellt, **' + wegWoche + '** verschwunden.');
if (comboAktiv.length) {
  const p = comboAktiv.map(x => x.preisAktuell);
  w('- Medianpreis gebrauchte Combo: **' + eur(med(p)) + '** = **' + Math.round(100 * med(p) / N.preis) + ' %** vom Neupreis.');
}
if (K.stundensatz != null) {
  w('- Jede Druckstunde kostet rund **' + K.stundensatz.toFixed(2).replace('.', ',') + ' €** Wiederverkaufswert, also **' + eur(K.stundensatz * 100) + ' je 100 Stunden**.');
  w('- Schon der Schritt von neu zu gebraucht kostet **' + eur(K.gebrauchtAbschlag) + '** (gebrauchtes Gerät mit 0 h: ' + eur(K.modell.a) + ').');
}
const guenstig = K.proAnzeige.filter(r => r.urteil === 'guenstig').sort((a, b) => a.abweichung - b.abweichung);
if (guenstig.length) {
  const g = guenstig[0];
  w('- Günstigstes Angebot gemessen an den Stunden: **' + eur(g.preis) + '** bei ' + std(g) + ' – ' + pct(g.abweichung) + ' gegen die Schätzung. ' + link(g));
}
w('');

// ---- Kalkulation ----
w('## Kalkulation mit Druckstunden');
w('');
w('Druckstunden sind beim Drucker, was beim Motorrad der Kilometerstand ist. Ein Formularfeld dafür gibt es nicht – die Stunden stammen aus dem Anzeigentext ("418 Stunden auf der Uhr", "ca. 300 Druckstunden").');
w('');
const mitStd = comboAktiv.filter(x => x.stunden != null).length;
w('- Combos mit eindeutiger Stundenangabe: **' + K.punkteCombo.length + '** seit Beginn. Von den ' + comboAktiv.length + ' aktiven nennen ' + mitStd + ' ihre Stunden' +
  (comboAktiv.some(x => x.mehrereDrucker && x.stunden != null) ? ' (Sammelanzeigen mitgezählt, aber nicht mitgerechnet)' : '') + '.');
if (K.stundensatz != null) {
  if (K.modellArt === 'restwert') {
    const nach = {};
    K.punkte.forEach(p => { nach[p.klasse] = (nach[p.klasse] || 0) + 1; });
    const NAMEN = { combo: 'Combo', basis: 'ohne AMS', laser10: 'Laser 10 W', laser40: 'Laser 40 W' };
    w('- Für eine Rechnung nur aus Combos reicht das noch nicht. Bis dahin zählt der **Restwert aller gebrauchten H2D mit Stundenangabe** (' +
      Object.entries(nach).map(([k, n]) => n + '× ' + NAMEN[k]).join(', ') + '), jeweils gegen den Neupreis der eigenen Fassung, umgerechnet auf die Combo.');
    w('- Restwert ≈ **' + Math.round(100 * K.modell.restwertA) + ' % − ' + (-100 * K.modell.restwertB * 100).toFixed(1).replace('.', ',') + ' Prozentpunkte je 100 h**; für die Combo: **Preis ≈ ' + eur(K.modell.a) + ' − ' + K.stundensatz.toFixed(2).replace('.', ',') + ' € × Stunden** (robuste Gerade, n = ' + K.modell.n + ').');
  } else {
    w('- Rechnung: **Preis ≈ ' + eur(K.modell.a) + ' − ' + K.stundensatz.toFixed(2).replace('.', ',') + ' € × Stunden** (robuste Gerade über ' + K.modell.n + ' Combos, aktive und verschwundene Anzeigen).');
  }
  w('');
  w('| Druckstunden | erwarteter Preis Combo | Restwert |');
  w('|---|---|---|');
  for (const p of K.prognose) w('| ' + p.h.toLocaleString('de-DE') + ' h | ' + eur(p.preis) + ' | ' + Math.round(100 * p.preis / N.preis) + ' % |');
  w('');
  w('Lesart für einen Kauf: wer eine Combo mit 400 h kauft und sie nach weiteren 600 h wieder verkauft, verliert durch die Stunden etwa **' + eur(K.stundensatz * 600) + '** – unabhängig vom Einstiegspreis.');
  w('');
  w('Messpunkte der Rechnung:');
  w('');
  w('| Fassung | Stunden | Preis | Restwert | Anzeige |');
  w('|---|---|---|---|---|');
  const byId = {}; all.forEach(x => { byId[x.id] = x; });
  K.punkte.slice().sort((a, b) => a.x - b.x).forEach(p => {
    const x = byId[p.id];
    const ref = K.neupreise[require('./kalkulation.js').referenz(x)] || N;
    w('| ' + (KLASSEN[x.klasse] || x.klasse) + (x.laserW ? ' ' + x.laserW + ' W' : '') + ' | ' + std(x) + ' | ' + eur(x.preisAktuell) + ' | ' + Math.round(100 * x.preisAktuell / ref.preis) + ' % von ' + eur(ref.preis) + ' | ' + link(x) + (x.weg ? ' (weg)' : '') + ' |');
  });
} else {
  w('- _Noch kein belastbares Stundenmodell: es braucht mindestens drei gebrauchte H2D mit Stundenangabe und einer Spanne von 150 h' +
    (K.modell && K.modell.unplausibel ? '; die bisherigen Punkte zeigen keinen fallenden Preis mit steigenden Stunden' : '') + '._');
  if (K.satzJeAnzeigeMedian != null)
    w('- Notbehelf gegen den Neupreis gerechnet: Median **' + eur(K.satzJeAnzeigeMedian) + ' je 100 h**. Das überschätzt den Stundensatz, weil der Abschlag fürs Gebrauchtsein mit drinsteckt.');
}
w('');

// ---- Aktuelle Angebote ----
w('## Aktuelle Angebote: H2D mit AMS 2 Pro, gebraucht');
w('');
if (K.proAnzeige.length) {
  w('| Preis | Stunden | Alter | Restwert | Schätzung | Abw. | Urteil | Typ | Ort | Anzeige |');
  w('|---|---|---|---|---|---|---|---|---|---|');
  const ord = K.proAnzeige.slice().sort((a, b) => (a.abweichung != null ? a.abweichung : 9) - (b.abweichung != null ? b.abweichung : 9) || a.preis - b.preis);
  for (const r of ord) {
    const urteil = r.urteil === 'guenstig' ? '**günstig**' : r.urteil === 'teuer' ? 'teuer' : r.urteil === 'fair' ? 'fair'
      : r.impliziteStunden != null ? 'Preis ≙ ~' + Math.round(r.impliziteStunden / 10) * 10 + ' h' : '–';
    w('| ' + eur(r.preis) + (r.vb ? ' VB' : '') + ' | ' + std(r) + ' | ' + (r.alterMonate != null ? r.alterMonate + ' Mon.' : '–') +
      ' | ' + Math.round(100 * r.restwert) + ' % | ' + eur(r.schaetzwert) + ' | ' + pct(r.abweichung) + ' | ' + urteil +
      ' | ' + (r.gewerblich ? 'Händler' : 'Privat') + ' | ' + (r.ort || '–').replace(/\|/g, '/').slice(0, 28) + ' | ' + link(r) + ' |');
  }
  w('');
  w('_Schätzung = erwarteter Preis bei diesen Stunden laut Rechnung oben; günstig/teuer ab 7 % Abweichung. Ohne Stundenangabe zeigt "Preis ≙" den Stundenstand, zu dem der verlangte Preis passen würde. * = Sammelanzeige mehrerer Drucker, Stunden nicht eindeutig zuzuordnen._');
} else {
  w('_Derzeit keine gebrauchte Combo inseriert._');
}
w('');

// ---- Preis nach Stunden ----
const buckets = [[1, 250, '1–249 h'], [250, 500, '250–499 h'], [500, 1000, '500–999 h'], [1000, 2000, '1.000–1.999 h'], [2000, 1e9, 'ab 2.000 h']];
const bzeile = (lbl, g) => {
  if (!g.length) return;
  const p = g.map(x => x.preisAktuell);
  w('| ' + lbl + ' | ' + g.length + ' | ' + eur(med(p)) + ' | ' + eur(q(p, .25)) + ' – ' + eur(q(p, .75)) + ' | ' + Math.round(100 * med(p) / N.preis) + ' % |');
};
if (combo.length >= 2) {
  w('### Preis nach Druckstunden (alle je erfassten gebrauchten Combos)');
  w('');
  w('| Stunden | n | Median | P25–P75 | vom Neupreis |');
  w('|---|---|---|---|---|');
  for (const [a, b, lbl] of buckets) bzeile(lbl, combo.filter(x => x.stunden != null && x.stunden >= a && x.stunden < b && !x.mehrereDrucker));
  bzeile('nicht genannt', combo.filter(x => x.stunden == null));
  w('');
}

// ---- Andere Fassungen ----
w('## Andere Fassungen zum Vergleich');
w('');
const andereAktiv = all.filter(x => !x.weg && x.preisAktuell && (x.klasse !== 'combo' || x.neuware || x.defekt));
if (andereAktiv.length) {
  w('| Fassung | Zustand | Preis | Stunden | Typ | Anzeige |');
  w('|---|---|---|---|---|---|');
  andereAktiv.sort((a, b) => (a.klasse > b.klasse ? 1 : a.klasse < b.klasse ? -1 : a.preisAktuell - b.preisAktuell)).forEach(x =>
    w('| ' + (KLASSEN[x.klasse] || x.klasse) + (x.ams > 1 ? ' (' + x.ams + '× AMS)' : '') + ' | ' + (x.defekt ? 'defekt' : x.neuware ? 'neu' : 'gebraucht') +
      ' | ' + eur(x.preisAktuell) + (x.vb ? ' VB' : '') + ' | ' + std(x) + ' | ' + (x.gewerblich ? 'Händler' : 'Privat') + ' | ' + link(x) + ' |'));
} else {
  w('_Keine._');
}
w('');

// ---- Standzeit ----
w('## Wie schnell gehen sie weg');
w('');
const lauf = x => x.standzeit != null ? x.standzeit : x.wegNach;
const weg = all.filter(x => x.weg && lauf(x) != null);
if (weg.length >= 3) {
  w('Standzeit bis zum Verschwinden der Anzeige, gezählt ab dem Einstelldatum bei Kleinanzeigen:');
  w('');
  w('| Gruppe | n | Median | P25–P75 | Medianpreis |');
  w('|---|---|---|---|---|');
  const row = (lbl, arr) => { if (arr.length < 2) return; const t = arr.map(lauf); w('| ' + lbl + ' | ' + arr.length + ' | ' + med(t) + ' Tage | ' + q(t, .25) + ' – ' + q(t, .75) + ' Tage | ' + eur(med(arr.map(x => x.preisAktuell))) + ' |'); };
  row('alle H2D', weg);
  row('Combo gebraucht', weg.filter(x => x.klasse === 'combo' && !x.neuware));
  row('  bis 500 h', weg.filter(x => x.klasse === 'combo' && x.stunden != null && x.stunden < 500));
  row('  ab 500 h', weg.filter(x => x.klasse === 'combo' && x.stunden != null && x.stunden >= 500));
  row('  Stunden nicht genannt', weg.filter(x => x.klasse === 'combo' && x.stunden == null));
  row('andere Fassungen', weg.filter(x => x.klasse !== 'combo'));
  w('');
} else {
  const offen = all.filter(x => !x.weg && x.fehlendSeit).length;
  w('_Noch zu wenige verschwundene Anzeigen für belastbare Laufzeiten (' + weg.length + ' bestätigt, ' + offen + ' im Verdacht). Eine Anzeige gilt erst als weg, wenn sie zwei Scans in Folge fehlt._');
  w('');
}
const alter = comboAktiv.map(x => { const d = dParse(x.inseratDatum); return d ? tage(d, HEUTE) : null; }).filter(v => v != null && v >= 0 && v < 400);
if (alter.length >= 2) {
  w('Laufende Combo-Anzeigen sind im Median **' + med(alter) + ' Tage** online (P75 ' + q(alter, .75) + ', längste ' + Math.max(...alter) + ').');
  w('');
}

// ---- Preisbewegungen ----
w('## Preisbewegungen');
w('');
const red = all.filter(x => x.preisVerlauf && x.preisVerlauf.length > 1);
if (red.length) {
  const d = red.map(x => x.preisAktuell - x.preisErst);
  w('- Anzeigen mit Preisänderung seit Erfassung: **' + red.length + '** (' + d.filter(v => v < 0).length + ' gesenkt, ' + d.filter(v => v > 0).length + ' erhöht), Median **' + eur(med(d)) + '**.');
  w('');
  w('| Anzeige | Stunden | von | auf |');
  w('|---|---|---|---|');
  red.sort((a, b) => (a.preisAktuell - a.preisErst) - (b.preisAktuell - b.preisErst)).slice(0, 8)
    .forEach(x => w('| ' + link(x) + (x.weg ? ' (weg)' : '') + ' | ' + std(x) + ' | ' + eur(x.preisErst) + ' | ' + eur(x.preisAktuell) + ' |'));
} else {
  w('_Noch keine Preisänderungen beobachtet._');
}
w('');

// ---- Neu diese Woche ----
const seit = new Date(HEUTE.getTime() - 7 * 86400000).toISOString().slice(0, 10);
const neuLst = all.filter(x => x.erstGesehen > seit && !x.weg && x.preisAktuell).sort((a, b) => a.preisAktuell - b.preisAktuell);
if (neuLst.length) {
  w('## Neu in dieser Woche');
  w('');
  w('| Anzeige | Fassung | Stunden | Preis | Typ |');
  w('|---|---|---|---|---|');
  neuLst.forEach(x => w('| ' + link(x) + ' | ' + (KLASSEN[x.klasse] || x.klasse) + (x.neuware ? ', neu' : x.defekt ? ', defekt' : '') + ' | ' + std(x) + ' | ' + eur(x.preisAktuell) + (x.vb ? ' VB' : '') + ' | ' + (x.gewerblich ? 'Händler' : 'Privat') + ' |'));
  w('');
}

// ---- Scanhistorie ----
w('## Scan-Historie');
w('');
w('| Datum | aktiv | neu | bestätigt weg | Verdacht | wieder da | Preisänderungen |');
w('|---|---|---|---|---|---|---|');
st.runs.slice(-14).forEach(r => w('| ' + r.datum + ' | ' + r.aktiv + ' | ' + r.neu + ' | ' + r.verschwunden + ' | ' + (r.verdacht || 0) + ' | ' + (r.wiederDa || 0) + ' | ' + r.preisAenderungen + ' |'));
w('');
w('---');
w('_Hinweise: Die Stunden stammen aus dem Anzeigentext, nicht vom Gerät – wer sie nicht nennt, fehlt in der Rechnung. "~" heißt ungefähr, "<" heißt "unter". "Verschwunden" heißt verkauft **oder** zurückgezogen. Privatpreise sind oft VB, der erzielte Preis liegt darunter. Der Neupreis kommt aus dem H2D-Watcher im selben Repo (günstigster aktueller EUR-Preis einer neuen Combo)._');

const out = L.join('\n');
const dir = path.join(__dirname, 'berichte');
fs.mkdirSync(dir, { recursive: true });
const f = path.join(dir, 'bericht-' + T + '.md');
fs.writeFileSync(f, out);
console.log(out);
console.error('\n>> gespeichert: ' + f);
