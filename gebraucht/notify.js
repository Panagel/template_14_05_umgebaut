// Wochenbericht Gebrauchtmarkt verschicken: Kurzfassung per ntfy und/oder
// Telegram, Telegram bekommt den vollstaendigen Bericht als Datei dazu.
// Gleiche Kanaele und Secrets wie der Preis-Watcher.
const fs = require('fs');
const path = require('path');
const { kalkulation, med } = require('./kalkulation.js');

const TOPIC = process.env.NTFY_TOPIC || '';
const NTFY_TOKEN = process.env.NTFY_TOKEN || '';
const TG_TOKEN = process.env.TELEGRAM_TOKEN || '';
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';
const REPO = process.env.GITHUB_REPOSITORY || '';
const BRANCH = process.env.GITHUB_REF_NAME || 'main';

if (!TOPIC && !TG_TOKEN) {
  console.error('Weder NTFY_TOPIC noch TELEGRAM_TOKEN gesetzt - keine Benachrichtigung verschickt.');
  process.exit(0);
}

const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'state.json'), 'utf8'));
const K = kalkulation(st);
const T = new Date().toISOString().slice(0, 10);
const eur = v => v == null ? '-' : Math.round(v).toLocaleString('de-DE') + ' EUR';

const comboAktiv = K.segmente.combo.filter(x => !x.weg);
const woche = st.runs.slice(-7);
const neuW = woche.reduce((s, r) => s + (r.neu || 0), 0);
const wegW = woche.reduce((s, r) => s + (r.verschwunden || 0), 0);

const Z = [];
Z.push('Gebrauchte H2D Combo aktiv: ' + comboAktiv.length);
if (comboAktiv.length) {
  const m = med(comboAktiv.map(x => x.preisAktuell));
  Z.push('Median ' + eur(m) + ' = ' + Math.round(100 * m / K.neupreis.preis) + '% vom Neupreis (' + eur(K.neupreis.preis) + ')');
}
if (K.stundensatz != null) {
  Z.push('Je 100 Druckstunden: -' + eur(K.stundensatz * 100) + ' (n=' + K.modell.n + ')');
  Z.push('Gebraucht mit 0 h: ' + eur(K.modell.a));
} else {
  Z.push('Stundenmodell: noch zu wenig Daten (' + K.punkte.length + ' Combos mit Stunden)');
}
Z.push('');
Z.push('Diese Woche: +' + neuW + ' neu / -' + wegW + ' verschwunden');

const top = K.proAnzeige.filter(r => r.urteil === 'guenstig').sort((a, b) => a.abweichung - b.abweichung).slice(0, 3);
const liste = top.length ? top : K.proAnzeige.slice().sort((a, b) => a.preis - b.preis).slice(0, 3);
if (liste.length) {
  Z.push('');
  Z.push(top.length ? 'Guenstig gemessen an den Stunden:' : 'Guenstigste Angebote:');
  for (const r of liste)
    Z.push('- ' + eur(r.preis) + (r.vb ? ' VB' : '') + ', ' + (r.stunden != null ? r.stunden + ' h' : 'Stunden ?') +
      (r.abweichung != null ? ' (' + Math.round(100 * r.abweichung) + '%)' : '') + ', ' + (r.ort || '').slice(0, 25) +
      (r.href ? '\n  https://www.kleinanzeigen.de' + r.href : ''));
}

const berichtPfad = path.join(__dirname, 'berichte', 'bericht-' + T + '.md');
const berichtUrl = REPO ? 'https://github.com/' + REPO + '/blob/' + BRANCH + '/gebraucht/berichte/bericht-' + T + '.md' : null;
Z.push('');
Z.push('Voller Bericht:');
Z.push(berichtUrl || berichtPfad);

const body = Z.join('\n').slice(0, 3800);
console.log('--- Nachricht ---\n' + body + '\n-----------------');

async function sendeNtfy() {
  const headers = {
    'Title': 'H2D Gebrauchtmarkt ' + T,
    'Tags': 'printer,bar_chart',
    'Priority': 'default',
    'Content-Type': 'text/plain; charset=utf-8'
  };
  if (berichtUrl) headers['Click'] = berichtUrl;
  if (NTFY_TOKEN) headers['Authorization'] = 'Bearer ' + NTFY_TOKEN;
  const r = await fetch('https://ntfy.sh/' + TOPIC, { method: 'POST', headers: headers, body: body });
  const t = await r.text();
  if (!r.ok) throw new Error('ntfy HTTP ' + r.status + ': ' + t.slice(0, 200));
  console.log('ntfy: zugestellt.');
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function tg(methode, payload, istForm) {
  const url = 'https://api.telegram.org/bot' + TG_TOKEN + '/' + methode;
  const opt = istForm
    ? { method: 'POST', body: payload }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
  const r = await fetch(url, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error('Telegram ' + methode + ' HTTP ' + r.status + ': ' + JSON.stringify(j).slice(0, 250));
  return j;
}

async function sendeTelegram() {
  if (!TG_CHAT) throw new Error('TELEGRAM_CHAT_ID fehlt.');
  await tg('sendMessage', {
    chat_id: TG_CHAT,
    text: ('<b>H2D Gebrauchtmarkt ' + T + '</b>\n\n<pre>' + esc(body) + '</pre>').slice(0, 4000),
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
  console.log('Telegram: Kurzfassung zugestellt.');
  if (fs.existsSync(berichtPfad)) {
    const form = new FormData();
    form.append('chat_id', TG_CHAT);
    form.append('caption', 'Vollstaendiger Bericht ' + T);
    form.append('document', new Blob([fs.readFileSync(berichtPfad)], { type: 'text/markdown' }), 'H2D-Gebraucht-' + T + '.md');
    await tg('sendDocument', form, true);
    console.log('Telegram: Bericht als Datei zugestellt.');
  }
}

(async () => {
  const fehler = [];
  if (TOPIC) { try { await sendeNtfy(); } catch (e) { console.error('ntfy fehlgeschlagen: ' + e.message); fehler.push('ntfy'); } }
  if (TG_TOKEN) { try { await sendeTelegram(); } catch (e) { console.error('Telegram fehlgeschlagen: ' + e.message); fehler.push('Telegram'); } }
  if (fehler.length) { console.error('Nicht zugestellt ueber: ' + fehler.join(', ')); process.exit(1); }
  console.log('Alle Kanaele zugestellt.');
})();
