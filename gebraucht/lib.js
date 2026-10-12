// Gebrauchtmarkt H2D - Kleinanzeigen lesen.
//
// Gleiche Bauart wie der F900R-Monitor: Trefferlisten ueber mehrere
// Sucheinstiege einsammeln, dann jede Detailseite lesen. Der Unterschied
// liegt im Filtern: unter "h2d" findet Kleinanzeigen vor allem Zubehoer
// (Druckplatten, Duesen, RFID-Rollen), dazu Transporter ("L2H2 D140") und
// Turbolader. Der Drucker selbst ist eine Handvoll Anzeigen dazwischen.
const { stundenAus } = require('./stunden.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const H = { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9', 'Accept': 'text/html,application/xhtml+xml' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: H, redirect: 'follow' });
      if (r.status === 404 || r.status === 410) return { status: r.status, html: '' };
      if (!r.ok) { await sleep(1500 * (i + 1)); continue; }
      return { status: r.status, html: await r.text(), url: r.url };
    } catch (e) { await sleep(1500 * (i + 1)); }
  }
  return { status: 0, html: '' };
}

const strip = s => String(s).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<br\s*\/?>/gi, ' . ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&euro;/g, 'EUR')
  .replace(/&quot;/g, '"').replace(/&#x2F;/gi, '/').replace(/&#\d+;|&#x[0-9a-f]+;/gi, ' ').replace(/\s+/g, ' ').trim();

const num = s => { if (s === null || s === undefined) return null; const v = parseInt(String(s).replace(/[^\d]/g, ''), 10); return Number.isNaN(v) ? null : v; };

// ---------- Listenseiten ----------
function parseList(html) {
  const out = [];
  const re = /<article[^>]*data-adid="(\d+)"[^>]*data-href="([^"]+)"([\s\S]*?)<\/article>/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1], href = m[2], body = m[3];
    let title = '', desc = '';
    const ld = body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ld) { try { const j = JSON.parse(ld[1]); title = j.title || j.name || ''; desc = j.description || ''; } catch (e) {} }
    if (!title) title = strip((body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || '');
    const txt = strip(body);
    // Bei gesenktem Preis stehen zwei Betraege da ("1.450 € 1.900 €"): der
    // erste ist der aktuelle, der zweite der durchgestrichene.
    const price = (txt.match(/([\d.]+)\s*(?:EUR|€)/) || [])[1];
    out.push({ id: id, href: href, title: title, desc: desc, price: price ? num(price) : null });
  }
  return out;
}

// Mehrere Einstiege, weil Kleinanzeigen bei einer einzelnen Suche nicht
// alles ausliefert. Die Preisuntergrenze nimmt das Zubehoer schon in der
// Suche heraus - 500 EUR liegt weit unter jedem funktionierenden Drucker,
// laesst aber ein defektes Geraet noch durch.
const LIST_VARIANTS = [
  'https://www.kleinanzeigen.de/s-anzeige:angebote/preis:500:/seite:{P}/h2d/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/preis:500:/sortierung:SORTIERUNG_DATUM/seite:{P}/h2d/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/preis:500:/seite:{P}/bambu-lab-h2d/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/preis:500:/seite:{P}/bambulab-h2d/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/preis:500:/seite:{P}/h2d-ams/k0',
  'https://www.kleinanzeigen.de/s-anzeige:angebote/preis:500:/seite:{P}/h2d-combo/k0'
];

