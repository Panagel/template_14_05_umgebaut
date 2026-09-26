// Hauptlauf: Preise je Variante erheben, gegen die eigene Vorgeschichte
// halten, Meldungen nach data/meldungen.json schreiben. Der Push liegt in
// notify.js - so kann der Scan auch ohne Secrets geprobt werden.
const fs = require('fs');
const path = require('path');
const { median, geld } = require('./lib.js');
const { SHOPS, variantenKlasse, klassenName } = require('./shops.js');
const CFG = require('./config.js');

const DATA = path.join(__dirname, 'data');
const STATE = path.join(DATA, 'state.json');
const MELD = path.join(DATA, 'meldungen.json');

const heute = new Date().toISOString().slice(0, 10);
const log = s => console.log(s);

function ladeState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {
    return { version: 1, shops: {} };
  }
}

function leererShop() {
  return { laeufe: 0, ausfaelle: 0, produkte: {}, kampagnen: {} };
}

function tageSeit(datum) {
  if (!datum) return 9999;
  const d = (Date.parse(heute) - Date.parse(datum)) / 86400000;
  return Number.isNaN(d) ? 9999 : d;
}

// Normalisierter Schluessel: derselbe Banner soll morgen wiedererkannt
// werden, auch wenn sich Restlaufzeit, Emoji oder Schreibweise aendern.
// Der Gutscheincode geht bewusst nicht ein - dieselbe Aktion taucht mal mit
// und mal ohne Code im Text auf und wuerde sonst doppelt melden.
function kampagnenSchluessel(b) {
  const akt = (b.aktion || '').replace(/[^a-z0-9]+/gi, '').toLowerCase();
  if (akt) return akt + '|' + (b.prozent || '');
  if (b.prozent) return 'pct' + b.prozent;
  return b.text.toLowerCase().replace(/[^a-z0-9%]+/g, '').slice(0, 48);
}

// Mehrere Fenster koennen dieselbe Aktion zeigen. Die Fassung mit Code und
// laengerem Text ist die brauchbarste - sie gewinnt.
function entdoppeln(banner) {
  const beste = new Map();
  for (const b of banner) {
    const sk = kampagnenSchluessel(b);
    const alt = beste.get(sk);
    const punkte = (b.code ? 2 : 0) + (b.aktion ? 1 : 0) + b.text.length / 1000;
    if (!alt || punkte > alt.punkte) beste.set(sk, { b: b, punkte: punkte, sk: sk });
  }
  return Array.from(beste.values()).map(x => ({ b: x.b, sk: x.sk }));
}

// Baseline ist der Median der vorherigen Laeufe, nicht der Vortagspreis:
// ein einzelner Fehlgriff verschiebt sie damit nicht.
function baseline(verlauf) {
  const werte = verlauf.slice(-CFG.baselineLaeufe).map(v => v.jetzt)
    .filter(v => typeof v === 'number' && v > 0);
  return werte.length ? median(werte) : null;
}

const rabattVon = p => (p.vorher && p.jetzt && p.vorher > p.jetzt)
  ? Math.round((1 - p.jetzt / p.vorher) * 100) : null;

