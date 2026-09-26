// Push der Meldungen aus data/meldungen.json.
//
// Bewusst ohne ntfy-Mailweiterleitung: ntfy.sh lehnt den Mail-Header ohne
// Kontotoken mit HTTP 400 ab und laesst dabei die ganze Anfrage fallen.
const fs = require('fs');
const path = require('path');

const MELD = path.join(__dirname, 'data', 'meldungen.json');

const KOPF = {
  kampagne:   { prio: 'high',    tags: 'fire,shopping' },
  preis:      { prio: 'high',    tags: 'chart_with_downwards_trend,money_with_wings' },
  verfuegbar: { prio: 'default', tags: 'package' },
  neu:        { prio: 'default', tags: 'new' },
  ausfall:    { prio: 'default', tags: 'warning' }
};

function text(m) {
  const z = [];
  if (m.typ === 'kampagne') {
    z.push(m.text);
    if (m.code) z.push('Code: ' + m.code);
  }
  for (const g of (m.gruende || [])) z.push('- ' + g);
  if (m.produkte && m.produkte.length) {
    z.push('');
    z.push('Stand im Shop:');
    for (const p of m.produkte) {
      let zeile = '  ' + p.name.slice(0, 52) + '  ' + p.jetzt;
      if (p.rabatt) zeile += '  (-' + p.rabatt + '% von ' + p.vorher + ')';
      if (p.verfuegbar === 'nein') zeile += '  [nicht lieferbar]';
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
  if (!process.env.NTFY_TOPIC && !process.env.TELEGRAM_TOKEN) {
    console.log('Weder NTFY_TOPIC noch TELEGRAM_TOKEN gesetzt - ' + d.meldungen.length + ' Meldung(en) bleiben liegen.');
  }
  for (const m of d.meldungen) {
    console.log('-> ' + m.titel);
    await ntfy(m);
    await telegram(m);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
