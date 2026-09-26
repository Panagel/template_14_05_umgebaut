# H2D-Watcher

Meldet, wenn der **Bambu Lab H2D** guenstiger wird — im Herstellershop und bei
den Haendlern. Kein Sortiments-Ticker: der Watcher verfolgt **das Geraet selbst
und das Geraet mit AMS 2 Pro** und meldet sich, wenn sich Preis, Rabatt oder
Lieferbarkeit aendern.

Laeuft in GitHub Actions, zweimal taeglich. Der PC bleibt aus.

Gleiche Bauart wie der Motorrad-Sale-Watcher: Node ohne Abhaengigkeiten,
Zustand im Repo, Push per ntfy und Telegram. Nur die Signale sind andere —
bei einem einzelnen Geraet zaehlt der Preis selbst, nicht die Breite eines
Sales.

## Was beobachtet wird

Der H2D wird in mehreren Ausbaustufen verkauft. Beobachtet werden die beiden,
um die es geht:

| Ausbaustufe | beobachtet | Stand 26.09.2026 |
|---|---|---|
| H2D allein | **ja** | 1.549 EUR (reichelt) · 1.549 USD (Hersteller) |
| H2D mit AMS 2 Pro | **ja** | 1.749 EUR (reichelt) · 1.749 USD (Hersteller) |
| H2D mit AMS 2 Pro, aufgearbeitet | **ja** | 1.469 USD (Hersteller) |
| H2D Laser Full Combo 10 W | nein | 2.149 |
| H2D Laser Full Combo 40 W | nein | 2.549 / 2.699 |
| H2D mit zwei AMS 2 Pro | nein | 1.949 USD |
| H2D mit AMS HT | nein | 1.849 USD |
| H2D Pro | nein | 2.949 EUR |

Was auf *nein* steht, kommt gar nicht erst in den Zustand: keine Meldung,
keine Zeile im Log, kein Tiefstpreis. Der Schalter ist `klassenAktiv` in
[`config.js`](config.js), ein Wort auf `true` genuegt. Fuer das Pro-Modell und
fuer aufgearbeitete Geraete gibt es je einen eigenen (`proMelden`,
`gebrauchtMelden`).

Aufgearbeitete Geraete bleiben mit drin, weil sie dasselbe Geraet sind und
derzeit der guenstigste Weg dazu — sie laufen als eigene Vergleichsgruppe und
tragen in jeder Meldung ein `(aufgearbeitet)`, damit sie nie mit Neuware
verwechselt werden.

Wird eine Stufe stillgelegt, bleibt ihre Bestmarke im Zustand stehen und wird
nur nicht mehr angezeigt. Wer sie wieder einschaltet, hat die Vorgeschichte
noch; erst nach 120 Laufen ohne Sichtung raeumt der Watcher die Variante
endgueltig aus.

## Fuenf Signale

**1. Tiefstpreis ueber alle Shops.** Die Meldung, auf die es ankommt:
billiger als alles, was der Watcher fuer dieses Geraet je gesehen hat — egal,
welcher Shop damals der guenstigste war.

```
Tiefstpreis H2D AMS Combo: 1.699,00 EUR bei reichelt
  - Tiefstpreis fuer H2D AMS Combo: 1.699,00 EUR - billiger als alles bisher
    Gesehene (1.749,00 EUR bei Bambu Lab Store am 26.09.2026)
  - Preis 1.749,00 EUR -> 1.699,00 EUR (-3% gegen den Median der letzten Laeufe)
```

Damit das ueber Shopgrenzen funktioniert, muss dasselbe Geraet wiedererkannt
werden, obwohl jeder Shop es anders nennt: `H2D Laser Full Combo / 10W` beim
Hersteller, `3D Drucker, Bambu Lab H2D, 10 W Laser` bei reichelt. Beides ist
die 10-Watt-Laserfassung, beides dieselbe Vergleichsgruppe. Die Zuordnung
steht in `config.js` unter `varianten`.