async function main() {
  fs.mkdirSync(DATA, { recursive: true });
  const state = ladeState();
  // Tiefstpreise je Ausbaustufe und Waehrung, ueber alle Shops hinweg.
  if (!state.tiefstpreise) state.tiefstpreise = {};
  // Nur wo vor diesem Lauf schon ein Tiefstpreis stand, ist ein tieferer
  // Preis ein Ereignis. Beim ersten Sehen ist er bloss der Anfang der
  // Aufzeichnung - sonst waere der erste Lauf eine Meldungslawine.
  const tiefBekannt = new Set(Object.keys(state.tiefstpreise));
  const meldungen = [];
  const uebersicht = [];
  let shopsMitDaten = 0;

  for (const key of Object.keys(SHOPS)) {
    if (!CFG.aktiv[key]) { log('== ' + key + ' (aus)'); continue; }
    const cfg = SHOPS[key];
    log('== ' + cfg.name);

    const st = state.shops[key] || (state.shops[key] = leererShop());
    if (!st.produkte) st.produkte = {};
    if (!st.kampagnen) st.kampagnen = {};

    let erg;
    try {
      erg = await cfg.typ(cfg, log);
    } catch (e) {
      log('   FEHLER: ' + e.message);
      erg = { produkte: [], banner: [], hinweise: ['Ausnahme: ' + e.message] };
    }
    for (const h of (erg.hinweise || [])) log('   ? ' + h);

    // Kein Abbruch, wenn ein Shop schweigt - die anderen laufen weiter.
    // Aber dauerhafte Stille muss auffallen, sonst haelt man sie fuer
    // "kein Angebot".
    if (!erg.produkte.length) {
      st.ausfaelle = (st.ausfaelle || 0) + 1;
      log('   kein Geraet gelesen - Shop uebersprungen (Ausfall ' + st.ausfaelle + ')');
      if (st.ausfaelle === 3 || st.ausfaelle === 12) {
        meldungen.push({
          typ: 'ausfall', shop: cfg.name, url: cfg.suchUrl || cfg.basis,
          titel: cfg.name + ': liefert seit ' + st.ausfaelle + ' Laeufen keine Preise',
          gruende: ['Der Shop blockt die Abfrage, hat die Seite umgebaut oder fuehrt das Geraet nicht mehr.',
                    'Die anderen Shops laufen normal weiter.'],
          produkte: []
        });
      }
      continue;
    }
    if (st.ausfaelle) { log('   wieder erreichbar nach ' + st.ausfaelle + ' Ausfaellen'); st.ausfaelle = 0; }
    shopsMitDaten++;

    const zeilen = [];

    // Welche Kennung steht schon in welcher Waehrung im Zustand? Wechselt
    // ein Shop die Waehrung - weil der Runner in einer anderen Region
    // steht -, sind alle Varianten formal neu. Als "neu im Shop" waere das
    // falsch und waeren es auf einen Schlag sechs Meldungen.
    const bekannteWaehrung = new Map();
    for (const k of Object.keys(st.produkte)) {
      const trenner = k.lastIndexOf('|');
      if (trenner > 0) bekannteWaehrung.set(k.slice(0, trenner), k.slice(trenner + 1));
    }

    // ---- Signale 1, 2 und 4: Preis, Rabatt, Lieferbarkeit --------------
    for (const p of erg.produkte) {
      // Die Waehrung gehoert in den Schluessel. Derselbe Shop antwortet je
      // nach Standort des Runners in USD oder EUR; ohne diese Trennung
      // waere der erste Wechsel ein Preissturz von 15 Prozent, den es nie
      // gegeben hat.
      const id = p.id + '|' + (p.waehrung || '?');
      const g = c => geld(c, p.waehrung);
      const alt = st.produkte[id];
      const rab = rabattVon(p);
      const gruende = [];
      let typ = null;

      // --- Tiefstpreis ueber alle Shops --------------------------------
      // Verglichen wird ueber Shopgrenzen hinweg, aber nur innerhalb einer
      // Waehrung und derselben Ausbaustufe: der Preis eines Laser-Combo
      // sagt nichts ueber das nackte Geraet.
      const klasse = variantenKlasse(p.name);
      const tKey = klasse + '|' + (p.waehrung || '?');
      const tief = state.tiefstpreise[tKey];
      let tiefstand = null;
      if (CFG.tiefstpreisMelden && tief && tiefBekannt.has(tKey) && p.jetzt < tief.preis) {
        tiefstand = 'Tiefstpreis fuer ' + klassenName(klasse) + ': ' + g(p.jetzt) +
                    ' - billiger als alles bisher Gesehene (' + geld(tief.preis, tief.waehrung) +
                    ' bei ' + tief.shop + ' am ' + tief.datum + ')';
      }
      if (!tief || p.jetzt < tief.preis) {
        state.tiefstpreise[tKey] = {
          klasse: klasse, preis: p.jetzt, waehrung: p.waehrung || '?',
          shop: cfg.name, name: p.name, url: p.url, datum: heute
        };
      }

      if (!alt) {
        // Erstsichtung: Grundlage anlegen, nicht bewerten. Nur wenn der Shop
        // vorher schon geliefert hat, ist eine neue Variante eine Nachricht.
        st.produkte[id] = {
          name: p.name, url: p.url, waehrung: p.waehrung,
          verlauf: [{ datum: heute, jetzt: p.jetzt, vorher: p.vorher, rabatt: rab, verfuegbar: p.verfuegbar }],
          bestpreis: p.jetzt, bestpreisDatum: heute,
          gemeldeterPreis: null, letzterRabatt: rab, verfuegbar: p.verfuegbar,
          zuletztGesehen: heute
        };
        const altWaehrung = bekannteWaehrung.get(p.id);
        const nurWaehrung = altWaehrung && altWaehrung !== (p.waehrung || '?');
        if (!tiefstand) {
          log('   + ' + p.name + '  ' + g(p.jetzt) + (rab ? '  (-' + rab + '%)' : '') +
              (nurWaehrung ? '  Waehrungswechsel ' + altWaehrung + ' -> ' + (p.waehrung || '?') + ', Grundlage faengt neu an'
                           : (st.laeufe > 0 ? '  NEU' : '  erfasst')));
        }
        if (tiefstand) {
          // Eine neue Variante, die alles unterbietet: das ist keine
          // Katalognachricht, das ist der Tiefstpreis.
          meldungen.push({
            typ: 'tiefstand', shop: cfg.name, url: p.url || cfg.basis,
            titel: 'Tiefstpreis ' + klassenName(klasse) + ': ' + g(p.jetzt) + ' bei ' + cfg.name,
            gruende: [tiefstand, 'Die Variante ist im Shop neu: ' + p.name]
              .concat(cfg.hinweis ? [cfg.hinweis] : []),
            produkte: [zeile(p, rab, p.jetzt)]
          });
          log('   ! ' + p.name + '  ' + g(p.jetzt) + '  NEU und ' + tiefstand);
        } else if (st.laeufe > 0 && CFG.neueVariantenMelden && !nurWaehrung) {
          meldungen.push({
            typ: 'neu', shop: cfg.name, url: p.url || cfg.basis,
            titel: cfg.name + ': ' + p.name + ' neu im Shop',
            gruende: ['Erstmals gelistet zu ' + g(p.jetzt) + (rab ? ' (-' + rab + '% gegen ' + g(p.vorher) + ')' : '')],
            produkte: [zeile(p, rab, p.jetzt)]
          });
        }
        zeilen.push(zeile(p, rab, p.jetzt));
        continue;
      }

      const bGrund = baseline(alt.verlauf);
      const istBestpreis = typeof alt.bestpreis === 'number' && p.jetzt < alt.bestpreis;
      const istRutsch = bGrund && p.jetzt <= Math.round(bGrund * (1 - CFG.preisSprungProzent / 100));

      // Den shop-eigenen Tiefstand nicht doppelt sagen: hielt derselbe Shop
      // schon die Bestmarke, steht es in der Tiefstpreiszeile.
      if (istBestpreis && CFG.bestpreisMelden && !(tiefstand && tief && tief.shop === cfg.name)) {
        gruende.push('Tiefster Preis, den dieser Shop bisher hatte: ' + g(p.jetzt) +
                     ' (vorher ' + g(alt.bestpreis) + ' am ' + (alt.bestpreisDatum || '?') + ')');
      }
      if (istRutsch) {
        gruende.push('Preis ' + g(bGrund) + ' -> ' + g(p.jetzt) +
                     ' (-' + Math.round((1 - p.jetzt / bGrund) * 100) + '% gegen den Median der letzten Laeufe)');
      }
      // Ein neu ausgewiesener oder tieferer Streichpreisrabatt ist ein
      // eigenes Signal: er zeigt, dass der Shop selbst von Aktion spricht.
      if (rab !== null && rab >= CFG.rabattMinProzent && (alt.letzterRabatt === null || alt.letzterRabatt === undefined || rab > alt.letzterRabatt)) {
        gruende.push('Shop weist -' + rab + '% aus: ' + g(p.vorher) + ' -> ' + g(p.jetzt));
      }
      if (gruende.length) typ = 'preis';
      // Der Tiefstpreis ueber alle Shops ist die wichtigste Nachricht: er
      // steht als erster Grund und hebt den Meldetyp. Damit geht er mit
      // hoechster Prioritaet raus - und die Meldebremse unten greift nicht,
      // weil die nur Meldungen vom Typ "preis" zurueckhaelt.
      if (tiefstand) { gruende.unshift(tiefstand); typ = 'tiefstand'; }

      // Meldebremse: dieselbe Senkung nicht jeden Lauf wiederholen. Erst ein
      // noch tieferer Preis meldet erneut.
      let gebremst = false;
      if (typ === 'preis' && CFG.nurTieferMelden && typeof alt.gemeldeterPreis === 'number' && p.jetzt >= alt.gemeldeterPreis) {
        log('   = ' + p.name + '  ' + g(p.jetzt) + '  (schon gemeldet zu ' + g(alt.gemeldeterPreis) + ')');
        gruende.length = 0;
        typ = null;
        gebremst = true;
      }

      // Lieferbarkeit: aus "nicht lieferbar" wird "lieferbar".
      if (CFG.verfuegbarkeitMelden && p.verfuegbar === 'ja' && alt.verfuegbar && alt.verfuegbar !== 'ja') {
        gruende.push('Wieder lieferbar (vorher: ' + (alt.verfuegbar === 'vorbestellung' ? 'Vorbestellung' : 'nicht lieferbar') + ')');
        if (!typ) typ = 'verfuegbar';
      }

      if (typ) {
        if (cfg.hinweis) gruende.push(cfg.hinweis);
        meldungen.push({
          typ: typ, shop: cfg.name, url: p.url || cfg.basis,
          titel: typ === 'tiefstand'
            ? 'Tiefstpreis ' + klassenName(klasse) + ': ' + g(p.jetzt) + ' bei ' + cfg.name
            : cfg.name + ': ' + p.name + (typ === 'preis' ? ' fuer ' + g(p.jetzt) : ' wieder lieferbar'),
          gruende: gruende,
          produkte: [zeile(p, rab, Math.min(p.jetzt, alt.bestpreis || p.jetzt))]
        });
        log('   ! ' + p.name + '  ' + g(p.jetzt) + '  ' + gruende.join(' | '));
        if (typ === 'preis' || typ === 'tiefstand') alt.gemeldeterPreis = p.jetzt;
      } else if (!gebremst) {
        log('   . ' + p.name + '  ' + g(p.jetzt) + (rab ? '  (-' + rab + '%)' : '') +
            '  [Tief ' + g(alt.bestpreis) + ']');
      }

      // Steigt der Preis wieder ueber den gemeldeten Stand, ist die Bremse
      // geloest: die naechste Senkung darf wieder melden.
      if (typeof alt.gemeldeterPreis === 'number' && p.jetzt > alt.gemeldeterPreis) alt.gemeldeterPreis = null;

      alt.name = p.name;
      alt.url = p.url || alt.url;
      alt.verfuegbar = p.verfuegbar;
      alt.letzterRabatt = rab;
      alt.zuletztGesehen = heute;
      if (typeof alt.bestpreis !== 'number' || p.jetzt < alt.bestpreis) { alt.bestpreis = p.jetzt; alt.bestpreisDatum = heute; }
      alt.verlauf.push({ datum: heute, jetzt: p.jetzt, vorher: p.vorher, rabatt: rab, verfuegbar: p.verfuegbar });
      if (alt.verlauf.length > 180) alt.verlauf = alt.verlauf.slice(-180);
      zeilen.push(zeile(p, rab, alt.bestpreis));
    }

    // ---- Signal 3: beworbene Kampagne ---------------------------------
    for (const eintrag of entdoppeln(erg.banner || [])) {
      const b = eintrag.b, sk = eintrag.sk;
      if (!b.aktion && (!b.prozent || b.prozent < CFG.kampagneMinProzent)) continue;
      const altK = st.kampagnen[sk];
      const warStill = !altK || tageSeit(altK.zuletzt) > CFG.kampagneStillTage;
      st.kampagnen[sk] = {
        text: b.text, prozent: b.prozent, code: b.code, aktion: b.aktion,
        seit: (altK && !warStill) ? altK.seit : heute,
        zuletzt: heute
      };
      if (warStill) {
        meldungen.push({
          typ: 'kampagne', shop: cfg.name, url: cfg.suchUrl || cfg.basis,
          titel: cfg.name + ': ' + (b.aktion ? b.aktion.toUpperCase() : (b.prozent + '% Aktion')),
          text: b.text, prozent: b.prozent, code: b.code,
          produkte: zeilen.slice(0, 6)
        });
        log('   NEUE KAMPAGNE: ' + b.text.slice(0, 90));
      }
    }

    // Varianten, die lange nicht mehr auftauchen, aus dem Zustand nehmen -
    // sonst waechst die Datei mit jedem ausgelaufenen Bundle weiter.
    for (const id of Object.keys(st.produkte)) {
      if (tageSeit(st.produkte[id].zuletztGesehen) > 120) delete st.produkte[id];
    }

    st.laeufe = (st.laeufe || 0) + 1;
    uebersicht.push({ shop: cfg.name, produkte: zeilen });
  }

  state.letzterLauf = new Date().toISOString();
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
  // Tiefstpreise mitschreiben: so zeigt die Testmeldung, was der Watcher
  // als Bestmarke fuehrt, ohne dass man state.json lesen muss.
  const tiefstListe = Object.keys(state.tiefstpreise).sort().map(k => {
    const t = state.tiefstpreise[k];
    return { klasse: klassenName(t.klasse || k.split('|')[0]), preis: geld(t.preis, t.waehrung),
             shop: t.shop, datum: t.datum, url: t.url };
  });
  fs.writeFileSync(MELD, JSON.stringify({
    datum: heute, meldungen: meldungen, uebersicht: uebersicht, tiefstpreise: tiefstListe
  }, null, 1));

  log('');
  log('Tiefstpreise bisher:');
  for (const t of tiefstListe) log('   ' + t.klasse.padEnd(34) + t.preis.padStart(14) + '  ' + t.shop + '  (' + t.datum + ')');
  log('');
  log('Meldungen: ' + meldungen.length + ' | Shops mit Daten: ' + shopsMitDaten);

  // Nur hart scheitern, wenn gar nichts ging - sonst faellt der Workflow
  // jedes Mal um, sobald ein einzelner Shop zickt.
  if (shopsMitDaten === 0) {
    console.error('Kein einziger Shop lieferte Preise.');
    process.exit(1);
  }
}

function zeile(p, rab, bestpreis) {
  const g = c => geld(c, p.waehrung);
  return {
    name: p.name, jetzt: g(p.jetzt), vorher: p.vorher ? g(p.vorher) : null,
    rabatt: rab, bestpreis: bestpreis ? g(bestpreis) : null,
    verfuegbar: p.verfuegbar, url: p.url
  };
}

main().catch(e => { console.error(e); process.exit(1); });
