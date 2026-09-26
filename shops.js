// Shop-Adapter. Jeder liefert { produkte, banner, hinweise } fuer einen Lauf.
//
// Zwei Zugriffsarten reichen fuer den ganzen Markt:
//
//   shopify - der Bambu-Lab-Shop selbst. Seine JSON-Endpunkte nennen Preis,
//             Streichpreis und Lagerstand jeder Variante exakt in Cent. Kein
//             Parsen von Markup, also auch nichts, was ein Theme-Update
//             kaputtmacht.
//   jsonld  - jeder Haendler. Wer bei Google Shopping auftauchen will, legt
//             seine Preise als schema.org-Product in die Seite. Das ist die
//             einzige Schnittstelle, die alle Shops gemeinsam haben.
const { get, getJson, textOf, unent, cents, sleep, produkteAusJsonLd, linksMitModell } = require('./lib.js');
const CFG = require('./config.js');

// Ein Treffer ist das gesuchte Geraet, wenn der Name das Modell nennt, kein
// Zubehoerwort enthaelt und der Preis in der plausiblen Spanne liegt.
//
// Die Preisspanne ist der wichtigste der drei Tests: Duesen, Bauplatten und
// Ersatzteile tragen "H2D" genauso im Namen wie der Drucker, kosten aber
// zweistellig. Ohne diese Schranke wandert die erste Duese als "neuer
// Bestpreis" ins Handy.
function istModell(p) {
  if (!p || typeof p.jetzt !== 'number') return false;
  const name = String(p.name || '');
  if (!CFG.modellRe.test(name)) return false;
  if (CFG.ausschlussRe.test(name)) return false;
  return p.jetzt >= CFG.preisMin && p.jetzt <= CFG.preisMax;
}

// Warum ein Treffer durchgefallen ist - nur fuer die Diagnose.
function warumNicht(p) {
  const name = String(p.name || '');
  if (typeof p.jetzt !== 'number') return 'kein Preis';
  if (!CFG.modellRe.test(name)) return 'Name nennt das Modell nicht';
  if (CFG.ausschlussRe.test(name)) return 'Zubehoer (' + (name.match(CFG.ausschlussRe) || [''])[0] + ')';
  if (p.jetzt < CFG.preisMin) return 'zu billig fuer ein Geraet';
  if (p.jetzt > CFG.preisMax) return 'zu teuer, wohl ein Bundle-Sammelposten';
  return 'unklar';
}

// ---------------------------------------------------------------- Shopify
// /products/<handle>.js gibt genau das, was der Watcher braucht:
// price und compare_at_price in Cent, available je Variante.
function ausShopifyProdukt(pr, basis) {
  const out = [];
  const varianten = Array.isArray(pr.variants) && pr.variants.length ? pr.variants : [{
    id: pr.id, title: '', price: pr.price, compare_at_price: pr.compare_at_price,
    available: pr.available, sku: null
  }];
  for (const v of varianten) {
    const jetzt = cents(typeof v.price === 'number' ? v.price / 100 : v.price);
    let vorher = cents(typeof v.compare_at_price === 'number' ? v.compare_at_price / 100 : v.compare_at_price);
    // Shopify traegt den Streichpreis oft gleich dem Preis ein, wenn keine
    // Aktion laeuft. Das ist kein Rabatt von 0 %, das ist kein Rabatt.
    if (vorher !== null && jetzt !== null && vorher <= jetzt) vorher = null;
    const zusatz = v.title && !/^default title$/i.test(v.title) ? ' - ' + v.title : '';
    out.push({
      id: 'v' + (v.id || v.sku || pr.handle),
      name: unent(String(pr.title || '')).trim() + zusatz,
      jetzt: jetzt,
      vorher: vorher,
      waehrung: null,                       // Shopify nennt sie hier nicht
      verfuegbar: v.available === false ? 'nein' : (v.available === true ? 'ja' : null),
      url: basis + '/products/' + pr.handle + (v.id ? '?variant=' + v.id : '')
    });
  }
  return out;
}