Getrennt gehalten wird, was nicht vergleichbar ist: **Pro** zaehlt eigen (ein
Pro-Geraet darf nicht den Tiefstpreis des einfachen Modells setzen —
`AMS 2 Pro` im Bundle-Namen ist dabei nicht gemeint), **aufgearbeitete**
Geraete ebenso, und **jede Waehrung** fuer sich. Diese Meldung geht mit
ntfy-Prioritaet `urgent` raus und wird von der Meldebremse nie
zurueckgehalten. Zu laut? In `notify.js` auf `high` stellen.

Beim ersten Lauf nach der Einrichtung meldet dieses Signal nichts: da entsteht
die Bestmarke erst. Was der Watcher als Bestmarke fuehrt, steht am Ende jedes
Laufs im Log und in `data/meldungen.json`, und die Testmeldung schickt es mit
aufs Handy.

**2. Preis je Shop.** Der aktuelle Preis gegen den **Median der letzten 14
Laeufe**, nicht gegen gestern: ein einzelner Fehlgriff beim Lesen soll keinen
Alarm ausloesen. Gemeldet wird ab 4 % Abweichung (`preisSprungProzent`) und
immer, wenn ein Shop seinen eigenen Tiefstand unterbietet — auch wenn ein
anderer Shop insgesamt guenstiger war.

Dieselbe Senkung meldet **einmal**. Erst ein noch tieferer Preis meldet erneut
(`nurTieferMelden`) — sonst pusht ein zwei Wochen laufender Sale jeden Morgen
aufs Neue. Steigt der Preis wieder, ist die Bremse geloest.

**3. Ausgewiesener Rabatt.** Der Bambu-Shop schreibt seinen Streichpreis in
die Seite (`StrikethroughPrice`). Taucht einer neu auf oder wird er tiefer,
ist das ein eigenes Signal: dann spricht der Shop selbst von Aktion.

```
Bambu Lab H2D - H2D / standard             1.549,00 USD statt 1.749,00 USD  -11%
Bambu Lab H2D - H2D Laser Full Combo / 40W 2.699,00 USD statt 3.199,00 USD  -16%
```

Haendler fuehren praktisch nie einen Streichpreis. Dort greifen Signal 1
und 2 — was kein Verlust ist, denn die eigene Vorgeschichte ist der
ehrlichere Vergleich.

**4. Beworbene Kampagne.** Aktionen stehen als Fliesstext im Seitenkopf, oft
samt Gutscheincode. Gemeldet wird eine Aktion einmal; erst wenn sie laenger
als 30 Tage verschwunden war, gilt sie wieder als neu (`kampagneStillTage`).

Dauerwerbung fliegt raus. Der Bambu-Shop bewirbt im Kopf staendig
Verbrauchsmaterial — `Price Drop Alert! Mix 2+ rolls for bulk discounts`,
`25% off Laser Essentials`, `10% of your friend's printer purchase` —, und
keine dieser Zeilen hat mit dem Druckerpreis zu tun. Werbung, die
Verbrauchsmaterial oder Zubehoerpakete nennt und kein Geraet, wird verworfen.
`price drop` steht deshalb auch nicht in der Aktionsliste: eine Preissenkung
erkennen Signal 1 und 2 an den Zahlen, und zwar genauer.

**5. Lieferbarkeit und neue Varianten.** Aus *nicht lieferbar* wird
*lieferbar* — eigene Nachricht. Taucht eine Variante neu auf (etwa ein
spaeteres Pro-Modell), ebenfalls, aber nur wenn der Shop vorher schon Daten
geliefert hat: beim ersten Lauf ist alles neu, und niemand will elf
Nachrichten auf einmal. Unterbietet die neue Variante gleich den Tiefstpreis
ihrer Gruppe, wird daraus Signal 1 — eine Nachricht, nicht zwei.

## Einrichtung

