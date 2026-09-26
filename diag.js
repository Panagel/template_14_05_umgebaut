// Diagnose: welcher Shop antwortet von diesem Netz aus, und laesst er sich
// lesen? Preisvergleicher und grosse Haendler bewerten IP-Reputation, das
// Ergebnis faellt deshalb auf einem Cloud-Runner anders aus als am
// Wohnanschluss. Das Ergebnis dieses Laufs entscheidet, welche Shops in
// config.js aktiv stehen.
//
// Von Hand starten: Workflow "Shop-Diagnose". Laeuft in keinem Zeitplan mit.
const { get, getJson, textOf, produkteAusJsonLd, jsonLdBloecke, flachJsonLd, istTyp, eur, sleep } = require('./lib.js');
const { istModell, warumNicht, sammleBanner } = require('./shops.js');

// [Gruppe, Beschriftung, URL, Art]
const ZIELE = [
  ['Bambu Lab EU',  'Startseite',         'https://eu.store.bambulab.com/', 'html'],
  ['Bambu Lab EU',  'suggest.json',       'https://eu.store.bambulab.com/search/suggest.json?q=H2D&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=show', 'json'],
  ['Bambu Lab EU',  'products/h2d.js',    'https://eu.store.bambulab.com/products/h2d.js', 'json'],
  ['Bambu Lab EU',  'Sammlung 3d-printer','https://eu.store.bambulab.com/collections/3d-printer/products.json?limit=250', 'json'],
  ['Bambu Lab EU',  'alle Produkte',      'https://eu.store.bambulab.com/products.json?limit=250', 'json'],
  ['Bambu Lab EU',  'Suchseite HTML',     'https://eu.store.bambulab.com/search?q=h2d', 'html'],
  ['Bambu Lab EU',  'meta.json',          'https://eu.store.bambulab.com/meta.json', 'json'],
  ['Bambu Lab glob','Startseite',         'https://store.bambulab.com/', 'html'],
  ['Bambu Lab glob','suggest.json',       'https://store.bambulab.com/search/suggest.json?q=H2D&resources[type]=product&resources[limit]=10', 'json'],

  ['3DJake',        'Startseite',         'https://www.3djake.de/', 'html'],
  ['3DJake',        'Suche Magento',      'https://www.3djake.de/catalogsearch/result/?q=bambu+lab+h2d', 'html'],
  ['3DJake',        'Suche Shopware 6',   'https://www.3djake.de/search?search=bambu+lab+h2d', 'html'],
  ['3DJake',        'Suche Shopware 5',   'https://www.3djake.de/?sSearch=bambu+lab+h2d', 'html'],

  ['iGo3D',         'Startseite',         'https://www.igo3d.com/', 'html'],
  ['iGo3D',         'Suche',              'https://www.igo3d.com/search?search=bambu+lab+h2d', 'html'],
  ['iGo3D',         'Suche alt',          'https://www.igo3d.com/catalogsearch/result/?q=bambu+lab+h2d', 'html'],

  ['Geizhals',      'Suche',              'https://geizhals.de/?fs=bambu+lab+h2d&hloc=de&in=', 'html'],
  ['Idealo',        'Suche',              'https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=bambu+lab+h2d', 'html'],
  ['Alternate',     'Suche',              'https://www.alternate.de/html/product/listing.html?q=bambu+lab+h2d', 'html'],
  ['Galaxus',       'Suche',              'https://www.galaxus.de/de/search?q=bambu+lab+h2d', 'html'],
  ['Amazon',        'Suche',              'https://www.amazon.de/s?k=bambu+lab+h2d', 'html']
];

const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);

(async () => {
  let gruppe = '';
  for (const [g, name, url, art] of ZIELE) {
    if (g !== gruppe) { console.log(''); console.log('== ' + g); gruppe = g; }
    const r = await get(url, { tries: 1, json: art === 'json' });
    const body = r.body || '';
    let notiz = [];

    if (art === 'json') {
      let d = null;
      try { d = JSON.parse(body); } catch (e) {}
      if (d) {
        // Shopify-Formen erkennen, ohne sie zu erraten.
        if (d.resources && d.resources.results && d.resources.results.products) {
          const ps = d.resources.results.products;
          notiz.push(ps.length + ' Vorschlaege');
          for (const p of ps.slice(0, 8)) notiz.push('handle=' + p.handle);
        } else if (Array.isArray(d.products)) {
          notiz.push(d.products.length + ' Produkte');
          const h2d = d.products.filter(p => /\bh2d\b/i.test(p.title || '')).map(p => p.handle);
          if (h2d.length) notiz.push('H2D: ' + h2d.join(', '));
        } else if (d.variants || d.price !== undefined) {
          notiz.push('Produkt "' + d.title + '"');
          for (const v of (d.variants || []).slice(0, 8)) {
            notiz.push('  ' + (v.title || '-') + ' ' + eur(v.price) +
                       (v.compare_at_price ? ' statt ' + eur(v.compare_at_price) : '') +
                       (v.available === false ? ' [nicht lieferbar]' : ''));
          }
        } else {
          notiz.push('JSON ok: ' + Object.keys(d).slice(0, 8).join(','));
        }
      } else if (body) notiz.push('kein JSON');
    } else {
      const txt = textOf(body);
      notiz.push(txt.length + ' Zeichen Text');
      if (/\bh2d\b/i.test(txt)) notiz.push('nennt H2D');
      const bloecke = jsonLdBloecke(body);
      const typen = flachJsonLd(bloecke).filter(o => istTyp(o, 'product')).length;
      if (bloecke.length) notiz.push(bloecke.length + ' JSON-LD-Block/Bloecke, ' + typen + ' Product');
      const prod = produkteAusJsonLd(body, new URL(url).origin);
      const passend = prod.filter(istModell);
      if (prod.length) notiz.push(prod.length + ' mit Preis, ' + passend.length + ' passend');
      for (const p of passend.slice(0, 6)) notiz.push('  + ' + p.name + ' ' + eur(p.jetzt) + (p.vorher ? ' statt ' + eur(p.vorher) : '') + ' [' + (p.verfuegbar || '?') + ']');
      for (const p of prod.filter(x => !istModell(x)).slice(0, 4)) notiz.push('  - ' + p.name.slice(0, 48) + ' ' + eur(p.jetzt) + ' (' + warumNicht(p) + ')');
      const banner = sammleBanner(body);
      for (const b of banner.slice(0, 3)) notiz.push('  Banner: ' + b.text.slice(0, 80) + (b.code ? ' [Code ' + b.code + ']' : ''));
    }

    console.log('   ' + pad(name, 20) + ' HTTP ' + String(r.status).padStart(3) +
                ' ' + String(body.length).padStart(8) + ' B' +
                (notiz.length ? '  ' + notiz[0] : ''));
    for (const n of notiz.slice(1)) console.log('       ' + n);
    await sleep(800);
  }
  console.log('');
  console.log('Fertig. Was hier 200 liefert und "passend" nennt, kann in config.js aktiv bleiben.');
})();