// Ist das ein H2D-Drucker? Der Titel muss das Modell nennen und nach
// 3D-Drucker klingen. Was nach Fahrzeug, Ersatzteil oder Umbausatz klingt,
// fliegt raus - Preis allein trennt hier nicht, ein Transporter kostet mehr
// als jeder Drucker.
function istH2D(title) {
  const t = String(title || '');
  const s = t.toLowerCase();
  if (!/(^|[^a-z0-9])h2d([^a-z0-9]|$)/i.test(t) && !/h2d(?:combo|ams)/i.test(t)) return false;
  if (!/bambu|drucker|printer|\bams|combo|3d/i.test(t)) return false;
  if (/turbolader|holset|movano|ducato|kasten|transporter|z[aä]hler|heliowatt|nest\s*wifi/i.test(s)) return false;
  // Umbausaetze und Ersatzteile, die den Drucker im Titel nennen
  // Lasermodul allein ("40W Lasermodul inkl. Zubehoer", "Lasermodul fuer
  // H2C / H2D") ist kein Drucker - die Laser Full Combo nennt dagegen
  // Combo, AMS oder Drucker mit.
  if (/laser\s*-?\s*modul|laser\s*module|laser\s*kit/i.test(s) && !/combo|drucker|printer|\bams|edition/i.test(s)) return false;
  // "... fuer H2C / H2D" ist Zubehoer
  if (/\bf(?:ü|ue|u)r\s+(?:den\s+|die\s+)?(?:bambu\s*(?:lab\s*)?)?h2[a-z]/i.test(s) && !/drucker|printer|combo/i.test(s)) return false;
  if (/upgrade\s*(?:zu|auf|kit)|\bzu\s*h2c\b|hotend|heizbett|heatbed|\bboard\b|platine|d[uü]se|nozzle|druckplatte|build\s*plate|filament|rfid|ersatzteil|st[aä]nder|halter|geh[aä]use(?:teil)?|abdeckung|\bt[uü]r\b|ptfe|\bkabel/i.test(s)) return false;
  return true;
}

async function crawlLists(maxPages, log) {
  maxPages = maxPages || 6; log = log || function () {};
  const map = {};
  let roh = 0;
  for (const v of LIST_VARIANTS) {
    for (let p = 1; p <= maxPages; p++) {
      const res = await get(v.replace('{P}', p));
      if (res.status !== 200 || !res.html) break;
      const ads = parseList(res.html);
      if (!ads.length) break;
      roh += ads.length;
      let neu = 0;
      for (const a of ads) if (!map[a.id] && istH2D(a.title)) { map[a.id] = a; neu++; }
      log('  ' + v.slice(37).replace('/seite:{P}', '') + ' S.' + p + ': ' + ads.length + ' Treffer, +' + neu + ' Drucker (gesamt ' + Object.keys(map).length + ')');
      // Kleinanzeigen liefert 25 je Seite; weniger heisst: letzte Seite.
      if (ads.length < 20) break;
      await sleep(300);
    }
  }
  return { ads: Object.values(map), roh: roh };
}

// ---------- Ausbaustufe ----------
// Welche Fassung steht da? Der Titel zaehlt zuerst, die Beschreibung nur,
// wenn der Titel nichts sagt - sonst macht "AMS-kompatibel" im Text aus
// jedem Einzelgeraet eine Combo.
const ZAHLWORT = { ein: 1, eine: 1, einem: 1, einer: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, fuenf: 5 };

function amsAnzahl(text) {
  const t = String(text || '');
  if (/\bohne\s*(?:das\s*|den\s*)?ams\b/i.test(t)) return 0;
  let n = 0;
  const re = /(\d|ein(?:e[mr]?)?|zwei|drei|vier|f[uü]nf)\s*(?:x\s*)?(?:st[uü]ck\s*)?(?:bambu\s*(?:lab\s*)?)?ams(?:[\s-]*2)?(?:[\s-]*pro)?(?![a-z])/gi;
  let m;
  while ((m = re.exec(t))) {
    const z = /\d/.test(m[1]) ? +m[1] : ZAHLWORT[m[1].toLowerCase()] || 1;
    if (z >= 1 && z <= 8) n = Math.max(n, z);
  }
  if (/\bdual[\s-]*ams|\b2\s*x\s*ams|\bams\s*x\s*2\b/i.test(t)) n = Math.max(n, 2);
  if (!n && /\bams\b|ams2|ams[\s-]2[\s-]?pro|\bcombo\b/i.test(t)) n = 1;
  return n;
}

