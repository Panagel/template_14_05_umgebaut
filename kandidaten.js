// Einmalige Kandidatensuche: welcher Haendler fuehrt den H2D und laesst sich
// von einem Runner aus lesen? Probiert je Shop mehrere Suchadressen, weil
// jedes Shopsystem einen anderen Parameter benutzt, und geht bei einer
// Trefferliste ohne Preise den Detailseiten nach - genau wie der
// haendler-Adapter es spaeter tun wuerde.
const { get, textOf, produkteAusSeite, produkteAusJsonLd, produkteAusMicrodata, linksMitModell, geld, sleep } = require('./lib.js');
const { istModell, warumNicht } = require('./shops.js');
const CFG = require('./config.js');

const KANDIDATEN = [
  ['3dmensionals',    'https://3dmensionals.de',            ['/search?sSearch=bambu+lab+h2d', '/search?search=bambu+lab+h2d', '/suche?q=bambu+lab+h2d']],
  ['igo3d',           'https://www.igo3d.com',              ['/search?search=h2d', '/search?search=bambu+lab+h2d+drucker']],
  ['berrybase',       'https://www.berrybase.de',           ['/search?search=bambu+lab+h2d', '/search?sSearch=bambu+lab+h2d']],
  ['123-3d',          'https://www.123-3d.de',              ['/search?q=bambu+lab+h2d', '/suche?q=bambu+lab+h2d', '/catalogsearch/result/?q=bambu+lab+h2d']],
  ['3djake Marke',    'https://www.3djake.de',              ['/bambu-lab', '/bambu-lab/3d-drucker', '/search?search=bambu']],
  ['proshop',         'https://www.proshop.de',             ['/Search?search=bambu+lab+h2d', '/search?search=bambu+lab+h2d', '/?s=bambu+lab+h2d']],
  ['notebooksbilliger','https://www.notebooksbilliger.de',  ['/produkte/bambu+lab+h2d', '/search?query=bambu+lab+h2d']],
  ['cyberport',       'https://www.cyberport.de',           ['/suche/?q=bambu+lab+h2d', '/?query=bambu+lab+h2d']],
  ['jacob',           'https://www.jacob.de',               ['/suche?q=bambu+lab+h2d', '/search?q=bambu+lab+h2d']],
  ['eckstein',        'https://eckstein-shop.de',           ['/search?sSearch=bambu+lab+h2d', '/search?search=bambu+lab+h2d']],
  ['kiwi-electronics','https://www.kiwi-electronics.com',   ['/de/search?q=bambu+lab+h2d', '/search?q=bambu+lab+h2d']],
  ['antratek',        'https://www.antratek.de',            ['/search?q=bambu+lab+h2d', '/catalogsearch/result/?q=bambu+lab+h2d']],
  ['roboter-bausatz', 'https://www.roboter-bausatz.de',     ['/search?search=bambu+lab+h2d', '/suche?sSearch=bambu+lab+h2d']],
  ['voelkner',        'https://www.voelkner.de',            ['/search/search.html?keywords=bambu+lab+h2d', '/search/?keywords=bambu+lab+h2d']],
  ['digitalo',        'https://www.digitalo.de',            ['/search/search.html?keywords=bambu+lab+h2d']],
  ['smdv',            'https://www.smdv.de',                ['/search/search.html?keywords=bambu+lab+h2d']],
  ['filamentworld',   'https://filamentworld.de',           ['/?s=bambu+lab+h2d', '/search?q=bambu+lab+h2d']],
  ['3ddruckboutique', 'https://3ddruckboutique.de',         ['/search?sSearch=bambu+lab+h2d', '/?s=bambu+lab+h2d']],
  ['technikstore24',  'https://www.technikstore24.de',      ['/search?sSearch=bambu+lab+h2d']],
  ['galaxus Produkt', 'https://www.galaxus.de',             ['/de/s6/product/bambu-lab-h2d-3d-drucker-53159463']]
];

const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);

(async () => {
  const brauchbar = [];
  for (const [name, basis, pfade] of KANDIDATEN) {
    let treffer = null;
    for (const pfad of pfade) {
      const r = await get(basis + pfad, { tries: 1 });
      const txt = textOf(r.body || '');
      const nennt = /\bh2d\b/i.test(txt);
      console.log('   ' + pad(name, 19) + ' ' + pad(pfad, 42) + ' HTTP ' + String(r.status).padStart(3) +
                  ' ' + String((r.body || '').length).padStart(7) + ' B  ' + String(txt.length).padStart(6) + ' Zeichen' +
                  (nennt ? '  NENNT H2D' : ''));
      if (r.status === 200 && r.body && nennt) { treffer = { url: basis + pfad, body: r.body }; break; }
      await sleep(600);
    }
    if (!treffer) { console.log('       -> nichts'); console.log(''); continue; }

    const ld = produkteAusJsonLd(treffer.body, basis);
    const md = produkteAusMicrodata(treffer.body, basis);
    let alle = produkteAusSeite(treffer.body, basis);
    let passend = alle.filter(istModell);
    console.log('       Trefferliste: JSON-LD ' + ld.length + ', Microdata ' + md.length + ', passend ' + passend.length);

    // Preis gefunden, aber kein Name? Dann sitzt der Name im Markup anders -
    // Ausschnitt zeigen, damit der Parser nachgezogen werden kann.
    if (!md.length && /itemprop="price"/.test(treffer.body)) {
      const i = treffer.body.indexOf('itemprop="price"');
      console.log('       Microdata ohne Namen, Ausschnitt: ' +
        treffer.body.slice(Math.max(0, i - 260), i + 120).replace(/\s+/g, ' '));
    }

    // Keine Preise in der Liste: Detailseiten probieren.
    if (!passend.length) {
      const links = linksMitModell(treffer.body, basis, CFG.modellRe)
        .filter(u => !CFG.ausschlussRe.test(u.replace(/[-_/]/g, ' ')))
        .slice(0, 3);
      console.log('       ' + links.length + ' Detailseite(n) zum Nachsehen');
      for (const u of links) {
        const d = await get(u, { tries: 1 });
        const p2 = produkteAusSeite(d.body || '', basis).filter(istModell);
        console.log('         ' + pad(u.replace(basis, ''), 62) + ' HTTP ' + d.status + '  ' + p2.length + ' passend');
        for (const p of p2.slice(0, 3)) console.log('           + ' + pad(p.name, 44) + ' ' + geld(p.jetzt, p.waehrung) + ' [' + (p.verfuegbar || '?') + ']');
        if (p2.length) { passend = passend.concat(p2); }
        await sleep(700);
      }
    }

    for (const p of passend.slice(0, 8)) {
      console.log('       + ' + pad(p.name, 46) + ' ' + geld(p.jetzt, p.waehrung) +
                  (p.vorher ? ' statt ' + geld(p.vorher, p.waehrung) : '') + ' [' + (p.verfuegbar || '?') + ']');
    }
    for (const p of alle.filter(x => !istModell(x)).slice(0, 2)) {
      console.log('       - ' + pad(p.name, 46) + ' ' + geld(p.jetzt, p.waehrung) + '  (' + warumNicht(p) + ')');
    }
    if (passend.length) brauchbar.push(name + ' (' + treffer.url + ')');
    console.log('');
  }
  console.log('== Brauchbar:');
  for (const b of brauchbar) console.log('   ' + b);
})();
