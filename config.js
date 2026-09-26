// Schwellen des Watchers. Hier drehst du, wie laut er ist.
module.exports = {
  // --- Was ueberhaupt gesucht wird ---------------------------------------
  // Der Name muss das Modell nennen. Wortgrenze vorn, damit nicht jedes
  // Zubehoerteil mit "H2D" im Titel als Drucker durchgeht; nach hinten offen,
  // damit spaetere Ableger (H2D Pro, H2D Combo) von allein mitlaufen.
  modellRe: /\bH2D\b/i,

  // Zubehoer, Ersatzteile und Garantieverlaengerungen tragen denselben
  // Modellnamen. Was hier passt, ist kein Drucker.
  ausschlussRe: /\b(d[uü]se|nozzle|hotend|heatbed|bauplatte|bed\s*plate|build\s*plate|platte|sheet|filament|spool|spule|filter|riemen|belt|lüfter|l[uü]fter|fan|kamera|camera|glas|glass|brille|goggles|schutz|cover|deckel|door|t[uü]r|schraube|screw|adapter|kabel|cable|halter|holder|mount|bag|tasche|aufkleber|sticker|matte|mat|reiniger|cleaner|wartung|maintenance|ersatz|spare|kit|set\s*of|zubeh[oö]r|accessor|garantie|warranty|protection\s*plan|versand|shipping|gutschein|gift\s*card)\b/i,

  // Plausible Preisspanne eines Geraets in Cent. Der wirksamste Filter
  // gegen Zubehoer: Duesen kosten zweistellig, Drucker vierstellig.
  preisMin: 80000,             //    800 EUR
  preisMax: 900000,            //  9.000 EUR

  // Welche Shops laufen. Zum Abschalten auf false setzen.
  aktiv: { bambulab: true, jake3d: true, igo3d: true, geizhals: true },

  // --- Signal 1: Preis ---------------------------------------------------
  // Gemessen wird gegen den Median der letzten Laeufe, nicht gegen gestern:
  // ein einzelner Fehlgriff beim Parsen soll keinen Alarm ausloesen.
  baselineLaeufe: 14,
  preisSprungProzent: 4,       // ab -4 % gegen den Median wird gemeldet
  bestpreisMelden: true,       // neuer Tiefstand meldet immer, auch unter 4 %

  // Dieselbe Preissenkung nur einmal melden. Erst wenn der Preis noch
  // tiefer faellt, kommt die naechste Nachricht - sonst pusht ein zwei
  // Wochen laufender Sale jeden Morgen aufs Neue.
  nurTieferMelden: true,

  // --- Signal 2: ausgewiesener Rabatt ------------------------------------
  // Streichpreis im Shop. Der Bambu-Shop fuehrt ihn als compare_at_price,
  // Haendler oft gar nicht - dort greift nur Signal 1.
  rabattMinProzent: 5,

  // --- Signal 3: beworbene Kampagne --------------------------------------
  // Ein Banner meldet sich, sobald er neu ist. Danach erst wieder, wenn er
  // laenger als diese Frist verschwunden war.
  kampagneStillTage: 30,
  // Hardware wird selten zweistellig rabattiert. 20 % wie bei Bekleidung
  // waere hier zu hoch angesetzt - dann bliebe der Watcher stumm.
  kampagneMinProzent: 10,

  // --- Signal 4: Lieferbarkeit ------------------------------------------
  // Wieder-verfuegbar ist bei einem gefragten Drucker eine eigene Nachricht.
  verfuegbarkeitMelden: true,

  // Eine neu aufgetauchte Variante melden (etwa ein Pro-Modell). Nur, wenn
  // der Shop vorher schon Daten geliefert hat - beim ersten Lauf ist alles
  // neu und niemand will vier Nachrichten auf einmal.
  neueVariantenMelden: true
};