function ausbau(title, desc) {
  const t = String(title || ''), d = String(desc || '');
  const beides = t + ' . ' + d;
  const k = {
    pro: /h2d\s*pro\b/i.test(t),
    laser: /laser/i.test(t) || /laser[\s-]*(?:full[\s-]*)?combo|laser[\s-]*(?:modul|kit|upgrade)|\b(?:10|40)\s*-?\s*w(?:att)?[\s-]*laser/i.test(d),
    amsHT: /\bams\s*ht\b/i.test(beides),
    // Leistung des Lasers, fuer den passenden Neupreis
    laserW: /\b40\s*-?\s*w(?:att)?\b/i.test(t) ? 40 : /\b10\s*-?\s*w(?:att)?\b/i.test(t) ? 10
      : /\b40\s*-?\s*w(?:att)?[\s-]*laser|laser\w*[\s-]*(?:mit\s*)?40\s*-?\s*w/i.test(d) ? 40
      : /\b10\s*-?\s*w(?:att)?[\s-]*laser|laser\w*[\s-]*(?:mit\s*)?10\s*-?\s*w/i.test(d) ? 10 : null,
    ams: amsAnzahl(t),
    mehrereDrucker: /\b(?:2|zwei|3|drei)\s*x?\s*(?:st[uü]ck\s*)?(?:bambu\w*\s*)?(?:lab\s*)?h2d/i.test(t) || /preis\s*(?:gilt\s*)?(?:pro|je)\s*drucker/i.test(d)
  };
  // Titel ohne AMS-Angabe: Beschreibung fragen, aber nur mit klarer Aussage
  if (!k.ams) {
    const ausText = amsAnzahl(d.replace(/kompatib\w*|unterst[uü]tz\w*|f[uü]r\s*(?:das|den)\s*ams|ams[\s-]*(?:f[aä]hig|ready)/gi, ' '));
    if (ausText && /ams[\s-]*2[\s-]*pro|ams2\s*pro|combo|(?:mit|inkl\w*|samt|plus|dabei|geh[oö]rt)[^.]{0,30}ams/i.test(d)) k.ams = ausText;
  }
  // Klasse fuer den Vergleich. "combo" ist das gesuchte Geraet: H2D mit
  // genau einem AMS, ohne Laser.
  let klasse;
  if (k.pro) klasse = 'pro';
  else if (k.laser) klasse = 'laser';
  else if (k.ams >= 2 || (k.ams >= 1 && k.amsHT)) klasse = 'combo-plus';
  else if (k.ams === 1) klasse = 'combo';
  else if (k.amsHT) klasse = 'combo-ht';
  else klasse = 'basis';
  k.klasse = klasse;
  return k;
}

const KLASSEN = {
  combo: 'H2D mit AMS 2 Pro (Combo)',
  'combo-plus': 'H2D mit mehreren AMS',
  'combo-ht': 'H2D mit AMS HT',
  laser: 'H2D Laser-Fassung',
  basis: 'H2D ohne AMS',
  pro: 'H2D Pro'
};

