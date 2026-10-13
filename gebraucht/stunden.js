// Druckstunden aus dem Anzeigentext lesen.
//
// Beim Drucker sind die Stunden das, was beim Motorrad der Kilometerstand
// ist - nur gibt es kein Formularfeld dafuer. Die Zahl steht im Freitext, und
// zwar in allen Schreibweisen: "ca. 300 Druckstunden", "Laufzeit: 150h",
// "Druckzeit laut Display 212 Std.", "unter 100h gelaufen", "1.200 h".
//
// Dieselbe Schreibweise trifft aber auch Dinge, die keine Laufzeit sind:
// "Versand innerhalb 24h", "48 Stunden Rueckgabe", "Druck dauerte 14h". Eine
// Zahl mit Stundeneinheit zaehlt deshalb nur, wenn das Wort davor oder
// dahinter von Laufzeit spricht - oder die Einheit selbst es tut
// ("Druckstunden", "Betriebsstunden").

// Einheit, die selbst schon Laufzeit bedeutet.
const EINHEIT_STARK = '(?:druck|betriebs|lauf|nutzungs|print|benutzungs)[\\s-]?(?:stunden|std\\.?|h)\\b|print[\\s-]?hours?\\b';
// Neutrale Einheit: braucht ein Laufzeitwort in der Naehe.
const EINHEIT = '(?:stunden|std\\.?|h|hours?|hrs?)(?![a-zäöüß])';
// Worte, die von Laufzeit sprechen.
// "Der Drucker hat aktuell 418 Stunden auf der Uhr" - so steht es in echten
// Anzeigen, ohne das Wort Druck.
const KONTEXT = /druck|lauf|betrieb|gelaufen|genutzt|nutzung|benutzt|gedruckt|insgesamt|gesamt|total|z[aä]hler|uhr\b|tacho|statistik|display|app\b|handy|bambu\s*(?:studio|handy)|print|runtime|usage|used|aktuell|\bhat\b|alt\b|erst\b|nur\b|knapp|wenig|ca\.?|circa|etwa|rund|unter\b|weniger/i;
// Worte, die eine Stundenzahl als etwas anderes ausweisen.
const STOER = /versand|verschick|lieferung|liefer|zustell|antwort|erreichbar|abhol|r[uü]ckgabe|r[uü]ckgaberecht|tage?\b|woche|monat|garantie|gew[aä]hr|ladezeit|aufheiz|dauer(?:te|t)?\b|druckdauer|pro\s*druck|je\s*druck|am\s*st[uü]ck|non[\s-]?stop|24\/7|bereit|online|service/i;

const ZAHL = '(\\d{1,2}[.,]\\d{3}|\\d{1,5})(?:[.,]\\d)?';

// "unter 100h" ist eine Obergrenze, kein Messwert - der Wert wird trotzdem
// verwendet (als Schaetzung), aber markiert.
const OBERGRENZE = /(?:unter|weniger\s*als|max(?:imal)?\.?|kaum|keine)\s*$/i;
const UNGEFAEHR = /(?:ca\.?|circa|etwa|rund|ungef[aä]hr|~|knapp)\s*$/i;

const zahl = s => parseInt(String(s).replace(/[.,]/g, ''), 10);