1. Unter *Settings → Secrets and variables → Actions* setzen:

   | Secret | Pflicht | Zweck |
   |---|---|---|
   | `NTFY_TOPIC` | ja | ntfy-Topic, z. B. `h2d-preis-a1b2c3`. Frei waehlbar, aber **nicht erratbar machen** — jeder mit dem Namen liest mit. |
   | `NTFY_TOKEN` | nein | nur fuer geschuetzte ntfy-Topics |
   | `TELEGRAM_TOKEN` | nein | Bot-Token, falls du zusaetzlich Telegram willst |
   | `TELEGRAM_CHAT_ID` | nein | Ziel-Chat |

2. ntfy-App installieren und dasselbe Topic abonnieren.
3. Unter *Actions* den Workflow **H2D-Preisscan** einmal von Hand starten,
   mit `testpush = true`. Dann kommt sofort eine Testmeldung aufs Handy, mit
   dem Stand des letzten echten Laufs im Anhang.

Kein `npm install` noetig — der Watcher benutzt nur Node-Bordmittel.

Zwei Dinge, die GitHub nebenbei bestimmt: Zeitplaene laufen **nur auf dem
Standardbranch** (hier `claude/h2d-bambulab-drucker-setup-ygc3pv`), und in
einem Repo ohne Aktivitaet schaltet GitHub den Zeitplan nach 60 Tagen ab. Der
Scan committet bei jedem Lauf seinen Zustand, also zaehlt das als Aktivitaet.

## Woran du Erfolg erkennst

```bash
node scan.js
```

So sieht ein guter Lauf aus — echte Ausgabe vom 26.09.2026:

```
== Bambu Lab Store (US-Ansicht)
    Sitemap: 3 Modellseite(n) von 1104
    h2d: 2 Variante(n), 4 verworfen
    h2d-pro: 0 Variante(n)
    refurbished-bambu-lab-h2d-3d-printer: 1 Variante(n)
   . Bambu Lab H2D - H2D AMS Combo / Standard  1.749,00 USD  (-13%)  [Tief 1.749,00 USD]
   . Bambu Lab H2D - H2D / standard  1.549,00 USD  (-11%)  [Tief 1.549,00 USD]
   . [Refurbished] Bambu Lab H2D 3D Printer - H2D AMS Combo  1.469,00 USD  (-16%)
== reichelt
    Trefferliste: 2 Geraete
    2 Geraete, 14 verworfen
   . 3D Drucker, Bambu Lab H2D  1.549,00 EUR  [Tief 1.549,00 EUR]
   . 3D Drucker, Bambu Lab H2D AMS Combo  1.749,00 EUR  [Tief 1.749,00 EUR]

Tiefstpreise bisher:
   H2D                                 1.549,00 EUR  reichelt  (2026-09-26)
   H2D                                 1.549,00 USD  Bambu Lab Store (US-Ansicht)
   H2D AMS Combo                       1.749,00 EUR  reichelt  (2026-09-26)
   H2D AMS Combo                       1.749,00 USD  Bambu Lab Store (US-Ansicht)
   H2D AMS Combo (aufgearbeitet)       1.469,00 USD  Bambu Lab Store (US-Ansicht)

Meldungen: 0 | Shops mit Daten: 2
```

Fuenf beobachtete Varianten in fuenf Vergleichsgruppen. `4 verworfen` auf der
Herstellerseite und `14 verworfen` bei reichelt sind die Laserfassungen, das
Pro-Modell und das Zubehoer — der Watcher sagt also mit, was er bewusst
liegen laesst.

Ablesbar ist auch, was der Markt macht: beim Geraet selbst und beim Geraet mit
AMS 2 Pro ist reichelt zahlengleich mit dem US-Shop (1.549 / 1.749), und die
guenstigste Fassung mit AMS ist ein aufgearbeitetes Geraet zu 1.469 USD.

Die Zeichen am Zeilenanfang sind die Kurzfassung:

| Zeichen | Bedeutung |
|---|---|
| `.` | unveraendert |
| `+` | erstmals erfasst |
| `!` | gemeldet, mit Grund dahinter |
| `=` | Senkung erkannt, aber zu diesem Preis schon gemeldet |
| `?` | Hinweis oder Stoerung beim Abruf |
| `-` | Ausbaustufe steht aus, wird uebergangen |

