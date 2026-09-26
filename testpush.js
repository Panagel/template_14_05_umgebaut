// Schreibt eine Testmeldung nach data/meldungen.json, damit sich der
// Push-Weg pruefen laesst, ohne auf eine echte Preissenkung zu warten.
// Der Zustand in data/state.json bleibt unangetastet.
const fs = require('fs');
const path = require('path');

const datei = path.join(__dirname, 'data', 'meldungen.json');
let d = { datum: new Date().toISOString().slice(0, 10), meldungen: [], uebersicht: [] };
try { d = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch (e) {}

// Den Stand des letzten echten Laufs mitschicken - so sieht man am Handy
// sofort, ob die Shops ueberhaupt Preise geliefert haben.
const zeilen = [];
for (const u of (d.uebersicht || [])) {
  for (const p of (u.produkte || [])) {
    zeilen.push({
      name: u.shop + ': ' + p.name, jetzt: p.jetzt, vorher: p.vorher,
      rabatt: p.rabatt, bestpreis: p.bestpreis, verfuegbar: p.verfuegbar
    });
  }
}

// Die Bestmarken mitschicken - daran sieht man am Handy sofort, ob der
// Watcher eine Vorgeschichte hat, gegen die er vergleichen kann.
const tief = (d.tiefstpreise || []).map(t => '  ' + t.klasse + ': ' + t.preis + ' (' + t.shop + ', ' + t.datum + ')');

d.meldungen = [{
  typ: 'neu',
  shop: 'Test',
  url: 'https://github.com',
  titel: 'H2D-Watcher: Testmeldung',
  gruende: ['Wenn du das liest, funktioniert der Push.',
            zeilen.length ? 'Der letzte Scan hat ' + zeilen.length + ' Variante(n) gesehen.'
                          : 'Achtung: der letzte Scan hat keine Preise geliefert.']
           .concat(tief.length ? ['Tiefstpreise bisher:'].concat(tief) : []),
  produkte: zeilen.slice(0, 12)
}];

fs.writeFileSync(datei, JSON.stringify(d, null, 1));
console.log('Testmeldung geschrieben (' + zeilen.length + ' Varianten im Anhang).');
