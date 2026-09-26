// Dritte Runde: wie kommt man an die EU-Preise, und welcher Haendler fuehrt
// das Geraet ueberhaupt? Der Runner steht in den USA, der Bambu-Shop leitet
// deshalb auf us.store um - gesucht ist der Schalter, der das verhindert.
const { get, textOf, produkteAusJsonLd, jsonLdBloecke, flachJsonLd, istTyp, eur } = require('./lib.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const BASIS = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'de-DE,de;q=0.9' };

// 1. Wie sieht die Umleitung aus?
async function umleitung(url, extra) {
  try {
    const r = await fetch(url, { headers: Object.assign({}, BASIS, extra || {}), redirect: 'manual' });
    const sc = [];
    r.headers.forEach((v, k) => { if (/set-cookie|location|vary|cf-|x-/i.test(k)) sc.push(k + ': ' + v.slice(0, 160)); });
    console.log('   ' + url + (extra ? '  [' + JSON.stringify(extra) + ']' : ''));
    console.log('      HTTP ' + r.status);
    for (const z of sc) console.log('      ' + z);
  } catch (e) { console.log('   ' + url + ' FEHLER ' + e.message); }
}

// 2. Was liefert ein Versuch inhaltlich - Waehrung und Preise?
async function inhalt(titel, url, extra) {
  let r;
  try { r = await fetch(url, { headers: Object.assign({}, BASIS, extra || {}), redirect: 'follow' }); }
  catch (e) { console.log('   ' + titel + ': FEHLER ' + e.message); return; }
  const body = r.status === 200 ? await r.text() : '';
  const prod = produkteAusJsonLd(body, new URL(url).origin);
  const waehrungen = Array.from(new Set(prod.map(p => p.waehrung).filter(Boolean)));
  console.log('   ' + titel + ': HTTP ' + r.status + '  ' + body.length + ' B  Ziel ' + r.url.replace('https://', '') +
              '  ' + prod.length + ' Produkte  Waehrung ' + (waehrungen.join('/') || '-'));
  for (const p of prod.slice(0, 8)) {
    console.log('        ' + (p.name || '?').slice(0, 56) + '  ' + eur(p.jetzt) + (p.vorher ? ' statt ' + eur(p.vorher) : '') +
                '  [' + (p.verfuegbar || '?') + '] ' + (p.waehrung || ''));
  }
}

// 3. Haendler: fuehrt er das Geraet, und stehen Preise im HTML?
function microdataProdukte(html) {
  const out = [];
  const teile = String(html).split(/itemtype="https?:\/\/schema\.org\/Product"/i);
  for (let i = 1; i < teile.length; i++) {
    const blk = teile[i].slice(0, 6000);
    const preis = (blk.match(/itemprop="price"\s+content="([^"]+)"/i) || blk.match(/content="([^"]+)"\s+itemprop="price"/i) || [])[1];
    const name = (blk.match(/itemprop="name"[^>]*content="([^"]+)"/i) || [])[1] ||
                 (blk.match(/itemprop="name"[^>]*>([^<]{3,120})</i) || [])[1];
    const url = (blk.match(/itemprop="url"[^>]*content="([^"]+)"/i) || [])[1];
    if (preis) out.push({ name: (name || '').trim(), preis: preis, url: url });
  }
  return out;
}

async function haendler(name, url) {
  const r = await get(url, { tries: 1 });
  const b = r.body || '';
  const txt = textOf(b);
  const ld = produkteAusJsonLd(b, new URL(url).origin);
  const md = microdataProdukte(b);
  const h2d = Array.from(new Set((b.match(/href="[^"]{0,120}[hH]2[dD][^"]{0,80}"/g) || []))).slice(0, 6);
  console.log('   ' + name.padEnd(26) + ' HTTP ' + String(r.status).padStart(3) + ' ' + String(b.length).padStart(7) + ' B  ' +
              txt.length + ' Zeichen' + (/\bh2d\b/i.test(txt) ? '  NENNT H2D' : '') +
              '  JSON-LD ' + ld.length + '  Microdata ' + md.length);
  for (const p of ld.slice(0, 4)) console.log('        LD  ' + (p.name || '?').slice(0, 60) + '  ' + eur(p.jetzt) + ' ' + (p.waehrung || ''));
  for (const p of md.slice(0, 6)) console.log('        MD  ' + (p.name || '?').slice(0, 60) + '  ' + p.preis);
  for (const l of h2d) console.log('        ' + l.slice(0, 110));
}

(async () => {
  console.log('== 1. Umleitung: rohe Kopfzeilen');
  await umleitung('https://eu.store.bambulab.com/products/h2d');
  await umleitung('https://eu.store.bambulab.com/products/h2d', { 'Cookie': 'bbl_region=eu; region=eu; store_region=eu; country=DE' });
  await umleitung('https://store.bambulab.com/products/h2d');

  console.log('');
  console.log('== 2. Wege zu EUR-Preisen');
  await inhalt('eu ohne alles           ', 'https://eu.store.bambulab.com/products/h2d');
  await inhalt('eu ?region=eu           ', 'https://eu.store.bambulab.com/products/h2d?region=eu');
  await inhalt('eu ?country=DE          ', 'https://eu.store.bambulab.com/products/h2d?country=DE');
  await inhalt('eu Cookie region        ', 'https://eu.store.bambulab.com/products/h2d', { 'Cookie': 'region=eu' });
  await inhalt('eu Cookie bbl_region   ', 'https://eu.store.bambulab.com/products/h2d', { 'Cookie': 'bbl_region=eu' });
  await inhalt('eu Cookie store-region ', 'https://eu.store.bambulab.com/products/h2d', { 'Cookie': 'store-region=eu; bbl-region=eu; bbl_store_region=eu' });
  await inhalt('eu Cookie NEXT_LOCALE  ', 'https://eu.store.bambulab.com/products/h2d', { 'Cookie': 'NEXT_LOCALE=de-DE' });
  await inhalt('eu de-DE only          ', 'https://eu.store.bambulab.com/products/h2d', { 'Accept-Language': 'de-DE' });
  await inhalt('us direkt              ', 'https://us.store.bambulab.com/products/h2d');

  console.log('');
  console.log('== 3. Region-Umschalter im Markup');
  const r = await get('https://us.store.bambulab.com/');
  const b = r.body || '';
  let i = -1, n = 0;
  while (n < 4 && (i = b.indexOf('eu.store.bambulab.com', i + 1)) > -1) {
    console.log('   ...' + b.slice(Math.max(0, i - 220), i + 90).replace(/\s+/g, ' ') + '...');
    n++;
  }
  const cookieHinweise = Array.from(new Set(b.match(/["'](?:[a-z0-9_-]*(?:region|country|locale|currency)[a-z0-9_-]*)["']/gi) || [])).slice(0, 20);
  console.log('   Schluesselnamen im Skript: ' + cookieHinweise.join(' '));

  console.log('');
  console.log('== 4. sitemap');
  const sm = await get('https://eu.store.bambulab.com/sitemap.xml');
  console.log('   ' + (sm.body || '').replace(/\s+/g, ' ').slice(0, 400));

  console.log('');
  console.log('== 5. Haendler');
  await haendler('reichelt', 'https://www.reichelt.de/de/de/shop/suche/bambu%20lab%20h2d');
  await haendler('alza', 'https://www.alza.de/search.htm?exps=bambu+lab+h2d');
  await haendler('conrad', 'https://www.conrad.de/de/search.html?search=bambu%20lab%20h2d');
  await haendler('mediamarkt', 'https://www.mediamarkt.de/de/search.html?query=bambu%20lab%20h2d');
  await haendler('coolblue', 'https://www.coolblue.de/suchen?query=bambu+lab+h2d');
  await haendler('igo3d nur h2d', 'https://www.igo3d.com/search?search=h2d');
  await haendler('3djake nur h2d', 'https://www.3djake.de/search?search=h2d');
  await haendler('kiwi3d', 'https://www.kiwi3d.de/search?search=bambu+lab+h2d');
})();
