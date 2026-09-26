// H2D-Watcher - HTTP, JSON-LD und Preis-Werkzeuge.
//
// Kopfzeilen wie ein echter Browser: Shopify gibt sein JSON auch nackt heraus,
// aber Shopware-Shops und Preisvergleicher sortieren Anfragen ohne Accept- und
// Sec-Fetch-Header aus. Ein vollstaendiger Satz kostet nichts und spart
// Fehlersuche.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const H_DOC = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
  'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Connection': 'keep-alive'
};

// Fuer die JSON-Endpunkte von Shopify. Sec-Fetch-Mode: cors, sonst haelt
// Cloudflare die Anfrage fuer eine Navigation mit falschem Accept.
const H_JSON = Object.assign({}, H_DOC, {
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'X-Requested-With': 'XMLHttpRequest'
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Gibt immer ein Ergebnis zurueck, nie eine Ausnahme: ein blockierter Shop
// darf den Lauf nicht abbrechen. Der letzte HTTP-Status bleibt erhalten -
// ein 403 von Cloudflare ist im Log etwas voellig anderes als ein
// Verbindungsabbruch (Status 0).
async function get(url, opt) {
  opt = opt || {};
  const headers = Object.assign({}, opt.json ? H_JSON : H_DOC, opt.headers || {});
  const tries = opt.tries || 3;
  let letzter = 0;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: headers, redirect: 'follow' });
      letzter = r.status;
      // 404 ist eine Antwort, keine Stoerung: geratene Produkt-Handles
      // laufen genau hier auf, und Wiederholen aendert daran nichts.
      if (r.status === 404 || r.status === 410) return { status: r.status, body: '', url: r.url };
      if (!r.ok) { await sleep(2000 * (i + 1)); continue; }
      return { status: r.status, body: await r.text(), url: r.url };
    } catch (e) {
      await sleep(2000 * (i + 1));
    }
  }
  return { status: letzter, body: '', url: url };
}

async function getJson(url, opt) {
  const r = await get(url, Object.assign({ json: true }, opt || {}));
  if (r.status !== 200 || !r.body) return { status: r.status, daten: null, url: r.url };
  try { return { status: r.status, daten: JSON.parse(r.body), url: r.url }; }
  catch (e) { return { status: r.status, daten: null, url: r.url, fehler: 'kein JSON' }; }
}

const ENT = { '&nbsp;': ' ', '&amp;': '&', '&euro;': 'EUR', '&quot;': '"', '&#039;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>' };

function unent(s) {
  return String(s).replace(/&nbsp;|&amp;|&euro;|&quot;|&#039;|&apos;|&lt;|&gt;/g, m => ENT[m])
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(+d); } catch (e) { return ' '; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => { try { return String.fromCodePoint(parseInt(x, 16)); } catch (e) { return ' '; } });
}

