// Push der Meldungen aus data/meldungen.json.
//
// Bewusst ohne ntfy-Mailweiterleitung: ntfy.sh lehnt den Mail-Header ohne
// Kontotoken mit HTTP 400 ab und laesst dabei die ganze Anfrage fallen.
const fs = require('fs');
const path = require('path');

// Welche Meldungsdatei gepusht wird, sagt das erste Argument - so schicken
// mehrere Wachen im selben Repo ihre Meldungen ueber denselben Weg:
//   node notify.js                            (Preiswatcher)
//   node notify.js data-feuertanz/meldungen.json
// Mit --trocken wird nichts gesendet, sondern gezeigt, was rausgehen wuerde.
const args = process.argv.slice(2);
const TROCKEN = args.some(a => a === '--trocken' || a === '--dry');
const ZIEL = args.find(a => !a.startsWith('-'));
const MELD = ZIEL ? path.resolve(ZIEL) : path.join(__dirname, 'data', 'meldungen.json');

const KOPF = {
  // Der Tiefstpreis ueber alle Shops ist die einzige Meldung mit "urgent":
  // sie soll auch durch eine stille Stunde kommen. Zu laut? In notify.js
  // auf 'high' setzen.
  tiefstand:  { prio: 'urgent',  tags: 'rotating_light,money_with_wings' },
  kampagne:   { prio: 'high',    tags: 'fire,shopping' },
  preis:      { prio: 'high',    tags: 'chart_with_downwards_trend,money_with_wings' },
  verfuegbar: { prio: 'default', tags: 'package' },
  neu:        { prio: 'default', tags: 'new' },
  ausfall:    { prio: 'default', tags: 'warning' },

  // --- Ticketwache. "kaufbar" ist dort, was "tiefstand" beim Preiswatcher
  // ist: die eine Nachricht, auf die man gewartet hat. Sie soll auch durch
  // eine stille Stunde kommen, denn ein Vorverkauf wartet nicht.
  kaufbar:    { prio: 'urgent',  tags: 'tickets,fire' },
  vorverkauf: { prio: 'high',    tags: 'alarm_clock,tickets' },
  termin:     { prio: 'high',    tags: 'calendar,castle' },
  ausverkauft:{ prio: 'default', tags: 'no_entry' },
  aenderung:  { prio: 'default', tags: 'eyes' }
};

const TICKET_TYP = /^(?:kaufbar|vorverkauf|termin|ausverkauft|aenderung)$/;

function text(m) {
  const z = [];
  if (m.text) {
    z.push(m.text);
    if (m.code) z.push('Code: ' + m.code);
  }
  for (const g of (m.gruende || [])) z.push('- ' + g);
  // Wo man kauft, gehoert in die Nachricht selbst: auf dem Handy ist ein
  // Link zum Antippen mehr wert als eine Erklaerung.
  if (m.links && m.links.length) {
    z.push('');
    z.push('Kaufen:');
    for (const l of m.links) z.push('  ' + l);
  }
  if (m.produkte && m.produkte.length) {
    z.push('');
    z.push(m.standTitel || 'Stand im Shop:');
    for (const p of m.produkte) {
      let zeile = '  ' + p.name.slice(0, 52) + '  ' + p.jetzt;
      if (p.rabatt) zeile += '  (-' + p.rabatt + '% von ' + p.vorher + ')';
      // Beim Preiswatcher sagt "lieferbar" nichts Neues - das ist der
      // Normalfall. Bei Karten ist es die Nachricht.
      if (p.verfuegbar === 'ja' && TICKET_TYP.test(m.typ)) zeile += '  [zu haben]';
      else if (p.verfuegbar === 'nein') zeile += '  [nicht lieferbar]';
      else if (p.verfuegbar === 'vorbestellung') zeile += '  [Vorbestellung]';
      if (p.bestpreis && p.bestpreis !== p.jetzt) zeile += '  Tief: ' + p.bestpreis;
      z.push(zeile);
    }
  }
  z.push('');
  z.push(m.url);
  return z.join('\n');
}

async function ntfy(m) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  const art = KOPF[m.typ] || KOPF.neu;
  const kopf = { 'Title': m.titel, 'Priority': art.prio, 'Tags': art.tags, 'Click': m.url };
  if (process.env.NTFY_TOKEN) kopf['Authorization'] = 'Bearer ' + process.env.NTFY_TOKEN;
  try {
    const r = await fetch('https://ntfy.sh/' + topic, { method: 'POST', headers: kopf, body: text(m) });
    console.log('  ntfy: ' + r.status);
  } catch (e) { console.log('  ntfy fehlgeschlagen: ' + e.message); }
}

async function telegram(m) {
  const tok = process.env.TELEGRAM_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  try {
    const r = await fetch('https://api.telegram.org/bot' + tok + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: m.titel + '\n\n' + text(m),
        disable_web_page_preview: true
      })
    });
    console.log('  telegram: ' + r.status);
  } catch (e) { console.log('  telegram fehlgeschlagen: ' + e.message); }
}

async function main() {
  let d;
  try { d = JSON.parse(fs.readFileSync(MELD, 'utf8')); } catch (e) {
    console.log('Keine Meldungsdatei - nichts zu senden.');
    return;
  }
  if (!d.meldungen || !d.meldungen.length) {
    console.log('Keine Meldungen.');
    return;
  }
  if (!TROCKEN && !process.env.NTFY_TOPIC && !process.env.TELEGRAM_TOKEN) {
    console.log('Weder NTFY_TOPIC noch TELEGRAM_TOKEN gesetzt - ' + d.meldungen.length + ' Meldung(en) bleiben liegen.');
  }
  for (const m of d.meldungen) {
    console.log('-> ' + m.titel);
    if (TROCKEN) {
      const art = KOPF[m.typ] || KOPF.neu;
      console.log('   [' + m.typ + ', Prioritaet ' + art.prio + ']');
      console.log(text(m).split('\n').map(l => '   | ' + l).join('\n'));
      continue;
    }
    await ntfy(m);
    await telegram(m);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