`11 verworfen` bei reichelt sind Lasermodule, Luftreiniger und Zubehoer —
siehe unten.

**Fehlerbild:** `HTTP 403` heisst, der Shop sperrt die Runner-IPs.
`HTTP 0` ist ein Verbindungsabbruch. Liefert ein Shop dreimal in Folge keine
Preise, meldet der Watcher das aktiv aufs Handy — Stille darf nicht mit
"keine Aktion" verwechselt werden.

## Die Shops

Gemessen am 26.09.2026 von einem GitHub-Runner aus, nachpruefbar mit dem
Workflow **Shop-Diagnose** (`diag.js`).

| Shop | Zugriff | Ergebnis | Status |
|---|---|---|---|
| Bambu Lab Store | JSON-LD (`ProductGroup`) je Produktseite, Adressen aus der Produkt-Sitemap | 7 Varianten mit Preis, Streichpreis und Lagerstand, davon 3 beobachtet | laeuft, **US-Preise** |
| reichelt | `itemprop`-Microdata in der Trefferliste | 5 Varianten in EUR mit Lagerstand, davon 2 beobachtet | laeuft |

Der Herstellershop ist eine Next.js-Anwendung: im Markup steht fast nichts
Sichtbares (1,7 MB HTML, 26 000 Zeichen Text), aber jede Produktseite traegt
einen vollstaendigen schema.org-Block. Das ist stabiler als jedes Markup —
Klassennamen aendern sich beim Theme-Wechsel, schema.org bleibt, weil es fuer
Google gepflegt wird.

Welche Produktseiten es gibt, sagt die Sitemap: 1104 Adressen, davon drei
Modellseiten. Zwei, deren Kurzname mit dem Modell **beginnt** (`h2d`,
`h2d-pro`) — das ist die Trennlinie zum Zubehoer, denn
`dual-extruder-unit-h2d-h2c` traegt den Modellnamen hinten und ist ein
Ersatzteil. Und eine ueber die zweite, lockere Regel:
`refurbished-bambu-lab-h2d-3d-printer`. Ein spaeteres H2D-Modell taucht so von allein
auf; geprueft an 18 echten Kurznamen aus der Sitemap.

`h2d-pro` liefert derzeit keine Variante: die Seite antwortet, traegt aber
keinen Preisblock. Den Pro-Preis kennt der Watcher trotzdem — ueber reichelt.

Mitgesucht werden auch **aufgearbeitete Geraete**. Die heissen im Shop
andersherum (`refurbished-h2d-…`), sind aber dasselbe Geraet und meist die
guenstigste Fassung davon. Sie laufen als eigene Vergleichsgruppe, damit ein
aufgearbeitetes Geraet nie den Tiefstpreis der Neuware setzt.

### Warum der Herstellershop US-Preise liefert

`eu.store.bambulab.com` antwortet einem GitHub-Runner nicht. Cloudflare
leitet nach IP-Standort um, gemessen aus einem Runner heraus:

```
HTTP 302
location: https://us.store.bambulab.com/products/h2d
server: cloudflare
cf-ray: a411b50c7d3c7c36-IAD
```

Kein `Set-Cookie`, also auch kein Schalter, den man zuruecksetzen koennte.
Erfolglos versucht: `?region=eu`, `?country=DE`, die Cookies `region`,
`bbl_region`, `store-region`, `bbl-region`, `NEXT_LOCALE`,
`Accept-Language: de-DE` allein, die Sprachpfade `/de/` und `/en/` und der
globale Host `store.bambulab.com`. Alles landet auf `us.store`. Auch die
Sitemap. Es ist **IP-Geolocation, kein Header-Problem** — von einem
deutschen Anschluss aus funktioniert der EU-Shop normal.

Daraus folgen zwei Dinge:

- Der Shop heisst im Watcher **"Bambu Lab Store (US-Ansicht)"**, und jede
  Meldung von ihm traegt den Hinweis mit. So gibt niemand einen USD-Betrag
  fuer einen deutschen Preis aus.
- Als Signal taugt er trotzdem, und zwar als **Fruehwarnung**: Bambu faehrt
  seine Aktionen global, der US-Shop zeigt sie oft zuerst. Die belastbare
  EUR-Zahl fuer Deutschland liefert reichelt.

Die Waehrung steht deshalb im Zustandsschluessel. Sollte ein Runner doch
einmal in Europa stehen, faengt die Grundlage fuer die EUR-Preise neu an,
statt einen Waehrungswechsel als Preissturz von 15 % zu melden.

### Ebenfalls geprueft und verworfen

30 Shops durchgesehen, gemessen am 26.09.2026 von einem Runner aus. Drei
Gruende, warum ein Shop nicht dabei ist:

**Sperrt Cloud-IPs.** Dieselbe Sorte Hindernis wie Louis im
Motorrad-Watcher: IP-Reputation, kein Header- oder Parserproblem.

```
Geizhals            HTTP 403
Conrad              HTTP 403
MediaMarkt          HTTP 403
Alza                HTTP 403
proshop             HTTP 403
cyberport           HTTP 403
antratek            HTTP 403
smdv                HTTP 403 (antwortete anfangs, sperrte dann)
Amazon              HTTP 200, 2 242 B, 0 Zeichen sichtbarer Text - Blockseite
notebooksbilliger   HTTP 200, 2 637 B, 32 Zeichen - Blockseite
```

**Preise erst per JavaScript.** Die Seite kommt an, die Zahlen stehen aber
nicht drin. Ohne Headless-Browser nicht lesbar — und der waere in einem
zweimal taeglichen Lauf ein Klotz am Bein.

```
Idealo              HTTP 200,  2 606 B,    32 Zeichen - JavaScript-Wall
Alternate           HTTP 200, 65 310 B, 5 127 Zeichen, "JavaScript ist nicht aktiviert"
Galaxus             HTTP 200, 72 670 B, 2 058 Zeichen, Preise via GraphQL
Coolblue            HTTP 200               nennt das Geraet, keine Preise im HTML
123-3d.nl           HTTP 200, 83 693 B, 3 043 Zeichen
billiger.de         leitet die Suche auf die Startseite um
```

**Fuehrt das Geraet nicht.** Der haeufigste Fall, und der ueberraschendste:
mehrere 3D-Druck-Haendler verkaufen reichlich Zubehoer **fuer** den H2D, aber
nicht den Drucker.

```
roboter-bausatz     8 Treffer, alle Druckplatten fuer den H2D (ab 26,15 EUR)
iGo3D               1 Treffer, ein PTFE-Schlauch fuer den H2D (3,99 EUR)
3DJake              kein H2D, auch nicht auf der Bambu-Lab-Markenseite
berrybase           nennt den H2D im Text, kein Produkt, kein Link
voelkner            nennt den H2D, kein Produkt
jacob, eckstein     fuehren das Geraet nicht
```

Nicht erreichbar oder Adresse unbekannt: 3dmensionals, kiwi-electronics,
123-3d.de, filamentworld, 3ddruckboutique, technikstore24 (DNS-Fehler oder
404 auf allen probierten Suchadressen).

Die Liste steht in [`diag.js`](diag.js) und laeuft als Workflow
**Shop-Diagnose** jederzeit wieder durch. Nimmt einer dieser Shops das Geraet
ins Sortiment oder lockert seine Sperre, faellt es dort auf: dann genuegt ein
Eintrag in `shops.js` und ein Schalter in `config.js`.

### Eigenheiten

**reichelt vergibt Artikelnummern mehrfach.** In der Trefferliste steht in
jedem Produkt dieselbe `sku`, naemlich die Marke `BAMBU LAB`. Vier von fuenf
Varianten galten damit als Duplikat und fielen still heraus — der erste
echte Lauf hat genau das gezeigt. `produkteAusSeite` prueft Kennungen jetzt
auf Eindeutigkeit und faellt sonst auf Adresse und Namen zurueck.