// ---------- Beigaben ----------
// Was den Preis eines gebrauchten Druckers nach oben zieht. Wie beim
// Motorrad: das steht im Text, nicht in einer Akte - knapp geschriebene
// Anzeigen sehen schlechter ausgestattet aus, als sie sind.
const BEIGABEN = {
  rechnung:     /rechnung|kaufbeleg|quittung/i,
  garantie:     /garantie|gew[aä]hrleistung/i,
  ovp:          /originalverpackung|\bovp\b|original\s*karton|orig\.?\s*karton/i,
  ersatzDuese:  /ersatz\s*-?\s*(?:d[uü]se|nozzle|hotend)|zus[aä]tzliche\w*\s*(?:d[uü]se|nozzle|hotend)|weitere\w*\s*(?:d[uü]se|nozzle|hotend)|\d\s*x\s*(?:d[uü]se|nozzle|hotend)|(?:0[.,]2|0[.,]6|0[.,]8)\s*mm/i,
  druckplatten: /(?:zweite|weitere|zus[aä]tzliche|extra|\d\s*x)\s*(?:druck|bau)?\s*-?\s*platte|supertack|cryogrip|textured\s*pei|engineering\s*plate|druckplatten/i,
  filament:     /(?:rollen|spulen|kg)\s*filament|filament\s*(?:dabei|inklusive|inkl|gratis|geschenkt)|\d+\s*(?:x\s*)?rollen/i,
  filter:       /aktivkohle|luftreiniger|rauchfilter|abluft|air\s*(?:purifier|filter)/i,
  zubehoer:     /viel\w*\s*zubeh[oö]r|zubeh[oö]r\s*(?:dabei|inklusive|inkl)|wartungs\s*-?\s*kit/i,
  versand:      /versand\s*(?:m[oö]glich|gegen|ist\s*m[oö]glich)|verschicke|versende/i
};

// Alter in Monaten, soweit genannt: "9 Monate alt", "gekauft im Januar 2026",
// "von Sommer 2025".
const MONATE = { jan: 1, feb: 2, 'mär': 3, mar: 3, maer: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12,
  'frühjahr': 4, fruehjahr: 4, 'frühling': 4, sommer: 7, herbst: 10, winter: 1 };
function alterMonate(text, heute) {
  const t = String(text || '');
  let m = t.match(/(\d{1,2})\s*monat\w*\s*alt|alter\s*:?\s*(\d{1,2})\s*monat/i);
  if (m) return +(m[1] || m[2]);
  // "gekauft im Januar 2026", "im Januar 2026 gekauft", "von Sommer 2025"
  m = t.match(/(?:gekauft|erworben|kauf|vom|von|seit|aus|im|bj\.?|baujahr)\s*(?:im|am|ende|anfang|mitte)?\s*([a-zäöü]{3,9})\.?\s*(20\d{2})/i);
  if (m) {
    const k = Object.keys(MONATE).find(x => m[1].toLowerCase().startsWith(x));
    if (k) {
      const h = heute || new Date();
      const mon = (h.getUTCFullYear() - +m[2]) * 12 + (h.getUTCMonth() + 1 - MONATE[k]);
      if (mon >= 0 && mon <= 60) return mon;
    }
  }
  m = t.match(/(?:gekauft|erworben)\s*(?:im\s*jahr\s*)?(?:am\s*)?(?:\d{1,2}\.\s*)?(\d{1,2})[./](20\d{2})/i);
  if (m) {
    const h = heute || new Date();
    const mon = (h.getUTCFullYear() - +m[2]) * 12 + (h.getUTCMonth() + 1 - +m[1]);
    if (mon >= 0 && mon <= 60) return mon;
  }
  return null;
}

