// Tiefendiagnose: wo liegen die Preise? Sucht in den Seiten nach der Naht,
// an der Daten und Darstellung getrennt sind - Framework-Marker, API-Hosts,
// eingebettetes JSON, Meta-Tags. Nur fuer die Einrichtung gedacht.
const { get, textOf, jsonLdBloecke } = require('./lib.js');

const MARKER = ['__NEXT_DATA__', 'self.__next_f', '__NUXT__', '__INITIAL_STATE__', '__remixContext',
  'Shopify', 'shopify', 'algolia', 'Algolia', 'graphql', 'data-product', 'window.SHOP', 'nuxt-data',
  'application/ld+json', 'og:price', 'product:price', 'itemprop="price"', 'sylius', 'magento', 'shopware'];

function umfeld(txt, was, n, breite) {
  const out = [];
  let i = -1;
  while (out.length < n && (i = txt.indexOf(was, i + 1)) > -1) {
    out.push(txt.slice(Math.max(0, i - breite), i + breite).replace(/\s+/g, ' '));
  }
  return out;
}

async function pruefe(titel, url, opt) {
  const r = await get(url, Object.assign({ tries: 1 }, opt || {}));
  const b = r.body || '';
  console.log('');
  console.log('### ' + titel + '  HTTP ' + r.status + '  ' + b.length + ' B');
  if (r.url && r.url !== url) console.log('    umgeleitet nach: ' + r.url);
  if (!b) return r;
  console.log('    Text: ' + textOf(b).length + ' Zeichen');
  const da = MARKER.filter(m => b.includes(m));
  if (da.length) console.log('    Marker: ' + da.join(', '));

  // Fremde Hosts, nach Haeufigkeit - dort liegt meist die API.
  const hosts = {};
  let m;
  const re = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;
  while ((m = re.exec(b))) hosts[m[1].toLowerCase()] = (hosts[m[1].toLowerCase()] || 0) + 1;
  const top = Object.entries(hosts).sort((a, b2) => b2[1] - a[1]).slice(0, 12)
    .map(([h, n]) => h + '(' + n + ')');
  if (top.length) console.log('    Hosts: ' + top.join(' '));

  // Pfade, die nach Produkt- oder API-Route aussehen.
  const pfade = new Set();
  const re2 = /["'(](\/(?:[a-z]{2}-[a-z]{2}\/)?(?:api|products?|product-detail|collections?|shop|catalog|search)\/[a-zA-Z0-9\-_/.]{2,60})/g;
  while ((m = re2.exec(b))) pfade.add(m[1]);
  if (pfade.size) console.log('    Pfade: ' + Array.from(pfade).slice(0, 18).join(' '));

  const ld = jsonLdBloecke(b);
  if (ld.length) {
    console.log('    JSON-LD: ' + ld.length + ' Block/Bloecke, Typen: ' +
      ld.map(o => JSON.stringify(o['@type'] || Object.keys(o).slice(0, 3))).join(' '));
  }
  for (const u of umfeld(b, 'H2D', 3, 90)) console.log('    H2D> ' + u);
  for (const u of umfeld(b, '"price"', 2, 90)) console.log('    price> ' + u);
  for (const u of umfeld(b, 'product:price:amount', 1, 120)) console.log('    meta> ' + u);
  for (const u of umfeld(b, 'itemprop="price"', 1, 120)) console.log('    itemprop> ' + u);
  return r;
}

(async () => {
  // --- Bambu Lab: welcher Laden ist das ueberhaupt? --------------------
  await pruefe('Bambu EU Startseite', 'https://eu.store.bambulab.com/');
  await pruefe('Bambu EU /products/h2d', 'https://eu.store.bambulab.com/products/h2d');
  await pruefe('Bambu EU /de-de/products/h2d', 'https://eu.store.bambulab.com/de-de/products/h2d');
  await pruefe('Bambu EU /en-eu/products/h2d', 'https://eu.store.bambulab.com/en-eu/products/h2d');
  await pruefe('Bambu EU /product/h2d', 'https://eu.store.bambulab.com/product/h2d');
  await pruefe('Bambu EU Suche', 'https://eu.store.bambulab.com/search?q=h2d');
  await pruefe('Bambu EU Sammlung', 'https://eu.store.bambulab.com/collections/3d-printer');
  await pruefe('Bambu EU sitemap', 'https://eu.store.bambulab.com/sitemap.xml');
  await pruefe('Bambu EU robots', 'https://eu.store.bambulab.com/robots.txt');

  // --- Haendler: tragen die Detailseiten Preise? -----------------------
  const r1 = await pruefe('iGo3D Suche', 'https://www.igo3d.com/search?search=bambu+lab+h2d');
  const links1 = Array.from(new Set((r1.body || '').match(/href="[^"]*h2d[^"]*"/gi) || [])).slice(0, 12);
  console.log('    h2d-Links: ' + links1.join(' '));

  const r2 = await pruefe('3DJake Suche', 'https://www.3djake.de/search?search=bambu+lab+h2d');
  console.log('    Text: ' + textOf(r2.body || '').slice(0, 400));
  const links2 = Array.from(new Set((r2.body || '').match(/href="[^"]*h2d[^"]*"/gi) || [])).slice(0, 12);
  console.log('    h2d-Links: ' + links2.join(' '));

  const r3 = await pruefe('Galaxus Suche', 'https://www.galaxus.de/de/search?q=bambu+lab+h2d');
  const links3 = Array.from(new Set((r3.body || '').match(/href="[^"]*[hH]2[dD][^"]*"/g) || [])).slice(0, 12);
  console.log('    h2d-Links: ' + links3.join(' '));
})();
