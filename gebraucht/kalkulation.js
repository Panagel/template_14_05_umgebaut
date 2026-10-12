// Kalkulation: was ist ein gebrauchter H2D mit AMS 2 Pro wert - und was
// kostet jede Druckstunde an Wiederverkaufswert?
//
// Beim Motorrad traegt der Kilometerstand den Preis, beim Drucker sind es die
// Druckstunden. Gerechnet wird
//
//   Preis = Grundwert + Stundensatz x Stunden
//
// ueber alle gebrauchten Combos, die ihre Stunden nennen. Der Grundwert ist
// das, was ein gebrauchtes Geraet mit null Stunden kostet - der Abstand zum
// Neupreis ist der Abschlag fuers Gebrauchtsein schlechthin. Der Stundensatz
// ist der Wertverlust je Druckstunde.
//
// Geschaetzt mit Theil-Sen (Median aller paarweisen Steigungen), nicht mit
// kleinsten Quadraten: der Markt ist klein, und ein einzelner Ausreisser
// - "4530h" fuer 1.400 EUR - wuerde eine OLS-Gerade allein drehen.
const fs = require('fs');
const path = require('path');

const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const rund = (v, s) => v == null ? null : Math.round(v / (s || 1)) * (s || 1);

// Neupreis als Referenz. Der H2D-Watcher im selben Repo fuehrt ihn ohnehin:
// der guenstigste aktuelle EUR-Preis einer neuen Combo (heute reichelt).
// Faellt der aus, gilt der zuletzt gemessene Listenpreis.
const NEUPREIS_FALLBACK = 1749;

function neupreis() {
  try {
    const { variantenKlasse } = require('../shops.js');
    const st = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'state.json'), 'utf8'));
    let best = null;
    for (const [shop, s] of Object.entries(st.shops || {})) {
      for (const p of Object.values(s.produkte || {})) {
        if (p.waehrung !== 'EUR' || variantenKlasse(p.name) !== 'combo') continue;
        const l = p.verlauf && p.verlauf[p.verlauf.length - 1];
        if (!l || !l.jetzt) continue;
        // nur, was der Watcher in den letzten zwei Wochen noch gesehen hat
        if (p.zuletztGesehen && (Date.now() - new Date(p.zuletztGesehen)) / 86400000 > 14) continue;
        const eur = Math.round(l.jetzt / 100);
        if (!best || eur < best.preis) best = { preis: eur, quelle: shop, name: p.name, datum: l.datum };
      }
    }
    if (best) return best;
  } catch (e) { /* Watcher-Zustand fehlt - Fallback */ }
  return { preis: NEUPREIS_FALLBACK, quelle: 'Listenpreis', name: 'H2D AMS Combo', datum: null };
}

// Theil-Sen: robuste Gerade durch (x, y).
function theilSen(pkt) {
  const st = [];
  for (let i = 0; i < pkt.length; i++)
    for (let j = i + 1; j < pkt.length; j++)
      if (pkt[j].x !== pkt[i].x) st.push((pkt[j].y - pkt[i].y) / (pkt[j].x - pkt[i].x));
  if (!st.length) return null;
  const b = med(st);
  const a = med(pkt.map(p => p.y - b * p.x));
  return { a: a, b: b, n: pkt.length };
}

// Die Segmente. "Combo" ist das gesuchte Geraet: H2D mit genau einem AMS
// (2 Pro), gebraucht, funktionsfaehig.
function segmente(st) {
  const all = Object.values(st.listings);
  const plaus = x => x.preisAktuell && x.preisAktuell >= 500 && x.preisAktuell <= 5000;
  const gebraucht = x => plaus(x) && !x.neuware && !x.defekt;
  return {
    all: all,
    combo: all.filter(x => x.klasse === 'combo' && gebraucht(x)),
    comboNeu: all.filter(x => x.klasse === 'combo' && plaus(x) && x.neuware),
    andere: all.filter(x => x.klasse !== 'combo' && x.klasse !== 'pro' && gebraucht(x)),
    defekt: all.filter(x => plaus(x) && x.defekt)
  };
}

// Fuer die Gerade zaehlen nur eindeutige Stundenangaben: keine Sammelanzeige
// mit zwei Druckern (welche Stunden gehoeren zu welchem Preis?), keine
// "unter 100h"-Obergrenze als Messwert, wenn genug echte Werte da sind.
function stundenPunkte(arr) {
  const p = arr.filter(x => x.stunden != null && !x.mehrereDrucker && x.stundenArt !== 'neu');
  const genau = p.filter(x => x.stundenArt !== 'max');
  return (genau.length >= 4 ? genau : p).map(x => ({ x: x.stunden, y: x.preisAktuell, id: x.id }));
}

