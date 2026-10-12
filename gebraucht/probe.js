// Temporaer: echte Kleinanzeigen-Seiten zum H2D ansehen.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const H = { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9', 'Accept': 'text/html,application/xhtml+xml' };
const strip = s => String(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&euro;/g, 'EUR')
  .replace(/&quot;/g, '"').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u) { try { const r = await fetch(u, { headers: H, redirect: 'follow' }); return { s: r.status, u: r.url, h: await r.text() }; } catch (e) { return { s: 0, h: '', u: u }; } }

const URLS = [
  'https://www.kleinanzeigen.de/s-h2d/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/h2d/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/seite:2/h2d/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/bambu-lab-h2d/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/h2d-combo/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/preis:800:/h2d/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/sortierung:SORTIERUNG_DATUM/h2d/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/bambu-h2d/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/h2d-ams/k0'
];

(async () => {
  const ids = {};
  for (const u of URLS) {
    const r = await get(u);
    const arts = [...r.h.matchAll(/<article[^>]*data-adid="(\d+)"[^>]*data-href="([^"]+)"([\s\S]*?)<\/article>/g)];
    console.log('\n### ' + u + ' -> ' + r.s + ' ' + r.u + ' ' + r.h.length + 'B, articles=' + arts.length);
    const bc = (r.h.match(/breadcrump-summary[^>]*>([\s\S]{0,200})/) || [])[1];
    if (bc) console.log('  summary: ' + strip(bc).slice(0, 150));
    for (const a of arts) {
      const txt = strip(a[3]);
      if (!ids[a[1]]) ids[a[1]] = a[2];
      console.log('  ' + a[1] + ' | ' + txt.slice(0, 230));
    }
    await sleep(500);
  }
  // Rohes Markup eines Artikels, einmal
  const r0 = await get(URLS[1]);
  const m0 = r0.h.match(/<article[^>]*data-adid="\d+"[\s\S]*?<\/article>/);
  if (m0) console.log('\n### ROH-ARTIKEL\n' + m0[0].replace(/\s+/g, ' ').slice(0, 4000));
  // Detailseiten
  const list = Object.entries(ids).slice(0, 40);
  console.log('\n### DETAILS (' + list.length + ' von ' + Object.keys(ids).length + ')');
  let first = true;
  for (const [id, href] of list) {
    const r = await get('https://www.kleinanzeigen.de' + href);
    const title = strip((r.h.match(/id="viewad-title"[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
    const seg = (sid, len) => { let i = r.h.indexOf('id="' + sid + '"'); if (i < 0) return ''; const g = r.h.indexOf('>', i); return strip(r.h.slice(g + 1, g + 1 + len)); };
    const desc = strip((r.h.match(/id="viewad-description-text"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '');
    console.log('\n--- ' + id + ' ' + r.s + ' ' + href);
    console.log('TITEL: ' + title);
    console.log('PREIS: ' + seg('viewad-price', 300).slice(0, 80));
    console.log('DETAILS: ' + seg('viewad-details', 3000).slice(0, 400));
    console.log('ORT: ' + seg('viewad-locality', 300).slice(0, 100) + ' | EXTRA: ' + seg('viewad-extra-info', 300).slice(0, 100));
    console.log('GEWERBLICH: ' + /Gewerblicher Nutzer/i.test(r.h) + ' | VERSAND: ' + /Versand m.glich/i.test(r.h));
    console.log('BESCHR: ' + desc.slice(0, 1500));
    if (first) {
      first = false;
      const i = r.h.indexOf('id="viewad-details"');
      console.log('ROH-DETAILS: ' + r.h.slice(i, i + 2500).replace(/\s+/g, ' '));
      const j = r.h.indexOf('id="viewad-price"');
      console.log('ROH-PREIS: ' + r.h.slice(j - 200, j + 600).replace(/\s+/g, ' '));
    }
    await sleep(400);
  }
})();