async function shopify(cfg, log) {
  const gefunden = new Map();          // handle -> Produktobjekt
  const hinweise = [];

  // 1. Suchvorschlaege: klein, schnell und nennt die echten Handles. Damit
  //    muss keine Adresse geraten werden - neue Varianten wie ein spaeteres
  //    Pro-Modell tauchen von allein auf.
  const sug = await getJson(cfg.basis + '/search/suggest.json?q=' + encodeURIComponent(cfg.suche) +
    '&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=show');
  const treffer = sug.daten && sug.daten.resources && sug.daten.resources.results
    ? (sug.daten.resources.results.products || []) : [];
  if (treffer.length) {
    log('    Suche: ' + treffer.length + ' Vorschlaege');
    for (const t of treffer) if (t.handle) gefunden.set(t.handle, null);
  } else {
    hinweise.push('suggest.json: HTTP ' + sug.status + (sug.daten ? ' (keine Treffer)' : ''));
    log('    Suche: HTTP ' + sug.status + ' - ohne Treffer');
  }

  // 2. Bekannte Handles aus der Konfiguration dazu. Faellt die Suche aus,
  //    laeuft der Watcher darueber weiter.
  for (const h of (cfg.handles || [])) if (!gefunden.has(h)) gefunden.set(h, null);

  // 3. Jedes Handle einzeln abfragen - das ist die einzige Quelle mit
  //    verlaesslichen Cent-Betraegen.
  const produkte = [], verworfen = [];
  for (const handle of gefunden.keys()) {
    const r = await getJson(cfg.basis + '/products/' + handle + '.js');
    if (!r.daten) {
      if (r.status !== 404) hinweise.push('products/' + handle + '.js: HTTP ' + r.status);
      continue;
    }
    for (const p of ausShopifyProdukt(r.daten, cfg.basis)) {
      if (istModell(p)) produkte.push(p); else verworfen.push(p);
    }
    await sleep(500);
  }

  // 4. Rueckfallweg: die Sammlung mit den Druckern am Stueck. Nur noetig,
  //    wenn Suche und Handles beide nichts hergaben.
  if (!produkte.length && cfg.sammlung) {
    const r = await getJson(cfg.basis + '/collections/' + cfg.sammlung + '/products.json?limit=250');
    const liste = r.daten && r.daten.products ? r.daten.products : [];
    log('    Sammlung ' + cfg.sammlung + ': ' + liste.length + ' Produkte (HTTP ' + r.status + ')');
    for (const pr of liste) {
      for (const p of ausShopifyProdukt(pr, cfg.basis)) {
        if (istModell(p)) produkte.push(p); else verworfen.push(p);
      }
    }
    if (!liste.length) hinweise.push('collections/' + cfg.sammlung + '/products.json: HTTP ' + r.status);
  }

  log('    ' + produkte.length + ' Geraete, ' + verworfen.length + ' verworfen (Zubehoer/Preisspanne)');

  // Banner von der Startseite: dort steht die beworbene Aktion samt Code.
  const home = await get(cfg.basis + '/');
  if (home.status !== 200) hinweise.push('Startseite: HTTP ' + home.status);
  return { produkte: produkte, banner: sammleBanner(home.body || ''), hinweise: hinweise, verworfen: verworfen };
}

// ----------------------------------------------------------------- JSON-LD
// Erst die Trefferliste, dann - falls die ihre Preise erst per JavaScript
// nachlaedt - die Detailseiten der passenden Links. Beide Wege enden im
// gleichen schema.org-Block.
async function jsonld(cfg, log) {
  const hinweise = [];
  const produkte = [], verworfen = [];
  const gesehen = new Set();
  let bannerHtml = '';

  const nimm = (liste, quelle) => {
    let neu = 0;
    for (const p of liste) {
      const key = p.id || p.url || p.name;
      if (!key || gesehen.has(key)) continue;
      gesehen.add(key);
      if (istModell(p)) { produkte.push(p); neu++; } else verworfen.push(p);
    }
    if (neu) log('    ' + quelle + ': ' + neu + ' Geraete');
    return neu;
  };

  // Direkte Produktseiten zuerst: wenn eine konfiguriert ist, ist sie
  // geprueft und damit verlaesslicher als jede Suchausgabe.
  for (const u of (cfg.produktUrls || [])) {
    const r = await get(u);
    if (r.status !== 200 || !r.body) { hinweise.push(u.replace(cfg.basis, '') + ': HTTP ' + r.status); continue; }
    if (!bannerHtml) bannerHtml = r.body;
    nimm(produkteAusJsonLd(r.body, cfg.basis), 'Produktseite');
    await sleep(900);
  }

  // Suche: faengt Varianten, die in keiner Konfiguration stehen.
  if (cfg.suchUrl) {
    const r = await get(cfg.suchUrl);
    if (r.status !== 200 || !r.body) {
      hinweise.push('Suche: HTTP ' + r.status);
      log('    Suche: HTTP ' + r.status);
    } else {
      if (!bannerHtml) bannerHtml = r.body;
      const ausListe = nimm(produkteAusJsonLd(r.body, cfg.basis), 'Trefferliste');
      // Kein Preis in der Liste: den Detailseiten nachgehen, aber gedeckelt.
      if (!ausListe) {
        const links = linksMitModell(r.body, cfg.basis, CFG.modellRe)
          .filter(u => !CFG.ausschlussRe.test(u.replace(/[-_/]/g, ' ')))
          .slice(0, cfg.maxDetailseiten || 5);
        log('    Trefferliste ohne Preise - ' + links.length + ' Detailseiten');
        for (const u of links) {
          const d = await get(u);
          if (d.status !== 200 || !d.body) { hinweise.push(u.replace(cfg.basis, '') + ': HTTP ' + d.status); continue; }
          nimm(produkteAusJsonLd(d.body, cfg.basis), 'Detailseite');
          await sleep(900);
        }
      }
    }
  }

  log('    ' + produkte.length + ' Geraete, ' + verworfen.length + ' verworfen');
  return { produkte: produkte, banner: sammleBanner(bannerHtml), hinweise: hinweise, verworfen: verworfen };
}

