// Sofortmeldung aus gebraucht/data/meldungen.json: eine guenstige gebrauchte
// Combo geht direkt aufs Handy, nicht erst mit dem Wochenbericht.
const fs = require('fs');
const path = require('path');

const MELD = path.join(__dirname, 'data', 'meldungen.json');

function text(m) {
  const z = [m.name, (m.gewerblich ? 'Haendler' : 'Privat') + (m.ort ? ', ' + m.ort : ''), ''];
  for (const g of m.gruende) z.push('- ' + g);
  z.push('', m.url);
  return z.join('\n');
}

async function ntfy(m) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  const kopf = { 'Title': m.titel, 'Priority': 'high', 'Tags': 'printer,money_with_wings', 'Click': m.url };
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
      body: JSON.stringify({ chat_id: chat, text: m.titel + '\n\n' + text(m), disable_web_page_preview: true })
    });
    console.log('  telegram: ' + r.status);
  } catch (e) { console.log('  telegram fehlgeschlagen: ' + e.message); }
}

async function main() {
  let d;
  try { d = JSON.parse(fs.readFileSync(MELD, 'utf8')); } catch (e) { console.log('Keine Meldungsdatei - nichts zu senden.'); return; }
  if (!d.meldungen || !d.meldungen.length) { console.log('Keine guenstige Combo neu.'); return; }
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