**Zubehoer traegt denselben Modellnamen.** Duesen, Bauplatten, Lasermodule
und Garantien heissen alle "… H2D …". Aussortiert wird ueber zwei Wege: einen
Namensfilter und die Preisspanne von 800 bis 9 000 EUR. Die Preisspanne ist
der wirksamere der beiden — Duesen kosten zweistellig, Drucker vierstellig.

Der Namensfilter braucht fuer Deutsch eine Extrawurst: `\bmodul\b` greift
nicht in *Lasermodul*, weil davor keine Wortgrenze steht, und
*Garantieverlaengerung* haengt hinten dran. Die Liste in `config.js` fuehrt
Grundwoerter deshalb mit offenem Vorderteil und offenem Hinterteil. Geprueft
an 23 echten Namen aus beiden Shops.

## Schrauben

Alles in [`config.js`](config.js).

| Zuviel Meldungen? | Zuwenig? |
|---|---|
| eine Ausbaustufe in `klassenAktiv` auf `false` | auf `true` |
| `preisSprungProzent` hoch | runter |
| `tiefstpreisMelden` auf `false` | auf `true` lassen |
| `bestpreisMelden` auf `false` | auf `true` lassen |
| `rabattMinProzent` hoch | runter |
| `kampagneMinProzent` hoch | runter |
| `verfuegbarkeitMelden` auf `false` | auf `true` lassen |

Ein anderes Geraet beobachten? `modellRe`, `modellSlugRe`, `varianten`,
`klassenAktiv`, `proRe` und die Preisspanne umstellen — der Rest ist
geraeteunabhaengig.

## Dateien

| Datei | Zweck |
|---|---|
| `scan.js` | Hauptlauf: erheben, bewerten, Meldungen schreiben |
| `shops.js` | Ein Adapter je Zugriffsart plus die Bannersuche |
| `lib.js` | HTTP mit Browser-Kopfzeilen, JSON-LD, Microdata, Preis- und Waehrungshelfer |
| `notify.js` | Push ueber ntfy und Telegram |
| `testpush.js` | Testmeldung, ohne auf eine echte Senkung zu warten |
| `config.js` | Schwellen, Modell- und Stufenfilter, Shop-Schalter |
| `diag.js` | prueft, welche Shops dieses Netz durchlaesst |
| `data/state.json` | Vorgeschichte je Variante, Tiefstpreise je Gruppe, Kampagnen |
| `data/meldungen.json` | Ergebnis des letzten Laufs samt Tiefstpreis-Register |

`data/state.json` ist die Grundlage — **nicht loeschen**, sonst faengt die
Bewertung bei null an: jede Variante gilt wieder als Erstsichtung, und alle
Tiefstpreise sind vergessen. Der Watcher schweigt dann, bis die Preise
erneut unter die neu aufgebaute Bestmarke fallen.

## Grenzen

- **Die US-Preise sind kein deutscher Preis.** Sie zeigen, *dass* eine Aktion
  laeuft, nicht *was* du zahlst. Dafuer ist reichelt da.
- **Ein Haendler ist ein Haendler, kein Markt.** Der Watcher sieht zwei
  Quellen, nicht den guenstigsten Anbieter Deutschlands. Die Preisvergleicher,
  die das koennten, sperren die Runner aus.
- **Streichpreise sind die Angabe des Shops.** Was der Vergleichspreis wert
  ist, entscheidet der Shop, nicht der Watcher.
- **"Lieferbar" ist die Angabe der Seite**, kein Blick ins Lager.
- Die Bannersuche erkennt Aktionen an Schluesselwoertern. Erfindet ein Shop
  einen Aktionsnamen, der nicht in `AKTION_RE` steht, faengt ihn nur noch
  Signal 1 — und das braucht eine spuerbare Senkung.
