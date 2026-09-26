// Shop-Adapter. Jeder liefert { produkte, banner, hinweise } fuer einen Lauf.
//
// Zwei Zugriffsarten decken den Markt ab, beide gemessen am 26.09.2026 von
// einem GitHub-Runner aus (siehe README und diag.js):
//
//   bambu    - der Herstellershop. Eine Next.js-Anwendung, im Markup steht
//              fast nichts Sichtbares, aber jede Produktseite traegt einen
//              vollstaendigen JSON-LD-Block vom Typ ProductGroup: eine
//              Variante je Ausbaustufe, mit Preis, Streichpreis und
//              Lagerstand. Welche Seiten es gibt, sagt die Produkt-Sitemap.
//   haendler - schema.org, gleichgueltig ob als JSON-LD oder als
//              itemprop-Microdata im Markup. Das ist die einzige
//              Schnittstelle, die alle Haendler gemeinsam haben, und sie
//              ueberlebt Theme-Wechsel, weil sie fuer Google gepflegt wird.
const { get, textOf, unent, cents, sleep, geld, produkteAusSeite, linksMitModell } = require('./lib.js');
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

// ------------------------------------------------------------- Bambu Lab
// Gefiltert wird auf Adressen, deren Kurzname mit dem Modell beginnt: "h2d"
// und "h2d-pro" gehoeren dazu, "dual-extruder-unit-h2d-h2c" ist Zubehoer und
// faellt schon vor dem Abruf heraus.
async function bambu(cfg, log) {
  const hinweise = [];
  // Nach Pfad entdoppeln: die Sitemap nennt die Adressen des Shops, auf den
  // umgeleitet wurde, die Konfiguration die des EU-Hosts. Beides ist
  // dieselbe Seite und muss nicht zweimal geholt werden.
  const seiten = new Map();
  const nimmSeite = u => {
    try {
      const pfad = new URL(u).pathname.replace(/\/+$/, '');
      if (!seiten.has(pfad)) seiten.set(pfad, u);
    } catch (e) { /* unbrauchbare Adresse */ }
  };
  for (const s of (cfg.seiten || [])) nimmSeite(cfg.basis + s);

  const sm = await get(cfg.basis + cfg.sitemap);
  if (sm.status === 200 && sm.body) {
    const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
    let m, gefunden = 0;
    while ((m = re.exec(sm.body))) {
      const slug = (m[1].match(/\/products\/([^/?#]+)\/?$/) || [])[1];
      if (!slug || !CFG.modellSlugRe.test(slug)) continue;
      if (CFG.ausschlussRe.test(slug.replace(/[-_]/g, ' '))) continue;
      nimmSeite(m[1]);
      gefunden++;
    }
    log('    Sitemap: ' + gefunden + ' Modellseite(n) von ' + (sm.body.match(/<loc>/g) || []).length);
  } else {
    // Ohne Sitemap laeuft der Watcher auf den festen Adressen weiter.
    hinweise.push('Sitemap: HTTP ' + sm.status);
    log('    Sitemap: HTTP ' + sm.status + ' - nur feste Adressen');
  }

  const produkte = [], verworfen = [];
  const gesehen = new Set();
  for (const url of seiten.values()) {
    const r = await get(url);
    if (r.status !== 200 || !r.body) {
      hinweise.push(url.replace(cfg.basis, '') + ': HTTP ' + r.status);
      log('    ' + url.split('/').pop() + ': HTTP ' + r.status);
      continue;
    }
    let neu = 0;
    for (const p of produkteAusSeite(r.body, cfg.basis)) {
      const key = p.id || p.url;
      if (gesehen.has(key)) continue;
      gesehen.add(key);
      if (istModell(p)) { produkte.push(p); neu++; } else verworfen.push(p);
    }
    log('    ' + url.split('/').pop() + ': ' + neu + ' Variante(n)');
    await sleep(700);
  }

  // Banner von der Startseite: dort steht die beworbene Aktion samt Code.
  const home = await get(cfg.basis + '/');
  if (home.status !== 200) hinweise.push('Startseite: HTTP ' + home.status);
  return { produkte: produkte, banner: sammleBanner(home.body || ''), hinweise: hinweise, verworfen: verworfen };
}

// ---------------------------------------------------------------- Haendler
// Erst die Trefferliste, dann - falls die ihre Preise erst per JavaScript
// nachlaedt - die Detailseiten der passenden Links. Beide Wege enden im
// gleichen schema.org-Datensatz.
async function haendler(cfg, log) {
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
    nimm(produkteAusSeite(r.body, cfg.basis), 'Produktseite');
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
      const ausListe = nimm(produkteAusSeite(r.body, cfg.basis), 'Trefferliste');
      // Kein Preis in der Liste: den Detailseiten nachgehen, aber gedeckelt.
      if (!ausListe && (cfg.maxDetailseiten || 0) > 0) {
        const links = linksMitModell(r.body, cfg.basis, CFG.modellRe)
          .filter(u => !CFG.ausschlussRe.test(u.replace(/[-_/]/g, ' ')))
          .slice(0, cfg.maxDetailseiten || 5);
        log('    Trefferliste ohne Preise - ' + links.length + ' Detailseiten');
        for (const u of links) {
          const d = await get(u);
          if (d.status !== 200 || !d.body) { hinweise.push(u.replace(cfg.basis, '') + ': HTTP ' + d.status); continue; }
          nimm(produkteAusSeite(d.body, cfg.basis), 'Detailseite');
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
const AKTION_RE = /(black\s*friday|cyber\s*(?:monday|week)|singles[\s-]*day|double\s*1?11|prime\s*day|winter[\s-]*(?:sale|schlussverkauf)|sommer[\s-]*(?:sale|schlussverkauf)|summer[\s-]*sale|spring[\s-]*sale|autumn[\s-]*sale|fall[\s-]*sale|fr[uü]hjahr[s]?[\s-]*sale|herbst[\s-]*sale|jahres(?:end|abschluss|wechsel)[\s-]*sale|saison(?:end|start)[\s-]*sale|\bschlussverkauf\b|mid[\s-]*season[\s-]*sale|end[\s-]*of[\s-]*season|season[\s-]*(?:sale|finale)|sale[\s-]*finale|final[\s-]*sale|super[\s-]*sale|mega[\s-]*sale|clearance|\bostern\b|oster[\s-]*(?:sale|aktion|deal)|easter[\s-]*sale|\bweihnacht(?:s[\s-]*(?:sale|aktion))?|christmas[\s-]*sale|x-?mas[\s-]*sale|\badvent(?:s[\s-]*(?:sale|aktion))?\b|jubil[aä]um|anniversary[\s-]*sale|lagerverkauf|r[aä]umungsverkauf|deal[\s-]*(?:days|week)|aktionswoche|flash[\s-]*sale|back[\s-]*to[\s-]*school|maker[\s-]*(?:days|fest|week)|creator[\s-]*(?:days|fest)|bundle[\s-]*(?:deal|sale|angebot)|trade[\s-]*in|launch[\s-]*(?:sale|angebot|offer))/i;

// "Price Drop" steht bewusst nicht in der Liste oben: eine Preissenkung
// erkennt Signal 1 an den Zahlen selbst, viel genauer als jede Werbezeile.
// Im Bambu-Shop steht "Price Drop Alert!" als Dauerwerbung fuer Filament.

// Beworben wird im Herstellershop meist Verbrauchsmaterial. Das laeuft
// dauerhaft und sagt ueber den Druckerpreis nichts aus - solche Zeilen
// fliegen raus, sofern sie nicht doch ein Geraet nennen.
const VERBRAUCH_RE = /filament|\brolls?\b|\bspools?\b|resin|\bink\b|add-?ons?|essentials|accessor|zubeh[oö]r|verbrauchsmaterial|d[uü]sen|nozzles/i;
const GERAET_RE = /\bh2[dscx]\b|\bdrucker\b|printers?\b|\bmaschine|laser\s*(?:engrav|cutt|combo)|ger[aä]t/i;

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
    // Newsletter-, Empfehlungs- und Versandwerbung laeuft dauerhaft und ist
    // keine Aktion.
    if (!aktM && /newsletter|anmeld|registrier|sign\s*up|subscribe|refer\s*(?:now|a\s*friend)|freund|app[\s-]*download|versandkosten|free\s*shipping/i.test(kurz)) continue;
    // Werbung fuer Verbrauchsmaterial: nur behalten, wenn auch ein Geraet
    // vorkommt.
    if (VERBRAUCH_RE.test(kurz) && !GERAET_RE.test(kurz)) continue;
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
// Nur was von einem Runner aus messbar geht. Was geprueft und verworfen
// wurde, steht im README - nachpruefbar mit diag.js.
const SHOPS = {
  bambulab: {
    // Cloudflare leitet eu.store nach IP-Standort um; von einem
    // GitHub-Runner landet jede Anfrage auf dem US-Shop. Der Name sagt das,
    // damit keine Meldung einen USD-Betrag als deutschen Preis ausgibt.
    name: 'Bambu Lab Store (US-Ansicht)',
    basis: 'https://eu.store.bambulab.com',
    typ: bambu,
    sitemap: '/sitemap_products_1.xml',
    seiten: ['/products/h2d'],
    hinweis: 'Preise des US-Shops - der Runner steht in den USA. Als Fruehwarnung brauchbar, weil Bambu seine Aktionen global faehrt.'
  },
  reichelt: {
    name: 'reichelt',
    basis: 'https://www.reichelt.de',
    typ: haendler,
    suchUrl: 'https://www.reichelt.de/de/de/shop/suche/bambu%20lab%20h2d',
    // Die Trefferliste traegt Preis, Verfuegbarkeit und Adresse als
    // Microdata schon mit - Detailseiten sind nicht noetig.
    maxDetailseiten: 0
  }
};

module.exports = { SHOPS, istModell, warumNicht, sammleBanner, AKTION_RE, bambu, haendler };