// ----------------------------------------------------------- Bannersuche
// Beworbene Aktionen stehen als Fliesstext im Seitenkopf, oft samt Code:
// "Summer Sale - up to 15% off, code SUMMER15".
//
// Wortgrenzen sind Pflicht: ohne sie steckt "sale" in "wholesale" und
// "deal" in "dealer". Der Bambu-Shop ist englisch, die Haendler sind
// deutsch - beide Sprachen muessen rein.
const AKTION_RE = /(black\s*friday|cyber\s*(?:monday|week)|singles[\s-]*day|double\s*1?11|prime\s*day|winter[\s-]*(?:sale|schlussverkauf)|sommer[\s-]*(?:sale|schlussverkauf)|summer[\s-]*sale|spring[\s-]*sale|autumn[\s-]*sale|fall[\s-]*sale|fr[uü]hjahr[s]?[\s-]*sale|herbst[\s-]*sale|jahres(?:end|abschluss|wechsel)[\s-]*sale|saison(?:end|start)[\s-]*sale|\bschlussverkauf\b|mid[\s-]*season[\s-]*sale|end[\s-]*of[\s-]*season|season[\s-]*(?:sale|finale)|sale[\s-]*finale|final[\s-]*sale|super[\s-]*sale|mega[\s-]*sale|clearance|\bostern\b|oster[\s-]*(?:sale|aktion|deal)|easter[\s-]*sale|\bweihnacht(?:s[\s-]*(?:sale|aktion))?|christmas[\s-]*sale|x-?mas[\s-]*sale|\badvent(?:s[\s-]*(?:sale|aktion))?\b|jubil[aä]um|anniversary[\s-]*sale|lagerverkauf|r[aä]umungsverkauf|deal[\s-]*(?:days|week)|aktionswoche|flash[\s-]*sale|back[\s-]*to[\s-]*school|maker[\s-]*(?:days|fest|week)|creator[\s-]*(?:days|fest)|bundle[\s-]*(?:deal|sale|angebot)|trade[\s-]*in|launch[\s-]*(?:sale|angebot|offer)|preissenkung|price[\s-]*(?:drop|cut))/i;

const PROZENT_RE = /(?:bis\s*zu\s*|up\s*to\s*)?-?\s?(\d{1,2})\s?%/;
const CODE_RE = /\b(?:code|gutschein|coupon)[:\s]*([A-Z0-9][A-Z0-9_-]{3,19})\b/i;
const BREIT_RE = /auf\s+alles|on\s*top|off\s+(?:all|everything|sitewide)|gesamt|sortiment|rabatt|discount|gutschein|coupon|code|sparen|save/i;

// "Code kopiert" ist ein Bedienhinweis, kein Gutschein.
const CODE_BLACKLIST = /^(KOPIERT|KOPIEREN|COPIED|RABATT|GUTSCHEIN|DISCOUNT|COUPON|EINGEBEN|SICHERN|AKTION|SHIPPING)$/;

// Fenster um einen Treffer schneiden, an Wortgrenzen statt mitten im Wort.
function fenster(txt, pos, vor, nach) {
  let a = Math.max(0, pos - vor);
  let b = Math.min(txt.length, pos + nach);
  if (a > 0) { const s = txt.indexOf(' ', a); if (s > -1 && s < pos) a = s + 1; }
  if (b < txt.length) { const s = txt.lastIndexOf(' ', b); if (s > pos) b = s; }
  return txt.slice(a, b).trim();
}

// Das Fenster faengt Navigation mit ein, weil der Seitentext am Stueck
// vorliegt. Fuer die Push-Nachricht den werblichen Kern herausschneiden.
function zuschneiden(s) {
  let t = s;
  const ia = t.search(AKTION_RE);
  const ip = t.search(/-?\s?\d{1,2}\s?%/);
  const start = Math.min(ia < 0 ? 1e9 : ia, ip < 0 ? 1e9 : ip);
  if (start < 1e9 && start > 0) {
    const davor = t.slice(0, start).trim().split(' ').pop() || '';
    t = (/^(bis|zu|nur|jetzt|noch|extra|zus[aä]tzlich|spare|sichere|save|get|up|only)$/i.test(davor) ? davor + ' ' : '') + t.slice(start);
  }
  const cm = t.match(CODE_RE);
  if (cm) {
    t = t.slice(0, t.indexOf(cm[0]) + cm[0].length);
  } else {
    const nav = t.search(/\s(?:Warenkorb|Merkzettel|Mein\s+Konto|Anmelden|Startseite|My\s+Account|Sign\s+in|Log\s+in|Cart|Wish\s?list|Shop\s+all|Support|Kundenservice)\b/);
    if (nav > 25) t = t.slice(0, nav);
  }
  return t.replace(/\s+/g, ' ').replace(/^[\s|,;:*-]+|[\s|,;:]+$/g, '').trim();
}

