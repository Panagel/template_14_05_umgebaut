// Zweite Runde: fuenf Shops nennen den H2D im HTML, liefern aber keinen
// lesbaren Preis. Diese Runde zeigt das rohe Markup an den entscheidenden
// Stellen - Produktblock, Namensfeld, Links - damit der Parser nachgezogen
// werden kann, statt zu raten.
const { get, textOf, produkteAusSeite, jsonLdBloecke, flachJsonLd } = require('./lib.js');
const { istModell } = require('./shops.js');
const { geld, sleep } = require('./lib.js');

const NAHDRAN = [
  ['igo3d',           'https://www.igo3d.com/search?search=h2d'],
  ['berrybase',       'https://www.berrybase.de/search?search=bambu+lab+h2d'],
  ['roboter-bausatz', 'https://www.roboter-bausatz.de/search?search=bambu+lab+h2d'],
  ['voelkner',        'https://www.voelkner.de/search/search.html?keywords=bambu+lab+h2d'],
  ['smdv',            'https://www.smdv.de/search/search.html?keywords=bambu+lab+h2d']
];

// Nochmal mit anderen Adressen, weil die erste Runde nur 404 oder DNS-Fehler
// bekam - das sagt nichts ueber den Shop, nur ueber die geratene Adresse.
const NEUVERSUCH = [
  ['3dmensionals',    'https://3dmensionals.de/search?search=bambu%20lab%20h2d'],
  ['3dmensionals 2',  'https://www.3dmensionals.de/search?search=bambu%20lab%20h2d'],
  ['kiwi 2',          'https://www.kiwi-electronics.com/en/search/result?q=bambu%20lab%20h2d'],
  ['123-3d.nl',       'https://www.123-3d.nl/search?q=bambu+lab+h2d'],
  ['123-3d.de 2',     'https://www.123-3d.de/catalogsearch/result/?q=h2d'],
  ['alza 2',          'https://www.alza.de/bambu-lab-h2d/d10122899.htm'],
  ['galaxus Suche 2', 'https://www.galaxus.de/de/search?q=h2d'],
  ['printables?',     'https://www.technik-lpg.de/'],
  ['3djake Drucker',  'https://www.3djake.de/3d-drucker/bambu-lab'],
  ['igo3d Marke',     'https://www.igo3d.com/hersteller/bambu-lab'],
  ['berrybase Marke', 'https://www.berrybase.de/3d-druck/3d-drucker']
];

function umfeld(txt, was, n, vor, nach) {
  const out = []; let i = -1;
  while (out.length < n && (i = txt.indexOf(was, i + 1)) > -1) {
    out.push(txt.slice(Math.max(0, i - vor), i + nach).replace(/\s+/g, ' '));
  }
  return out;
}

(async () => {
  console.log('== Markup der fuenf, die den H2D nennen');
  for (const [name, url] of NAHDRAN) {
    const r = await get(url, { tries: 1 });
    const b = r.body || '';
    console.log('');
    console.log('--- ' + name + '  HTTP ' + r.status + '  ' + b.length + ' B');
    if (!b) continue;

    // Adressen, die das Modell nennen - ungefiltert, um zu sehen, ob es
    // ueberhaupt Produktlinks gibt.
    const links = Array.from(new Set((b.match(/href="[^"]{0,140}[hH]2[dD][^"]{0,80}"/g) || []))).slice(0, 8);
    console.log('    h2d-Links: ' + (links.length || 'keine'));
    for (const l of links) console.log('      ' + l.slice(7, 130));

    // Wo steht "H2D" im sichtbaren Text? Produkttitel oder nur Markenfilter?
    for (const u of umfeld(textOf(b), 'H2D', 2, 70, 90)) console.log('    Text> ' + u);

    // Der erste Produktblock am Stueck - daran erkennt man das Namensfeld.
    const iProd = b.search(/itemtype="https?:\/\/schema\.org\/Product"/i);
    if (iProd > -1) console.log('    Product-Block> ' + b.slice(iProd, iProd + 900).replace(/\s+/g, ' '));
    else console.log('    kein schema.org/Product im Markup');

    const ld = jsonLdBloecke(b);
    if (ld.length) console.log('    JSON-LD-Typen: ' + flachJsonLd(ld).map(o => o['@type']).filter(Boolean).join(', ').slice(0, 200));
    await sleep(700);
  }

  console.log('');
  console.log('== Neuversuche mit anderen Adressen');
  for (const [name, url] of NEUVERSUCH) {
    const r = await get(url, { tries: 1 });
    const b = r.body || '';
    const txt = textOf(b);
    const p = produkteAusSeite(b, new URL(url).origin).filter(istModell);
    console.log('   ' + (name + '                   ').slice(0, 18) + ' HTTP ' + String(r.status).padStart(3) +
                ' ' + String(b.length).padStart(8) + ' B ' + String(txt.length).padStart(6) + ' Zeichen' +
                (/\bh2d\b/i.test(txt) ? '  NENNT H2D' : '') + '  ' + p.length + ' passend');
    for (const x of p.slice(0, 5)) console.log('       + ' + x.name.slice(0, 48) + '  ' + geld(x.jetzt, x.waehrung) + ' [' + (x.verfuegbar || '?') + ']');
    await sleep(700);
  }
})();
