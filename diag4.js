// Vierte Runde, knapp gehalten: wie genau leitet der Bambu-Shop um, und
// welcher deutsche Haendler liefert brauchbare Microdata?
const { get, produkteAusSeite, eur } = require('./lib.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const H = { 'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'de-DE,de;q=0.9' };

async function kopf(url, extra) {
  try {
    const r = await fetch(url, { headers: Object.assign({}, H, extra || {}), redirect: 'manual' });
    console.log('   ' + url + (extra ? ' [' + Object.keys(extra).join(',') + '=' + Object.values(extra).join(',') + ']' : ''));
    console.log('      HTTP ' + r.status);
    let n = 0;
    r.headers.forEach((v, k) => { if (n++ < 22) console.log('      ' + k + ': ' + String(v).slice(0, 200)); });
  } catch (e) { console.log('   ' + url + ' FEHLER ' + e.message); }
}

async function seite(titel, url, extra) {
  const r = await get(url, { tries: 1, headers: extra });
  const p = produkteAusSeite(r.body || '', new URL(url).origin);
  const w = Array.from(new Set(p.map(x => x.waehrung).filter(Boolean))).join('/');
  console.log('   ' + titel.padEnd(30) + ' HTTP ' + String(r.status).padStart(3) + ' ' + String((r.body || '').length).padStart(7) +
              ' B  Ziel ' + (r.url || '').replace('https://', '').slice(0, 48) + '  ' + p.length + ' Produkte ' + w);
  for (const x of p.slice(0, 8)) {
    console.log('        ' + (x.name || '?').slice(0, 54).padEnd(54) + ' ' + eur(x.jetzt) + (x.vorher ? ' statt ' + eur(x.vorher) : '') +
                ' ' + (x.waehrung || '?') + ' [' + (x.verfuegbar || '?') + '] ' + (x.url || '').slice(0, 60));
  }
}

(async () => {
  console.log('== Umleitung, rohe Kopfzeilen');
  await kopf('https://eu.store.bambulab.com/products/h2d');
  console.log('');
  await kopf('https://eu.store.bambulab.com/');

  console.log('');
  console.log('== Wo liegt store-fe.bblcdn.com im Markup?');
  const home = await get('https://us.store.bambulab.com/');
  const b = home.body || '';
  let i = -1, n = 0;
  while (n < 3 && (i = b.indexOf('store-fe.bblcdn.com', i + 1)) > -1) {
    console.log('   ...' + b.slice(Math.max(0, i - 120), i + 130).replace(/\s+/g, ' ') + '...');
    n++;
  }

  console.log('');
  console.log('== Sprachpfade und Sitemap auf dem EU-Host');
  await seite('eu /de/products/h2d', 'https://eu.store.bambulab.com/de/products/h2d');
  await seite('eu /en/products/h2d', 'https://eu.store.bambulab.com/en/products/h2d');
  const sm = await get('https://eu.store.bambulab.com/sitemap_products_1.xml', { tries: 1 });
  console.log('   sitemap_products_1.xml HTTP ' + sm.status + '  ' + (sm.body || '').length + ' B  Ziel ' + (sm.url || ''));
  const h2dUrls = Array.from(new Set((sm.body || '').match(/<loc>[^<]*h2d[^<]*<\/loc>/gi) || [])).slice(0, 8);
  for (const u of h2dUrls) console.log('        ' + u);

  console.log('');
  console.log('== Deutsche Haendler');
  await seite('reichelt Suche', 'https://www.reichelt.de/de/de/shop/suche/bambu%20lab%20h2d');
  await seite('voelkner Suche', 'https://www.voelkner.de/search/?q=bambu+lab+h2d');
  await seite('smdv Suche', 'https://www.smdv.de/search/?q=bambu+lab+h2d');
  await seite('elektronik-star', 'https://www.elektronik-star.de/search?sSearch=bambu+lab+h2d');
  await seite('printer3d.de', 'https://www.printer3d.de/search?sSearch=bambu+lab+h2d');
})();