function kalkulation(st, opt) {
  opt = opt || {};
  const N = opt.neupreis || neupreis();
  const S = segmente(st);
  // Gerade aus allen je gesehenen Combos - auch verkauften. Ein verkauftes
  // Geraet war ein Angebot zu diesem Preis; die Datenbasis waechst so mit
  // jeder Woche, statt bei den paar gerade aktiven stehen zu bleiben.
  const pkt = stundenPunkte(S.combo);
  const spanne = pkt.length ? Math.max(...pkt.map(p => p.x)) - Math.min(...pkt.map(p => p.x)) : 0;
  let modell = null, modellArt = null;
  if (pkt.length >= 3 && spanne >= 150) {
    modell = theilSen(pkt);
    modellArt = 'markt';
  }
  // Steigt der Preis mit den Stunden, ist das Rauschen, kein Effekt. Dann,
  // und solange zu wenige Punkte da sind, rechnet der Vergleich je Anzeige
  // gegen den Neupreis: (Neupreis - Preis) / Stunden. Das ueberschaetzt den
  // Stundensatz, weil der Gebrauchtabschlag mit drinsteckt - deshalb nur
  // als Notbehelf.
  if (modell && modell.b >= 0) { modell.unplausibel = true; }

  const proAnzeige = S.combo.filter(x => !x.weg).map(x => {
    const r = {
      id: x.id, titel: x.titel, preis: x.preisAktuell, vb: x.vb, stunden: x.stunden, stundenArt: x.stundenArt,
      alterMonate: x.alterMonate, gewerblich: x.gewerblich, ort: x.ort, href: x.href, mehrereDrucker: x.mehrereDrucker,
      beigaben: x.beigaben, inseratDatum: x.inseratDatum,
      restwert: x.preisAktuell / N.preis,
      verlust: N.preis - x.preisAktuell
    };
    if (x.stunden != null && x.stunden >= 20) r.euroJe100h = (N.preis - x.preisAktuell) / x.stunden * 100;
    // Sammelanzeige mehrerer Drucker: welche Stunden zu welchem Preis
    // gehoeren, ist offen - keine Schaetzung, kein Urteil.
    if (modell && !modell.unplausibel && !x.mehrereDrucker) {
      if (x.stunden != null) {
        r.schaetzwert = modell.a + modell.b * x.stunden;
        r.abweichung = (x.preisAktuell - r.schaetzwert) / r.schaetzwert;
      } else {
        // Keine Stunden genannt: welcher Stundenstand passt zum Preis?
        const h = (x.preisAktuell - modell.a) / modell.b;
        r.impliziteStunden = Math.max(0, h);
      }
    }
    if (r.abweichung != null) r.urteil = r.abweichung <= -0.07 ? 'guenstig' : r.abweichung >= 0.07 ? 'teuer' : 'fair';
    return r;
  });

  const satzJeAnzeige = proAnzeige.map(r => r.euroJe100h).filter(v => v != null && v > 0);
  const stundensatz = modell && !modell.unplausibel ? -modell.b : null;

  // Prognose: was bringt ein Geraet bei x Stunden?
  // Nur so weit, wie Messpunkte reichen: eine Gerade ueber den letzten
  // Punkt hinaus ist geraten.
  const maxH = pkt.length ? Math.max(...pkt.map(p => p.x)) : 0;
  const prognose = modell && !modell.unplausibel
    ? [0, 250, 500, 1000, 1500, 2000, 3000, 5000].filter((h, i, a) => h <= maxH || (i > 0 && a[i - 1] < maxH))
      .map(h => ({ h: h, preis: Math.max(0, modell.a + modell.b * h) }))
    : [];

  return {
    neupreis: N,
    segmente: S,
    punkte: pkt,
    modell: modell,
    modellArt: modellArt,
    stundensatz: stundensatz,                 // EUR Wertverlust je Druckstunde
    gebrauchtAbschlag: modell && !modell.unplausibel ? N.preis - modell.a : null,
    satzJeAnzeigeMedian: med(satzJeAnzeige),  // Notbehelf ohne Modell
    proAnzeige: proAnzeige,
    prognose: prognose
  };
}

module.exports = { kalkulation, neupreis, segmente, theilSen, med, q, rund };

// ---------- Ausgabe auf der Konsole ----------
if (require.main === module) {
  const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'state.json'), 'utf8'));
  const K = kalkulation(st);
  const eur = v => v == null ? '-' : Math.round(v).toLocaleString('de-DE') + ' EUR';
  console.log('Neupreis Combo: ' + eur(K.neupreis.preis) + ' (' + K.neupreis.quelle + (K.neupreis.datum ? ', ' + K.neupreis.datum : '') + ')');
  console.log('Gebrauchte Combos erfasst: ' + K.segmente.combo.length + ', aktiv ' + K.proAnzeige.length + ', mit Stunden ' + K.punkte.length);
  if (K.stundensatz != null) {
    console.log('Modell (n=' + K.modell.n + '): Preis = ' + eur(K.modell.a) + ' - ' + K.stundensatz.toFixed(2) + ' EUR x Stunden');
    console.log('  -> je 100 Druckstunden ' + eur(K.stundensatz * 100) + ' Wertverlust, Gebrauchtabschlag ' + eur(K.gebrauchtAbschlag));
    for (const p of K.prognose) console.log('     ' + String(p.h).padStart(5) + ' h  ' + eur(p.preis));
  } else {
    console.log('Noch kein Stundenmodell (' + K.punkte.length + ' Punkte' + (K.modell && K.modell.unplausibel ? ', Steigung unplausibel' : '') + ').' +
      (K.satzJeAnzeigeMedian != null ? ' Notbehelf: Median ' + eur(K.satzJeAnzeigeMedian) + ' je 100 h gegen Neupreis.' : ''));
  }
  console.log('');
  for (const r of K.proAnzeige.sort((a, b) => a.preis - b.preis))
    console.log(String(r.preis).padStart(6) + (r.vb ? ' VB' : '   ') + '  ' + (r.stunden != null ? String(r.stunden).padStart(5) + ' h' : '    ? h') +
      '  Restwert ' + Math.round(100 * r.restwert) + '%' +
      (r.schaetzwert != null ? '  Schaetzung ' + eur(r.schaetzwert) + ' (' + (r.abweichung > 0 ? '+' : '') + Math.round(100 * r.abweichung) + '%, ' + r.urteil + ')' : '') +
      (r.impliziteStunden != null ? '  Preis passt zu ~' + Math.round(r.impliziteStunden) + ' h' : '') +
      '  ' + (r.titel || '').slice(0, 45));
}