function sammleBanner(html) {
  if (!html) return [];
  const txt = textOf(html);
  const treffer = [];
  const gesehen = new Set();

  let marker = [];
  for (const re of [new RegExp(AKTION_RE.source, 'gi'), new RegExp(PROZENT_RE.source, 'gi')]) {
    let m;
    while ((m = re.exec(txt))) {
      marker.push(m.index);
      if (marker.length > 600) break;
    }
  }
  // Treffer, die dicht beieinander liegen, gehoeren zum selben Banner.
  marker.sort((a, b) => a - b);
  marker = marker.filter((p, i) => i === 0 || p - marker[i - 1] > 90);

  for (const pos of marker) {
    const kurz = fenster(txt, pos, 22, 138);
    if (kurz.length < 8) continue;
    const aktM = kurz.match(AKTION_RE);
    const pm = kurz.match(PROZENT_RE);
    const prozent = pm ? +pm[1] : null;
    // Nur melden, was nach Kampagne aussieht: ein Aktionswort, oder ein
    // Rabatt, der ueber eine einzelne Artikelauszeichnung hinausgeht.
    if (!aktM && !(prozent && prozent >= CFG.kampagneMinProzent && BREIT_RE.test(kurz))) continue;
    // Newsletter- und Versandwerbung laeuft dauerhaft und ist keine Aktion.
    if (!aktM && /newsletter|anmeld|registrier|sign\s*up|subscribe|app[\s-]*download|versandkosten|free\s*shipping/i.test(kurz)) continue;
    // Drei Prozentangaben nebeneinander sind die Rabattspalte des Filters.
    if ((kurz.match(/\d{1,2}\s?%/g) || []).length >= 3) continue;
    // Zwei Preise im Fenster heissen: das ist die Produktliste.
    if ((kurz.match(/\d+[.,]\d{2}\s?(?:€|EUR|USD|\$)/g) || []).length >= 2) continue;

    const norm = kurz.toLowerCase().replace(/[^a-z0-9%]+/g, '').slice(0, 40);
    if (!norm || gesehen.has(norm)) continue;
    gesehen.add(norm);
    const cm = kurz.match(CODE_RE);
    const code = cm ? cm[1].toUpperCase() : null;
    const sauber = zuschneiden(kurz);
    if (sauber.length < 8) continue;
    treffer.push({
      text: sauber,
      prozent: prozent,
      code: (code && !CODE_BLACKLIST.test(code)) ? code : null,
      aktion: aktM ? aktM[1].toLowerCase().replace(/\s+/g, ' ') : null
    });
    if (treffer.length >= 12) break;
  }
  return treffer;
}

// ------------------------------------------------------------------ Shops
// Reihenfolge ist die Meldereihenfolge: der Herstellershop zuerst, weil er
// die Aktionen ankuendigt, die die Haendler erst Tage spaeter mitgehen.
const SHOPS = {
  bambulab: {
    name: 'Bambu Lab Store EU',
    basis: 'https://eu.store.bambulab.com',
    typ: shopify,
    suche: 'H2D',
    // Geprueft am 26.09.2026 - siehe README. Handles bleiben als
    // Rueckfallweg drin, falls die Suche einmal nichts ausliefert.
    handles: ['h2d', 'h2d-combo', 'h2d-laser-full-combo', 'h2d-pro'],
    sammlung: '3d-printer'
  },
  jake3d: {
    name: '3DJake',
    basis: 'https://www.3djake.de',
    typ: jsonld,
    suchUrl: 'https://www.3djake.de/catalogsearch/result/?q=bambu+lab+h2d',
    maxDetailseiten: 5
  },
  igo3d: {
    name: 'iGo3D',
    basis: 'https://www.igo3d.com',
    typ: jsonld,
    suchUrl: 'https://www.igo3d.com/search?search=bambu%20lab%20h2d',
    maxDetailseiten: 5
  },
  geizhals: {
    name: 'Geizhals',
    basis: 'https://geizhals.de',
    typ: jsonld,
    suchUrl: 'https://geizhals.de/?fs=bambu+lab+h2d&hloc=de&in=',
    maxDetailseiten: 4
  }
};

module.exports = { SHOPS, istModell, warumNicht, sammleBanner, ausShopifyProdukt, AKTION_RE };
