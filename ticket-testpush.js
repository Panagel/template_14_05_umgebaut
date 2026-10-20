// Schreibt eine Testmeldung nach data-feuertanz/meldungen.json, damit sich
// der Push-Weg pruefen laesst, ohne auf einen Vorverkauf zu warten. Der
// Zustand in data-feuertanz/state.json bleibt unangetastet.
const fs = require('fs');
const path = require('path');
const CFG = require('./ticket-config.js');

const DATA = process.env.FEUERTANZ_DATA ? path.resolve(process.env.FEUERTANZ_DATA) : path.join(__dirname, 'data-feuertanz');
const datei = path.join(DATA, 'meldungen.json');

fs.mkdirSync(DATA, { recursive: true });
let d = { datum: new Date().toISOString().slice(0, 10), meldungen: [], stand: [] };
try { d = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch (e) {}

// Den Stand des letzten echten Laufs mitschicken: daran sieht man am Handy
// sofort, ob die Wache ueberhaupt etwas weiss - welchen Termin sie kennt und
// wie es um die Karten steht. Eine Testmeldung, die nur "Test" sagt, prueft
// bloss die Leitung, nicht die Wache.
const stand = d.stand || [];
const zeilen = stand.map(s => ({
  name: 'Ausgabe ' + s.ausgabe + ': ' + s.termin,
  jetzt: s.karten, vorher: null, rabatt: null, bestpreis: null,
  verfuegbar: s.karten === 'zu haben' ? 'ja' : (s.karten === 'ausverkauft' ? 'nein' : null)
}));

let zustand = null;
try { zustand = JSON.parse(fs.readFileSync(path.join(DATA, 'state.json'), 'utf8')); } catch (e) {}
const quellen = zustand && zustand.quellen
  ? Object.keys(zustand.quellen).map(k => '  ' + k + ': ' + (zustand.quellen[k].ausfaelle
      ? zustand.quellen[k].ausfaelle + ' Lauf/Laeufe ohne Daten'
      : 'liest (Stand ' + (zustand.quellen[k].zuletztDaten || '?') + ')'))
  : [];

d.meldungen = [{
  typ: 'neu',
  quelle: 'Test',
  url: CFG.quellen.offiziell.basis + '/tickets.html',
  titel: 'Feuertanz-Ticketwache: Testmeldung',
  gruende: ['Wenn du das liest, funktioniert der Push.',
            stand.length ? 'Die Wache kennt ' + stand.length + ' offene Ausgabe(n).'
                         : 'Achtung: die Wache kennt noch keine offene Ausgabe - entweder war noch kein Lauf, oder keine Quelle liefert einen Termin.']
    .concat(quellen.length ? ['Quellen:'].concat(quellen) : [])
    .concat(['Die echte Nachricht heisst "es gibt Karten" und kommt mit hoechster Prioritaet.']),
  standTitel: 'Stand:',
  produkte: zeilen.slice(0, 8)
}];

fs.writeFileSync(datei, JSON.stringify(d, null, 1));
console.log('Testmeldung geschrieben (' + zeilen.length + ' Zeile(n) Stand im Anhang).');
