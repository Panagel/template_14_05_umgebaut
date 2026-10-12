# H2D-Gebrauchtmarkt

Derselbe Suchlauf wie beim F900R-Monitor, nur für den Drucker: einmal täglich
alle gebrauchten **Bambu Lab H2D** auf kleinanzeigen.de erfassen, den Zustand
fortschreiben, und montags einen Bericht samt Push schicken. Schwerpunkt ist
das Gerät **mit AMS 2 Pro (Combo)**.

Der Unterschied zum Motorrad: dort trägt der Kilometerstand den Preis, hier
sind es die **Druckstunden**. Die stehen in keinem Formularfeld, sondern im
Anzeigentext — „Der Drucker hat aktuell 418 Stunden auf der Uhr", „4530h",
„ca. 300 Druckstunden". Der Lauf liest sie heraus und rechnet damit.

## Was der Lauf macht

1. **Suchen.** Sechs Sucheinstiege (`h2d`, `bambu-lab-h2d`, `h2d-ams`, …),
   alle Rubriken, ab 500 EUR. Unter „h2d" liefert Kleinanzeigen vor allem
   Zubehör, dazu Transporter („L2H2 D140") und Turbolader; übrig bleiben die
   Anzeigen, deren Titel nach H2D-Drucker klingt.
2. **Lesen.** Je Anzeige die Detailseite: Preis, VB, Ort, Privat/Händler,
   Einstelldatum, Zustand — und aus dem Text die Druckstunden, das Alter
   („9 Monate alt", „im Januar 2026 gekauft"), die Fassung und die Beigaben
   (Rechnung, Ersatzdüsen, Druckplatten, Filter …).
3. **Einordnen.** Jede Anzeige bekommt eine Fassung:

   | Fassung | heißt |
   |---|---|
   | `combo` | H2D mit genau einem AMS 2 Pro, ohne Laser — **das gesuchte Gerät** |
   | `combo-plus` | mehrere AMS („+ 4x AMS", „Dual AMS") |
   | `laser` | Laser Full Combo oder Laser nachgerüstet |
   | `basis` | ohne AMS |
   | `pro` | H2D Pro — anderes Gerät, nur gelistet |

   Dazu die Merker *neu* (Händler-Neuware, „originalverpackt, ungeöffnet"),
   *defekt* und *Sammelanzeige* („2X H2D, Preis gilt pro Drucker").
4. **Fortschreiben.** Wie beim F900R: eine Anzeige gilt erst als verschwunden,
   wenn sie zwei Läufe in Folge fehlt — nach einer Preisänderung ist sie kurz
   nicht abrufbar. Daraus ergibt sich die Standzeit.

## Die Kalkulation mit Druckstunden

Über alle je erfassten gebrauchten Geräte mit Stundenangabe (auch die schon
verkauften — so wächst die Datenbasis jede Woche) wird eine Gerade gelegt:

```
Preis ≈ Grundwert − Stundensatz × Druckstunden
```

- **Stundensatz** — was jede Druckstunde an Wiederverkaufswert kostet. Der
  Bericht nennt ihn je Stunde und je 100 Stunden.
- **Grundwert** — ein gebrauchtes Gerät mit 0 Stunden. Der Abstand zum
  Neupreis ist der Abschlag fürs Gebrauchtsein schlechthin.
- **Neupreis** — kommt aus dem H2D-Preis-Watcher im selben Repo: der
  günstigste aktuelle EUR-Preis einer neuen Combo (derzeit reichelt,
  1.749 EUR). Fällt der aus, gilt der Listenpreis.

**Zwei Stufen.** Sobald fünf Combos mit Stunden (über mindestens 300 h
verteilt) zusammengekommen sind, rechnet die Gerade nur mit Combos, in Euro.
Bis dahin — der Markt ist klein — zählt der **Restwert** aller gebrauchten H2D
mit Stundenangabe: Combo, ohne AMS, Laser 10 W, Laser 40 W, jeweils in Prozent
vom Neupreis der eigenen Fassung. Das Ergebnis wird auf die Combo
umgerechnet. Ein Laser-Gerät mit 2.200 h sagt genauso etwas darüber, was
Stunden kosten, wie eine Combo. Fassungen ohne eindeutiges Gegenstück im
Laden (mehrere AMS, Laser ohne Wattangabe) bleiben draußen. Der Bericht
listet die Messpunkte, auf denen die Rechnung steht.

Geschätzt wird mit **Theil-Sen** (Median aller paarweisen Steigungen), nicht
mit kleinsten Quadraten: der Markt ist klein, und eine einzelne Anzeige mit
4.530 Stunden würde eine gewöhnliche Regressionsgerade allein kippen.

Daraus folgt je Anzeige:

| Spalte | Bedeutung |
|---|---|
| Restwert | Preis in % vom aktuellen Neupreis |
| Schätzung | erwarteter Preis bei diesen Stunden |
| Abw. / Urteil | Preis gegen Schätzung — *günstig* ab −7 %, *teuer* ab +7 % |
| Preis ≙ | ohne Stundenangabe: zu welchem Stundenstand der Preis passen würde |

Und eine Tabelle „erwarteter Preis bei 0 / 250 / 500 / 1.000 … Stunden" —
nur so weit, wie Messpunkte reichen.

Solange es auch so weniger als drei Geräte mit Stunden gibt (oder die
Spanne unter 150 h liegt), rechnet der Bericht ersatzweise je Anzeige gegen den Neupreis:
(Neupreis − Preis) / Stunden. Das überschätzt den Stundensatz, weil der
Gebrauchtabschlag mitzählt, und steht deshalb ausdrücklich als Notbehelf da.

### Welche Stunden zählen

Eine Zahl mit „h", „Std." oder „Stunden" zählt, wenn

- die Einheit selbst Laufzeit sagt (*Druckstunden*, *Betriebsstunden*), oder
- in der Nähe ein Laufzeitwort steht (*gelaufen*, *gedruckt*, *auf der Uhr*,
  *Druckzeit*, *insgesamt*, *ca.*, *unter* …), oder
- die Zahl mindestens 100 ist und nichts nach Frist klingt.

Nicht gezählt werden Fristen und Druckdauern: „Versand innerhalb 24h",
„antworte innerhalb von 2 Stunden", „ein Druck dauert ca. 14h". „Unter 100h"
wird als Obergrenze markiert (`< 100 h`), „ca. 300" als ungefähr (`~300 h`).
Ausdrücklich unbenutzte Geräte zählen als 0 Stunden und laufen als Neuware.

Bei einer Sammelanzeige („4530h 2439h", zwei Drucker zu je 1.400 EUR) ist
offen, welche Stunden zu welchem Preis gehören: sie bleibt aus der Gerade
heraus und bekommt kein Urteil.

## Sofortmeldung

Taucht eine gebrauchte Combo auf, die günstig ist, kommt sofort eine Meldung
aufs Handy — nicht erst mit dem Wochenbericht:

- **mit Stundenangabe und Stundenmodell:** mindestens 7 % unter dem
  Schätzpreis für diese Stunden
- **ohne Stunden oder solange es kein Modell gibt:** höchstens 80 % vom
  Neupreis (derzeit also bis 1.399 EUR)

```
Guenstige H2D Combo: 1.250 EUR, 600 h
  - 10 % unter dem Schaetzpreis fuer 600 h (1.389 EUR)
  - Wertverlust je 100 h laut Kalkulation: 6 EUR
```

Jede Anzeige meldet einmal; erneut erst, wenn ihr Preis unter den zuletzt
gemeldeten fällt. Sammelanzeigen mehrerer Drucker melden nicht, und beim
allerersten Lauf schweigt die Meldung — da ist der ganze Markt neu. Die
Schwellen stehen oben in `scan.js` (`ALARM_ABWEICHUNG`, `ALARM_RESTWERT_MAX`).

## Bericht und Push

Montags (oder von Hand mit `bericht = true`) entsteht
`gebraucht/berichte/bericht-JJJJ-MM-TT.md`:

- Kurzfassung: Bestand, Medianpreis, Restwert, Stundensatz, bestes Angebot
- Kalkulation mit Druckstunden und Preisprognose
- alle aktiven gebrauchten Combos mit Schätzung und Urteil
- Preis nach Stundenklassen
- andere Fassungen (Laser, mehrere AMS, neu, defekt) zum Vergleich
- Standzeiten, auch getrennt nach unter/über 500 Stunden
- Preisbewegungen, Neuzugänge, Scan-Historie

Die Kurzfassung geht per ntfy und Telegram raus — dieselben Secrets wie beim
Preis-Watcher (`NTFY_TOPIC`, `NTFY_TOKEN`, `TELEGRAM_TOKEN`,
`TELEGRAM_CHAT_ID`), nichts Neues einzurichten. Telegram bekommt den ganzen
Bericht als Datei dazu.

## Lokal ausführen

```bash
node gebraucht/scan.js         # Scan, ca. 1 Minute
node gebraucht/kalkulation.js  # Kalkulation auf der Konsole
node gebraucht/report.js       # Bericht erzeugen
```

Läuft als Workflow **H2D-Gebrauchtmarkt** täglich um 06:10 UTC — wie jeder
Zeitplan nur vom Standardbranch aus.

## Dateien

| Datei | Zweck |
|---|---|
| `lib.js` | HTTP, Listen- und Detailseiten, Fassung, Beigaben, Alter |
| `stunden.js` | Druckstunden aus dem Anzeigentext |
| `scan.js` | täglicher Lauf, schreibt `data/state.json` fort |
| `kalkulation.js` | Stundenmodell, Schätzwerte, Neupreis-Referenz |
| `report.js` | Wochenbericht nach `berichte/` |
| `notify.js` | Kurzfassung per ntfy und Telegram |
| `alarm.js` | Sofortmeldung günstiger Combos aus `data/meldungen.json` |

## Fallstricke

- **Die Stunden sind die Angabe des Verkäufers**, nicht der Zähler im Gerät.
  Wer viel gedruckt hat, schreibt es seltener hin — Anzeigen ohne Stunden
  dürften im Schnitt mehr gelaufen sein.
- **Kleiner Markt.** Ein Dutzend Anzeigen, nicht Hunderte wie beim Motorrad.
  Die Gerade wird mit jeder Woche besser; in den ersten Wochen ist sie eine
  Richtung, keine Zahl auf den Euro.
- **„Verschwunden" heißt verkauft oder zurückgezogen.** Die Standzeit ist eine
  Obergrenze für die Verkaufsdauer; das „Hochladen" einer Anzeige setzt das
  Einstelldatum zurück und wirkt dagegen.
- **Privatpreise sind oft VB.** Der erzielte Preis liegt darunter.
- **Fassung aus dem Text.** Steht das AMS nur in der Beschreibung und dort
  undeutlich, landet ein Combo-Gerät als `basis` in der Liste.