// Sichtbarer Text ohne Skripte und Styles - Grundlage der Bannersuche.
function textOf(html) {
  return unent(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

// Preise kommen in drei Schreibweisen ins Haus: "1.899,00" aus deutschem
// HTML, "1899.00" aus JSON-LD und "1,899.00" aus englischsprachigen Shops.
// Regel: sind beide Trenner da, entscheidet der letzte. Steht hinter einem
// einzelnen Trenner eine dreistellige Gruppe, ist es ein Tausenderpunkt -
// bei Druckerpreisen ist "1.899" immer 1899 und nie 1,899.
function cents(s) {
  if (s === null || s === undefined) return null;
  // Zahlen aus JSON sind schon Zahlen: 1899 -> 189900, 1899.5 -> 189950.
  if (typeof s === 'number') return Number.isFinite(s) ? Math.round(s * 100) : null;
  const m = String(s).match(/\d[\d.,\s]*\d|\d/);
  if (!m) return null;
  let t = m[0].replace(/\s/g, '');
  const p = t.lastIndexOf('.'), k = t.lastIndexOf(',');
  let dezPos = -1;
  if (p > -1 && k > -1) dezPos = Math.max(p, k);
  else if (p > -1 || k > -1) {
    const nur = Math.max(p, k);
    const nach = t.length - nur - 1;
    // Genau eine Gruppe aus drei Ziffern: Tausendertrenner.
    if (nach <= 2 && (t.match(/[.,]/g) || []).length === 1) dezPos = nur;
  }
  let ganz, dez = 0;
  if (dezPos > -1) {
    ganz = t.slice(0, dezPos).replace(/[.,]/g, '');
    const d = t.slice(dezPos + 1).replace(/[.,]/g, '');
    dez = d.length === 1 ? +d * 10 : +d.slice(0, 2);
  } else {
    ganz = t.replace(/[.,]/g, '');
  }
  const g = parseInt(ganz, 10);
  if (Number.isNaN(g)) return null;
  return g * 100 + (Number.isNaN(dez) ? 0 : dez);
}

const eur = c => (c === null || c === undefined) ? '-' :
  (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';

function median(arr) {
  const a = arr.filter(v => typeof v === 'number' && !Number.isNaN(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

const pct = (teil, ganz) => ganz ? Math.round(teil / ganz * 1000) / 10 : 0;

// ---------------------------------------------------------------- JSON-LD
// Jeder Shop, der bei Google Shopping auftauchen will, legt seine Preise als
// JSON-LD in die Seite. Das ist stabiler als jedes Markup: Klassennamen
// aendern sich beim Theme-Wechsel, schema.org bleibt.
function jsonLdBloecke(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html)))) {
    const roh = m[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
    try { out.push(JSON.parse(roh)); } catch (e) { /* kaputtes Markup ueberspringen */ }
  }
  return out;
}

// @graph, ItemList und verschachtelte item-Felder flach ziehen, damit die
// Produktsuche nicht wissen muss, wie der Shop seine Daten schachtelt.
function flachJsonLd(objs) {
  const flach = [];
  const tief = new Set();
  const rein = (o, ebene) => {
    if (!o || typeof o !== 'object' || ebene > 6 || tief.has(o)) return;
    tief.add(o);
    if (Array.isArray(o)) { o.forEach(x => rein(x, ebene + 1)); return; }
    flach.push(o);
    for (const feld of ['@graph', 'itemListElement', 'item', 'mainEntity', 'mainEntityOfPage', 'isSimilarTo', 'hasVariant']) {
      if (o[feld]) rein(o[feld], ebene + 1);
    }
  };
  objs.forEach(o => rein(o, 0));
  return flach;
}

function istTyp(o, typ) {
  const v = o && o['@type'];
  if (!v) return false;
  const passt = x => String(x).toLowerCase().replace(/^.*\//, '') === typ;
  return Array.isArray(v) ? v.some(passt) : passt(v);
}

const VERFUEGBAR_RE = /instock|limitedavailability|onlineonly|instoreonly/i;
const VORBESTELLUNG_RE = /preorder|presale|backorder/i;

// Ein Angebot ist Offer, AggregateOffer oder eine Liste davon. Bei
// AggregateOffer zaehlt lowPrice: der guenstigste Weg an das Geraet.
function ausOffers(offers) {
  const liste = Array.isArray(offers) ? offers : [offers];
  let jetzt = null, vorher = null, waehrung = null, stand = null;
  for (const o of liste) {
    if (!o || typeof o !== 'object') continue;
    const p = cents(o.price !== undefined ? o.price : (o.lowPrice !== undefined ? o.lowPrice : null));
    if (p !== null && (jetzt === null || p < jetzt)) jetzt = p;
    if (o.priceCurrency) waehrung = String(o.priceCurrency).toUpperCase();
    if (o.availability) {
      const a = String(o.availability);
      if (VERFUEGBAR_RE.test(a)) stand = 'ja';
      else if (VORBESTELLUNG_RE.test(a)) stand = (stand === 'ja' ? 'ja' : 'vorbestellung');
      else if (stand === null) stand = 'nein';
    }
    // Streichpreis, wenn der Shop ihn ausweist. Shopware 6 haengt ihn als
    // UnitPriceSpecification mit priceType ListPrice an das Angebot.
    const spez = o.priceSpecification ? (Array.isArray(o.priceSpecification) ? o.priceSpecification : [o.priceSpecification]) : [];
    for (const s of spez) {
      if (!s || typeof s !== 'object') continue;
      if (/listprice|msrp|strikethrough/i.test(String(s.priceType || s['@type'] || ''))) {
        const v = cents(s.price);
        if (v !== null && (vorher === null || v > vorher)) vorher = v;
      }
    }
    if (o.highPrice !== undefined && liste.length === 1 && o.lowPrice !== undefined) {
      // AggregateOffer: highPrice ist die Preisspanne der Haendler, kein
      // Streichpreis. Nicht als Rabatt verkaufen.
    }
  }
  return { jetzt: jetzt, vorher: vorher, waehrung: waehrung, verfuegbar: stand };
}

// Alle Produkte mit Preis aus einer HTML-Seite ziehen.
function produkteAusJsonLd(html, basis) {
  const out = [];
  for (const o of flachJsonLd(jsonLdBloecke(html))) {
    if (!istTyp(o, 'product') && !istTyp(o, 'productmodel') && !istTyp(o, 'individualproduct')) continue;
    if (!o.offers) continue;
    const a = ausOffers(o.offers);
    if (a.jetzt === null) continue;
    let url = o.url || (o.offers && !Array.isArray(o.offers) ? o.offers.url : null) || null;
    if (url && !/^https?:/i.test(url)) url = basis + (url.startsWith('/') ? '' : '/') + url;
    out.push({
      id: String(o.sku || o.mpn || o.gtin13 || o.productID || url || o.name || '').slice(0, 80),
      name: unent(String(o.name || '')).trim(),
      jetzt: a.jetzt,
      vorher: a.vorher,
      waehrung: a.waehrung,
      verfuegbar: a.verfuegbar,
      url: url
    });
  }
  return out;
}

// --------------------------------------------------------------- Microdata
// Nicht jeder Shop legt JSON-LD in die Seite. Shopware-Themes und mancher
// Haendler schreiben dieselben schema.org-Felder als itemprop-Attribute ins
// Markup. Inhaltlich ist es dasselbe, nur muehsamer zu lesen.
function ipAttr(blk, feld) {
  const re1 = new RegExp('itemprop="' + feld + '"[^>]*?\\b(?:content|href)="([^"]*)"', 'i');
  const re2 = new RegExp('(?:content|href)="([^"]*)"[^>]*?itemprop="' + feld + '"', 'i');
  const re3 = new RegExp('itemprop="' + feld + '"[^>]*>\\s*([^<]{2,160})', 'i');
  const m = blk.match(re1) || blk.match(re2) || blk.match(re3);
  return m ? unent(m[1]).trim() : null;
}

function produkteAusMicrodata(html, basis) {
  const out = [];
  const teile = String(html).split(/itemtype="https?:\/\/schema\.org\/Product"/i);
  for (let i = 1; i < teile.length; i++) {
    // Nur das eigene Fragment ansehen: der naechste Product-Block beginnt
    // mit dem naechsten Teilstueck, mehr Kontext braucht es nicht.
    const blk = teile[i].slice(0, 8000);
    const jetzt = cents(ipAttr(blk, 'price'));
    if (jetzt === null) continue;
    const name = ipAttr(blk, 'name');
    if (!name) continue;
    let url = ipAttr(blk, 'url');
    if (url && !/^https?:/i.test(url)) url = basis + (url.startsWith('/') ? '' : '/') + url;
    const verf = ipAttr(blk, 'availability') || '';
    out.push({
      id: String(ipAttr(blk, 'sku') || ipAttr(blk, 'mpn') || url || name).slice(0, 80),
      name: name,
      jetzt: jetzt,
      // Streichpreise stehen in Microdata praktisch nie - dort greift dann
      // nur der Vergleich gegen die eigene Vorgeschichte.
      vorher: null,
      waehrung: (ipAttr(blk, 'priceCurrency') || '').toUpperCase() || null,
      verfuegbar: VERFUEGBAR_RE.test(verf) ? 'ja' : (VORBESTELLUNG_RE.test(verf) ? 'vorbestellung' : (verf ? 'nein' : null)),
      url: url
    });
  }
  return out;
}

// Beide Wege zusammen, doppelte Treffer heraus. Ein Shop kann dieselbe Ware
// als JSON-LD und als Microdata auszeichnen; JSON-LD gewinnt, weil dort auch
// der Streichpreis steht.
function produkteAusSeite(html, basis) {
  const out = produkteAusJsonLd(html, basis);
  const bekannt = new Set(out.map(p => (p.url || '') + '|' + p.jetzt));
  const bekanntName = new Set(out.map(p => p.name.toLowerCase() + '|' + p.jetzt));
  for (const p of produkteAusMicrodata(html, basis)) {
    if (bekannt.has((p.url || '') + '|' + p.jetzt)) continue;
    if (bekanntName.has(p.name.toLowerCase() + '|' + p.jetzt)) continue;
    out.push(p);
  }
  return out;
}

// Links einer Seite, deren Adresse auf das gesuchte Modell passt. Dient als
// Rueckfallweg, wenn eine Trefferliste ihre Preise erst per JavaScript holt.
function linksMitModell(html, basis, modellRe) {
  const gesehen = new Set();
  const out = [];
  const re = /href="([^"#?]+)/gi;
  let m;
  while ((m = re.exec(String(html)))) {
    let u = unent(m[1]);
    if (/\.(?:jpg|jpeg|png|webp|avif|svg|css|js|pdf|xml|ico)$/i.test(u)) continue;
    if (!modellRe.test(u.replace(/[-_/]/g, ' '))) continue;
    if (!/^https?:/i.test(u)) u = basis + (u.startsWith('/') ? '' : '/') + u;
    if (!u.startsWith(basis)) continue;
    if (gesehen.has(u)) continue;
    gesehen.add(u);
    out.push(u);
  }
  return out;
}

module.exports = {
  get, getJson, textOf, unent, cents, eur, median, pct, sleep, UA,
  jsonLdBloecke, flachJsonLd, istTyp, ausOffers, produkteAusJsonLd,
  produkteAusMicrodata, produkteAusSeite, linksMitModell
};