// Liefert { h, art, text } oder null.
//   art: 'genau' | 'ca' | 'max' | 'neu'
function stundenAus(text) {
  const t = ' ' + String(text || '').replace(/\s+/g, ' ') + ' ';
  const kandidaten = [];

  // 1) Zahl vor der Einheit: "300 Druckstunden", "150h gelaufen", "ca. 212 Std."
  const reVor = new RegExp(ZAHL + '\\s*(?:\\+\\s*)?(' + EINHEIT_STARK + '|' + EINHEIT + ')', 'gi');
  let m;
  while ((m = reVor.exec(t))) {
    const vorn = t.slice(Math.max(0, m.index - 45), m.index);
    const hinten = t.slice(m.index + m[0].length, m.index + m[0].length + 45);
    const stark = new RegExp('^(?:' + EINHEIT_STARK + ')$', 'i').test(m[2]);
    // Die naechste Umgebung entscheidet. Ein Stoerwort direkt am Treffer
    // schlaegt ein Laufzeitwort weiter weg: "Druckzeit pro Teil 14h".
    const nahVorn = vorn.slice(-28), nahHinten = hinten.slice(0, 28);
    if (STOER.test(nahVorn) || STOER.test(nahHinten.replace(/^\s*(?:druck|lauf|betrieb)\w*/i, ''))) {
      if (!stark) continue;
    }
    // Ohne Laufzeitwort zaehlt nur eine Zahl, die fuer etwas anderes zu gross
    // ist: "4530h 2439h" am Ende einer Anzeige ist ein Zaehlerstand, "24h"
    // und "48 Stunden" sind Versand- oder Antwortfristen.
    if (!stark && !KONTEXT.test(nahVorn + ' ' + nahHinten) && !(zahl(m[1]) >= 100 && !STOER.test(nahVorn + ' ' + nahHinten))) continue;
    // "0,4 h" oder "2,5 Stunden" ist eine Druckdauer, keine Laufleistung
    if (/[.,]\d$/.test(m[0].replace(/\s*\D+$/, '')) && zahl(m[1]) < 10) continue;
    const h = zahl(m[1]);
    if (!(h >= 0 && h <= 20000)) continue;
    let art = 'genau';
    if (OBERGRENZE.test(vorn)) art = 'max';
    else if (UNGEFAEHR.test(vorn)) art = 'ca';
    kandidaten.push({ h: h, art: art, stark: stark, text: (vorn.slice(-20) + m[0] + hinten.slice(0, 12)).trim() });
  }

  // 2) Wort vor der Zahl: "Druckstunden: 150", "Laufzeit ca. 300", "Betriebsstunden 1.200"
  const reNach = /(druck(?:stunden|zeit(?:\s*gesamt)?)|betriebs(?:stunden|zeit)|lauf(?:zeit|stunden|leistung)|nutzungs(?:dauer|zeit|stunden)|print(?:ing)?\s*(?:time|hours)|gesamt(?:e)?\s*druckzeit)\s*(?:von|bei|laut\s*\w+|lt\.?\s*\w+|bisher|insgesamt|aktuell|gesamt)?\s*[:=]?\s*(ca\.?|circa|etwa|rund|unter|knapp|~)?\s*(\d{1,2}[.,]\d{3}|\d{1,5})\s*(stunden|std\.?|h\b|hours?)?/gi;
  while ((m = reNach.exec(t))) {
    const h = zahl(m[3]);
    if (!(h >= 0 && h <= 20000)) continue;
    // "Druckzeit 14h pro Teil": was hinten steht, kann den Treffer kippen
    const hinten = t.slice(m.index + m[0].length, m.index + m[0].length + 20);
    if (/^\s*(?:pro|je|f[uü]r\s*(?:ein|den|das))/i.test(hinten)) continue;
    // Ohne Einheit nur, wenn das Wort eindeutig Stunden meint
    if (!m[4] && !/stunden|hours/i.test(m[1])) continue;
    const mod = (m[2] || '').toLowerCase();
    const art = /unter/.test(mod) ? 'max' : mod ? 'ca' : 'genau';
    kandidaten.push({ h: h, art: art, stark: true, text: m[0].trim() });
  }

  if (kandidaten.length) {
    // Mehrere Angaben: die mit eindeutiger Einheit vorziehen, sonst die
    // groesste - "Drucker 300h, Laser 20h" meint den Drucker.
    kandidaten.sort((a, b) => (b.stark - a.stark) || (b.h - a.h));
    const k = kandidaten[0];
    return { h: k.h, art: k.art, text: k.text.slice(0, 80) };
  }

  // 3) Keine Zahl, aber ausdruecklich unbenutzt: zaehlt als 0 Stunden.
  // Gebeugt steht es meist da ("einen originalverpackten, ungeoeffneten
  // H2D"). "OVP" allein heisst oft nur "Karton ist dabei" - das zaehlt erst
  // mit "neu" daneben.
  const unbenutzt = /\b(?:originalverpackt|unbenutzt|ungeöffnet|ungeoeffnet|versiegelt|nagelneu|fabrikneu)|\bsealed\b|\bnie\s*(?:benutzt|ausgepackt|gedruckt)|\bnicht\s*ausgepackt|\bnoch\s*nie\s*(?:gedruckt|benutzt|in\s*betrieb)|\bneu\b[^.]{0,20}\bovp\b|\bovp\b[^.]{0,12}\bneu\b/i;
  if (unbenutzt.test(t) && !/\b(?:fast|quasi|wie|kaum|wenig)\s*(?:unbenutzt|neu)/i.test(t)) {
    return { h: 0, art: 'neu', text: 'unbenutzt/OVP' };
  }
  return null;
}

module.exports = { stundenAus };
