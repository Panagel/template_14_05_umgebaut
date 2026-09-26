// Diagnose: welcher Shop antwortet von diesem Netz aus, und laesst er sich
// lesen? Shops bewerten IP-Reputation und liefern regionale Preise, das
// Ergebnis faellt auf einem Cloud-Runner deshalb anders aus als am
// Wohnanschluss. Dieser Lauf entscheidet, was in config.js aktiv steht -
// die Shop-Tabelle im README ist sein Protokoll.
//
// Von Hand starten: Workflow "Shop-Diagnose". Laeuft in keinem Zeitplan mit.
const { get, textOf, produkteAusSeite, produkteAusJsonLd, produkteAusMicrodata, geld, sleep } = require('./lib.js');
const { istModell, warumNicht, sammleBanner } = require('./shops.js');

// [Gruppe, Beschriftung, URL]
const ZIELE = [
  ['aktiv: Herstellershop',
    ['Startseite (Banner)',   'https://eu.store.bambulab.com/'],
    ['Produkt-Sitemap',       'https://eu.store.bambulab.com/sitemap_products_1.xml'],
    ['Produktseite H2D',      'https://eu.store.bambulab.com/products/h2d']],

  ['aktiv: Haendler',
    ['reichelt Suche',        'https://www.reichelt.de/de/de/shop/suche/bambu%20lab%20h2d']],

  ['Kandidaten',
    ['berrybase',             'https://www.berrybase.de/search?search=bambu+lab+h2d'],
    ['billiger.de',           'https://www.billiger.de/search?searchString=bambu+lab+h2d']],

  ['geprueft und verworfen',
    ['3DJake',                'https://www.3djake.de/search?search=bambu+lab+h2d'],
    ['iGo3D',                 'https://www.igo3d.com/search?search=bambu+lab+h2d'],
    ['Geizhals',              'https://geizhals.de/?fs=bambu+lab+h2d&hloc=de&in='],
    ['Idealo',                'https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=bambu+lab+h2d'],
    ['Alternate',             'https://www.alternate.de/html/product/listing.html?q=bambu+lab+h2d'],
    ['Galaxus',               'https://www.galaxus.de/de/search?q=bambu+lab+h2d'],
    ['Conrad',                'https://www.conrad.de/de/search.html?search=bambu%20lab%20h2d'],
    ['MediaMarkt',            'https://www.mediamarkt.de/de/search.html?query=bambu%20lab%20h2d'],
    ['Alza',                  'https://www.alza.de/search.htm?exps=bambu+lab+h2d'],
    ['Coolblue',              'https://www.coolblue.de/suchen?query=bambu+lab+h2d'],
    ['Amazon',                'https://www.amazon.de/s?k=bambu+lab+h2d']]
];

const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);

(async () => {
  for (const gruppe of ZIELE) {
    console.log('');
    console.log('== ' + gruppe[0]);
    for (let i = 1; i < gruppe.length; i++) {
      const [name, url] = gruppe[i];
      const r = await get(url, { tries: 1 });
      const body = r.body || '';
      const txt = textOf(body);
      const notiz = [];

      // Umleitungen sind hier die halbe Diagnose: der Herstellershop
      // schickt US-Anfragen auf den US-Shop, und damit in eine andere
      // Waehrung.
      if (r.url && r.url.replace(/\/$/, '') !== url.replace(/\/$/, '')) notiz.push('umgeleitet nach ' + r.url);

      if (/sitemap/.test(url)) {
        const alle = (body.match(/<loc>/g) || []).length;
        const modelle = Array.from(new Set(body.match(/<loc>[^<]*\/products\/h2d[a-z0-9-]*<\/loc>/gi) || []));
        notiz.push(alle + ' Adressen, ' + modelle.length + ' Modellseite(n)');
        for (const m of modelle.slice(0, 8)) notiz.push('  ' + m.replace(/<\/?loc>/g, ''));
      } else {
        notiz.push(txt.length + ' Zeichen Text' + (/\bh2d\b/i.test(txt) ? ', nennt H2D' : ''));
        const ld = produkteAusJsonLd(body, new URL(url).origin);
        const md = produkteAusMicrodata(body, new URL(url).origin);
        const alle = produkteAusSeite(body, new URL(url).origin);
        const passend = alle.filter(istModell);
        if (ld.length || md.length) notiz.push('JSON-LD ' + ld.length + ', Microdata ' + md.length + ', passend ' + passend.length);
        for (const p of passend.slice(0, 8)) {
          notiz.push('  + ' + pad(p.name, 46) + ' ' + geld(p.jetzt, p.waehrung) +
                     (p.vorher ? ' statt ' + geld(p.vorher, p.waehrung) : '') + ' [' + (p.verfuegbar || '?') + ']');
          // Die Kennung mitzeigen: sie ist der Schluessel im Zustand, und ein
          // Shop, der ueberall dieselbe hinschreibt, faellt nur hier auf.
          notiz.push('      Kennung ' + p.id.slice(0, 92));
        }
        for (const p of alle.filter(x => !istModell(x)).slice(0, 3)) {
          notiz.push('  - ' + pad(p.name, 46) + ' ' + geld(p.jetzt, p.waehrung) + '  (' + warumNicht(p) + ')');
        }
        for (const b of sammleBanner(body).slice(0, 2)) {
          notiz.push('  Banner: ' + b.text.slice(0, 84) + (b.code ? ' [Code ' + b.code + ']' : ''));
        }
      }

      console.log('   ' + pad(name, 20) + ' HTTP ' + String(r.status).padStart(3) +
                  ' ' + String(body.length).padStart(8) + ' B  ' + notiz[0]);
      for (const n of notiz.slice(1)) console.log('       ' + n);
      await sleep(800);
    }
  }
  console.log('');
  console.log('Was 200 liefert und "passend" nennt, kann in config.js aktiv stehen.');
})();