// ---------- Detailseite ----------
function parseDetail(html, id) {
  if (!html) return null;
  if (/Diese Anzeige ist leider nicht mehr verf|Anzeige nicht mehr verf.gbar|wurde gel.scht/i.test(html)) return { id: id, gone: true };

  const seg = (startId, len) => {
    let i = html.indexOf('id="' + startId + '"');
    if (i < 0) return '';
    const gt = html.indexOf('>', i);
    i = gt < 0 ? i : gt + 1;
    return strip(html.slice(i, i + len));
  };

  const title = strip((html.match(/id="viewad-title"[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
  const priceTxt = seg('viewad-price', 200);
  const details = seg('viewad-details', 600).replace(/Beschreibung[\s\S]*$/, '');
  const locality = seg('viewad-locality', 300);
  const extra = seg('viewad-extra-info', 300);
  const descM = html.match(/id="viewad-description-text"[^>]*>([\s\S]*?)<\/p>/);
  const desc = descM ? strip(descM[1]) : '';

  const datum = (extra.match(/(\d{2}\.\d{2}\.\d{4})/) || [])[1] || null;
  const preis = num((priceTxt.match(/([\d.]+)\s*(?:EUR|€)/) || [])[1]);
  // Zustand gibt es nur in der Rubrik "Drucker & Scanner" als Feld
  const zustand = (details.match(/Zustand\s+(Neu|Sehr gut|Gut|In Ordnung|Defekt)/i) || [])[1] || null;
  const art = (details.match(/Art\s+(.+?)(?:\s+Zustand|$)/i) || [])[1] || null;

  const blob = title + ' . ' + desc;
  const st = stundenAus(blob);
  const aus = ausbau(title, desc);
  const beig = {};
  for (const k of Object.keys(BEIGABEN)) beig[k] = BEIGABEN[k].test(blob);

  const gewerblich = /Gewerblicher Nutzer/i.test(html);
  // Neuware: Haendler mit "NEU" im Titel, das Zustandsfeld, oder ausdruecklich
  // unbenutzt. Ein Geraet mit genannten Stunden ist nie neu.
  const neuware = (!st || st.art === 'neu') && (
    (st && st.art === 'neu') || /^neu$/i.test(zustand || '') ||
    (gewerblich && /\bneu\b|neuware|neuger[aä]t/i.test(title)));
  // Defekt: das Zustandsfeld, der Titel, oder eine eindeutige Formulierung im
  // Text. "Defekt" irgendwo in der Beschreibung reicht nicht - "Duese war
  // defekt und ist getauscht" beschreibt ein funktionierendes Geraet.
  const defekt = /^defekt$/i.test(zustand || '') ||
    (/defekt|bastler|ersatzteilspender|f[uü]r\s*teile/i.test(title) && !/nicht\s*defekt/i.test(title)) ||
    /startet\s*nicht\s*mehr|f[uü]r\s*bastler|als\s*ersatzteil(?:spender|tr[aä]ger)|nicht\s*(?:mehr\s*)?funktionsf[aä]hig|ohne\s*funktion/i.test(desc);

  return {
    id: id, gone: false,
    title: title,
    preis: preis,
    vb: /VB/.test(priceTxt),
    zustand: zustand,
    art: art,
    stunden: st ? st.h : null,
    stundenArt: st ? st.art : null,
    stundenText: st ? st.text : null,
    alterMonate: alterMonate(blob),
    ort: locality.replace(/\s*\d{2}\.\d{2}\.\d{4}[\s\S]*$/, '').replace(/<.*$/, '').trim().slice(0, 60),
    plz: (locality.match(/\b(\d{5})\b/) || [])[1] || null,
    datum: datum,
    gewerblich: gewerblich,
    neuware: !!neuware,
    defekt: !!defekt,
    klasse: aus.klasse,
    ams: aus.ams,
    laserW: aus.klasse === 'laser' ? aus.laserW : null,
    mehrereDrucker: aus.mehrereDrucker,
    beigaben: beig,
    descLen: desc.length
  };
}

async function fetchDetails(ads, conc, log) {
  conc = conc || 4; log = log || function () {};
  const out = [];
  let i = 0, done = 0;
  const worker = async () => {
    while (i < ads.length) {
      const a = ads[i++];
      const url = a.href ? 'https://www.kleinanzeigen.de' + a.href : 'https://www.kleinanzeigen.de/s-anzeige/x/' + a.id;
      const res = await get(url);
      const d = res.status === 404 ? { id: a.id, gone: true } : parseDetail(res.html, a.id);
      if (d) {
        d.href = a.href;
        if (!d.gone && a.title && !d.title) d.title = a.title;
        out.push(d);
      }
      done++;
      if (done % 25 === 0) log('  Details: ' + done + '/' + ads.length);
      await sleep(150);
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
  return out;
}

module.exports = { get, crawlLists, parseList, parseDetail, fetchDetails, istH2D, ausbau, amsAnzahl, alterMonate, KLASSEN, BEIGABEN, strip, num, sleep };
