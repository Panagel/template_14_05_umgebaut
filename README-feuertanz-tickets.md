# Feuertanz-Ticketwache

Meldet, **sobald es Karten fuer das Feuertanz Festival auf Burg Abenberg
gibt** — und vorher, wann das Festival stattfindet und wann der Vorverkauf
startet. Laeuft seit dem 20.10.2026. Kein Newsletter-Ersatz: die Wache schaut zweimal pro Stunde auf die
Seite des Veranstalters und auf die Ticketportale und schickt genau dann eine
Nachricht, wenn sich etwas geaendert hat, das mit Kartenkauf zu tun hat.

Laeuft in GitHub Actions. Der PC bleibt aus.

Gleiche Bauart wie der H2D-Preiswatcher im selben Repo: Node ohne
Abhaengigkeiten, Zustand im Repo, Push ueber ntfy (und Telegram, wenn
gewuenscht). Alle Wachen im Repo benutzen dasselbe `notify.js` und damit
dieselben Secrets — ist der Preiswatcher eingerichtet, ist die Ticketwache
es auch.

> **Es heisst Burg Abenberg, nicht Schloss Abendberg.** Eine Burg im
> mittelfraenkischen Abenberg bei Nuernberg, kein Schloss und kein
> Abendberg — deshalb sucht die Wache nach `abenberg`.

## Der Stand

Recherchiert am 20.10.2026 ueber die Websuche. Die Seiten selbst sind aus
der Entwicklungsumgebung nicht abrufbar (die Netzfreigabe erlaubt
`www.feuertanz-festival.com`, `www.concertbuero-franken.de`,
`www.eventim.de` und `www.reservix.de` nicht) — auf einem GitHub-Runner gilt
diese Sperre nicht.

| Ausgabe | Termin | Karten |
|---|---|---|
| 2025 | 13./14. Juni 2025 | vorbei |
| 2026 | 12./13. Juni 2026 | vorbei, war ausverkauft |
| **2027** | **11.+12. Juni 2027** | **Vorverkauf laeuft** seit etwa dem 05.10.2026, 122,00 EUR inkl. Gebuehren, Abendkasse noch offen |

Gekauft wird im Shop des Concertbuero Franken, telefonisch oder an den
CTS-Eventim-Vorverkaufsstellen. Bemerkenswert und lehrreich: die
Kuenstlerseite bei Eventim meldete am 20.10.2026 noch *"aktuell scheinen
keine Termine im Vorverkauf zu sein"*, waehrend der Veranstalter laengst
verkaufte. Genau deshalb ist dessen Seite die Leitquelle und ein Portal
darf schweigen.

**Dieser Vorverkaufsstart ist der Wache durchgegangen** — nicht weil sie ihn
nicht erkannt haette, sondern weil sie nie gelaufen ist: der Zeitplan greift
nur auf dem Standardbranch, und der zeigte weiter auf den Preiswatcher
(siehe *Einrichtung*, Punkt 1). Am nachgebauten Stand vom 20.10.2026
geprueft, meldet sie Termin und Karten mit dem richtigen Kauflink.

Was fuer die Wache ab jetzt zu tun bleibt: melden, wenn 2027 **ausverkauft**
ist, wenn sich der Termin aendert, wenn die Ticketseite etwas Neues sagt —
und dann wieder der ganze Ablauf fuer die Ausgabe 2028.

## Fuenf Signale

**1. Es gibt Karten.** Die Nachricht, auf die es ankommt. Sie geht mit
ntfy-Prioritaet `urgent` raus, kommt also auch durch eine stille Stunde, und
traegt die Kauflinks mit.

```
Feuertanz Festival 2027: es gibt Karten (25.06.2027 - 26.06.2027)
  - Ein Shop fuehrt Karten als verfuegbar:
  -   Eventim: 92,00 EUR [InStock]
  - Termin: 25.06.2027 - 26.06.2027, Burg Abenberg.

  Kaufen:
    https://www.eventim.de/event/feuertanz-festival-2027-4711/
    https://www.feuertanz-festival.com/tickets.html
```

Zwei Arten von Befund loesen sie aus. Der **harte**: ein Shop weist in seinem
schema.org-Datenblock ein Angebot als verfuegbar aus (`InStock`) — mit Preis,
zu einem Termin, der noch kommt. Der **weiche**: die Seite sagt es in Worten
("Der Vorverkauf hat begonnen", "Tickets sind ab sofort erhaeltlich"). Der
weiche Befund kommt oft Stunden vor dem harten, weil der Veranstalter seine
Seite aendert, bevor die Portale nachziehen — deshalb zaehlt er mit, und
deshalb steht in der Nachricht dabei, woher sie kommt.

Dieselbe Kaufgelegenheit meldet **einmal**. Erneut erst, wenn sie
zwischendurch weg war — etwa nach *ausverkauft* und zurueck.

**2. Termin steht.** Sobald eine Jahresausgabe erstmals ein Datum hat oder
sich ein bekanntes Datum aendert:

```
Feuertanz Festival 2027: Termin steht - 25.06.2027 - 26.06.2027
  - Termin 25.06.2027 - 26.06.2027 auf Burg Abenberg.
  - Quelle: feuertanz-festival.com (Seitentext)
  - Gelesen: "Das Feuertanz Festival 2027 findet am 25. und 26. Juni 2027 ..."
```

Der zitierte Satz steht mit in der Nachricht, weil ein Datum ohne
Zusammenhang wenig wert ist: auf einer Festivalseite stehen auch
Einlasszeiten, Marktzeiten und Vorjahrestermine. Findet die Wache mehrere
Datumsangaben, nennt sie die anderen als "auch gelesen" und waehlt die
glaubwuerdigste — der Datenblock schlaegt den Text, die Seite des
Veranstalters schlaegt den Shop, und ein Satz mit "findet statt" schlaegt eine
Zahl, die bloss herumsteht. Liegt der Termin in einem anderen Monat als Juni,
sagt die Nachricht das ausdruecklich.

**3. Vorverkauf startet am …** Die Nachricht, mit der man sich den Wecker
stellt. Sie unterscheidet sich von Signal 1 an einer einzigen Stelle: das
genannte Datum liegt noch vor uns.

```
Feuertanz Festival 2027: Vorverkauf startet 01.12.2026
  - In 66 Tag(en) gibt es Karten - 01.12.2026.
  - Gelesen bei feuertanz-festival.com: "Der Vorverkauf startet am 01.12.2026 um 10:00 Uhr."
```

Dass "Vorverkauf startet am 1.12." etwas anderes heisst als "Vorverkauf ist
gestartet", ist am Verb nicht zu erkennen — *startet* steckt in beidem. Die
Wache entscheidet am Datum: steht eines dabei, das noch kommt, ist es eine
Ankuendigung; sonst ist es ein Kaufhinweis. Ist der angekuendigte Tag
erreicht, gilt derselbe Satz als Kaufhinweis, auch wenn die Seite ihn nicht
umschreibt (sieben Tage lang, `vvkFrischTage`).

**4. Ausverkauft.** Damit klar ist, dass das Fenster zu ist — und weil ein
`ausverkauft` im Nachbarsatz einen Kaufhinweis aufheben muss. Ein Shop, der
danach wieder Karten fuehrt (Rueckgaben), schlaegt diesen Textbefund: dann
kommt Signal 1 erneut.

**5. Ticketseite umformuliert.** Aendert sich auf der Seite des
Veranstalters ein Satz zum Thema Karten, ohne dass die Wache daraus schon
eine Kaufgelegenheit lesen kann, meldet sie das mit dem neuen Satz im
Klartext. Das ist das Sicherheitsnetz fuer eine Formulierung, die in keinem
Muster steht:

```
feuertanz-festival.com: Ticketseite umformuliert
  + "Die Kartenkontingente werden neu geordnet, Details folgen."
```

Dazu kommt eine **Ausfallmeldung**: laesst sich die Seite des Veranstalters
beim 3. und beim 12. Lauf in Folge nicht lesen, sagt die Wache das aktiv.
Stille darf nicht mit "kein Vorverkauf" verwechselt werden. Nicht lesbar
heisst: keine Antwort, oder eine Antwort mit weniger als 300 Zeichen
sichtbarem Text (`minZeichen`) — das ist eine Blockseite oder eine Seite, die
ihre Inhalte erst per JavaScript holt. Eine Ticketseite, auf der schlicht
noch nichts steht, ist dagegen **kein** Ausfall, sondern der Normalfall.
Ticketportale duerfen ganz schweigen, ohne dass das Handy klingelt
(`darfSchweigen`) — die sperren Cloud-IPs regelmaessig.

## Einrichtung

**1. Der Zeitplan laeuft nur auf dem Standardbranch.** Das ist GitHubs Regel,
nicht die der Wache, und der einzige Handgriff, der wirklich noetig ist —
solange er fehlt, faengt die Ticketwache nicht von allein an zu laufen.
Standardbranch dieses Repos ist `claude/h2d-bambulab-drucker-setup-ygc3pv`.

**Der Weg ist ein Merge, kein Branch-Wechsel.** Auf dem Standardbranch ist
seit Ende September der H2D-Gebrauchtmarkt-Watcher dazugekommen
(`gebraucht/`, Workflow *H2D-Gebrauchtmarkt*) — den gibt es auf dem
Ticketbranch nicht. Wer den Standardbranch bloss umstellt, nimmt also den
Gebrauchtmarkt-Watcher aus dem Zeitplan. Der Ticketbranch ist ein einzelner
Commit, der fast nur Dateien hinzufuegt, und laesst sich konfliktfrei in den
Standardbranch mergen (geprueft am 20.10.2026). Danach laufen **alle drei
Wachen** nebeneinander, jede mit eigenem Zeitplan, eigenen Dateien und
eigenem Datenverzeichnis: `data/`, `gebraucht/data/`, `data-feuertanz/`.

**2. Secrets** (*Settings → Secrets and variables → Actions*) — dieselben wie
beim Preiswatcher, nichts Neues, wenn der schon laeuft:

Eines der beiden Paare genuegt. In diesem Repo ist am 20.10.2026 **Telegram
gesetzt und ntfy leer** - die Meldungen des ersten Laufs gingen per Telegram
raus (HTTP 200). Wer sie zusaetzlich aufs ntfy-Handy will, setzt
`NTFY_TOPIC`; wer nur ntfy will, kann Telegram leer lassen.

| Secret | Zweck |
|---|---|
| `NTFY_TOPIC` | ntfy-Topic, frei waehlbar, aber **nicht erratbar machen** — jeder mit dem Namen liest mit |
| `NTFY_TOKEN` | nur fuer geschuetzte ntfy-Topics |
| `TELEGRAM_TOKEN` | Bot-Token |
| `TELEGRAM_CHAT_ID` | Ziel-Chat |

**3. Probelauf.** Unter *Actions* den Workflow **Feuertanz-Ticketwache**
einmal von Hand starten, mit `testpush = true`. Dann kommt sofort eine
Testmeldung aufs Handy, mit dem Stand des letzten echten Laufs im Anhang.

**4. Einmal die Diagnose laufen lassen.** Workflow
**Feuertanz-Quellendiagnose**. Er zeigt fuer jede Adresse, ob sie von einem
Runner aus antwortet, was sie hergibt und in welchen Worten sie ihre Karten
ankuendigt — samt einer Liste `[offen ]` mit Ticketsaetzen, die die Wache
noch nicht deutet. Das ist der Schritt, der die Vermutungen in dieser
Einrichtung durch Messwerte ersetzt (siehe *Was noch ungeprueft ist*).

Kein `npm install` noetig — nur Node-Bordmittel.

## Woran du Erfolg erkennst

```bash
node ticket-scan.js
```

Ein Lauf sagt je Quelle, was er gelesen hat, und am Ende, was er weiss:

```
== feuertanz-festival.com
    200  108 Zeichen  https://www.feuertanz-festival.com/
    200  99 Zeichen  https://www.feuertanz-festival.com/tickets.html
    1 Termin(e), 0 Angebot(e), 1 Kaufhinweis(e), 0 x ausverkauft, 0 VVK-Ankuendigung(en)
== Eventim
    1 Termin(e), 1 Angebot(e), 0 Kaufhinweis(e), 0 x ausverkauft, 0 VVK-Ankuendigung(en)
   ! Termin 2027: 25.06.2027 - 26.06.2027 (feuertanz-festival.com, text)
   !! KARTEN 2027: 1 Angebot(e) verfuegbar

Stand:
   2027  25.06.2027 - 26.06.2027   Karten: zu haben

Meldungen: 2 | Quellen mit Daten: 2
```

Und ohne Netz, in Sekunden, die Bewertung selbst:

```bash
node ticket-selbsttest.js     # 68 Pruefungen, 14 Buehnen
```

Der Selbsttest legt Seiten auf die Platte und laesst die Wache darauf laufen:
vergangene Ausgabe, Termin wird bekannt, Vorverkauf angekuendigt, Karten laut
Text, Karten laut Datenblock, ausverkauft schlaegt den Wortlaut, Rueckkehr in
den Verkauf, umformulierte Seite, die Tabellen fuer Datumsschreibweisen und
Wortlaute, Ruhe ohne Commit, der Fall "Karten zuerst, Termin spaeter" — der
darf nur einmal klingeln — und die Preiszeile, die nur mit einem kuenftigen
Termin auf derselben Seite zaehlt. Er laeuft in jedem Wachlauf mit — nach dem Melden, damit ein
Fehler in der Bewertung eine echte Nachricht nicht aufhaelt, aber den Lauf
trotzdem rot macht.

Was aufs Handy gehen wuerde, ohne zu senden:

```bash
node notify.js data-feuertanz/meldungen.json --trocken
```

## Die Quellen

| Quelle | Zugriff | Rolle |
|---|---|---|
| `feuertanz-festival.com` | Startseite, `tickets.html`, `programm.html`, `festival.html` | **Leitquelle.** Was hier steht, gilt: nur sie darf "ausverkauft" setzen, nur ihre Saetze werden auf Aenderung beobachtet |
| Concertbuero Franken | Startseite plus die Detailseiten, deren Adresse den Festivalnamen traegt | Veranstalter. Fuehrt den Termin oft zuerst |
| Eventim | Kuenstlerseite, schema.org | Portal. Liefert Preis und Verfuegbarkeit als Datenblock — der harte Befund |
| Reservix | Veranstaltungsort Burg Abenberg | Portal. Zweiter Weg zum harten Befund |

Drei Lesewege, keiner Pflicht: **schema.org-Datenblock** (Datum, Preis,
Verfuegbarkeit als Felder — Portale pflegen das fuer Google, deshalb ist es
stabiler als jedes Markup), **Datumsangaben im Seitentext**, **Wortlaute im
Seitentext**. Was eine Quelle nicht hergibt, fehlt eben; die anderen laufen
weiter.

### Was noch ungeprueft ist

Die Seiten selbst sind aus dieser Entwicklungsumgebung nicht abrufbar (HTTP
403 vom Egress-Proxy, nicht von den Seiten). Geprueft ist deshalb:

- die **Bewertung** vollstaendig, gegen Seiten auf der Platte (68 Pruefungen),
- die **Datumserkennung** gegen deutsche Schreibweisen (`11.+12. Juni 2027`,
  `11.06.2027 - 12.06.2027`, `12. und 13. Juni 2027`, `25.-26.06.2027`,
  `30. Mai bis 1. Juni 2027`, ISO, dazu die Abweisung von `31.02.2027`),
- die **Wortlaute** gegen 15 Formulierungen.

Drei dieser Zeilen stammen woertlich von den echten Seiten (ueber die
Websuche gelesen, 20.10.2026) und haben den Code veraendert — sie fielen
zuerst durch:

| Zeile | was fehlte |
|---|---|
| `Vorverkauf: 122,00 €   Abendkasse: tba €` | Das ist kein Satz, sondern eine Tabellenzeile. Dafuer gibt es jetzt `preisHinweisRe` — und weil dieselbe Zeile auf der Archivseite der Ausgabe 2025 steht, zaehlt sie nur, wenn die Seite auch einen Termin nennt, der noch kommt |
| `Tickets sind bundesweit an allen CTS Eventim Vorverkaufsstellen erhaeltlich.` | 56 Zeichen zwischen "Tickets" und "erhaeltlich" — das Fenster in `kaufbarRe` war 30 Zeichen breit, jetzt 80 |
| `11.+12. Juni 2027` | Das Plus war kein Trenner fuer Zeitspannen. Ohne es wurde daraus der 12. allein, und der erste Festivaltag fehlte in jeder Meldung |

Ungeprueft bleibt, ob die vier Unterseiten der Veranstalterseite so heissen
und ob die Portale von einem Runner aus antworten. Genau dafuer ist die
**Quellendiagnose** da: einmal starten, Ausgabe ansehen. Falsche Adresse →
Zeile in `ticket-config.js` unter `quellen` richtigstellen. Portal antwortet
mit 403 → `quellenAktiv` auf `false`, die Leitquelle traegt die Wache auch
allein. Unbekannte Formulierung → sie steht in der Diagnose unter `[offen ]`
und gehoert in `kaufbarRe`, `vvkLaeuftRe` oder `vvkStartRe`.

## Schrauben

Alles in [`ticket-config.js`](ticket-config.js).

| Zuviel Meldungen? | Zuwenig? |
|---|---|
| `textBefundGenuegt` auf `false` — dann melden nur Shops mit ausgewiesener Verfuegbarkeit | auf `true` lassen |
| `aenderungMelden` auf `false` — die Seite darf sich dann still aendern | auf `true` lassen |
| `terminMelden` / `ausverkauftMelden` auf `false` | auf `true` lassen |
| eine Quelle in `quellenAktiv` auf `false` | auf `true` |
| in `notify.js` `kaufbar` von `urgent` auf `high` | `urgent` bleibt `urgent` |

Takt: `cron` in
[`.github/workflows/feuertanz-tickets.yml`](.github/workflows/feuertanz-tickets.yml).
Voreinstellung `7,37 * * * *` (zweimal pro Stunde, absichtlich nicht zur
Minute 0 — da sind GitHubs Zeitplaene verstopft). Steht ein Vorverkaufsstart
auf die Minute fest, lohnt `*/10 * * * *` fuer die Tage davor; ist lange
Ruhe, genuegt `7 */6 * * *`.

Ein anderes Festival beobachten? `festival`, `festivalRe`, `ortRe`,
`monateUeblich` und `quellen` umstellen — der Rest ist festivalunabhaengig.

## Dateien

| Datei | Zweck |
|---|---|
| `ticket-scan.js` | Hauptlauf: erheben, bewerten, Meldungen schreiben |
| `ticket-quellen.js` | Abruf, Datumserkennung, schema.org, Satz-Auswertung |
| `ticket-config.js` | Adressen, Wortlaute, Schalter |
| `ticket-diag.js` | prueft, welche Quelle dieses Netz durchlaesst und was sie sagt |
| `ticket-testpush.js` | Testmeldung, ohne auf einen Vorverkauf zu warten |
| `ticket-selbsttest.js` | 40 Pruefungen der Bewertung, ohne Netz |
| `notify.js` | Push ueber ntfy und Telegram (mit dem Preiswatcher geteilt) |
| `lib.js` | HTTP mit Browser-Kopfzeilen, JSON-LD, Textwerkzeug (geteilt) |
| `data-feuertanz/state.json` | was die Wache weiss: Termine, Kaufstand, gemeldete Ankuendigungen |
| `data-feuertanz/meldungen.json` | Ergebnis des letzten Laufs, Eingabe fuer `notify.js` |

`data-feuertanz/state.json` ist die Grundlage — **nicht loeschen**. Sonst
gilt jeder Befund wieder als neu: der naechste Lauf meldet den Termin und
einen laufenden Vorverkauf erneut.

Der Zustand wird nur geschrieben, wenn sich etwas geaendert hat — plus einmal
am Tag als Lebenszeichen. Zweimal pro Stunde ein Commit waere sonst ein
Dutzend am Tag; und ganz ohne Commit schaltet GitHub den Zeitplan nach 60
Tagen ohne Aktivitaet ab, was bei einer Wache, die Monate wartet, genau der
falsche Moment waere.

## Grenzen

- **Ein Wortlaut ist kein Vertrag.** Der weiche Befund liest Saetze. Schreibt
  der Veranstalter etwas, das wie ein Verkaufsstart klingt, ohne einer zu
  sein, meldet die Wache es — sie sagt in der Nachricht dazu, dass es aus dem
  Seitentext kommt. Wer das nicht will: `textBefundGenuegt` auf `false`.
- **Portale sperren Cloud-IPs.** Eventim und Reservix koennen einem
  GitHub-Runner dauerhaft 403 antworten. Dann traegt die Leitquelle die
  Wache — der harte Befund mit Preis faellt weg.
- **Ein Datum auf einer Seite ist nicht zwingend der Festivaltermin.** Die
  Wache gewichtet und zitiert den Zusammenhang, damit du es selbst beurteilen
  kannst. Angekuendigte Vorverkaufstermine nimmt sie ausdruecklich aus.
- **"Ausverkauft" ist die Angabe der Seite**, kein Blick in die Kasse.
- **Zweimal pro Stunde ist zweimal pro Stunde.** Ein Vorverkauf, der in
  zehn Minuten weg ist, kann durchrutschen. Dagegen hilft nur ein engerer
  Takt — und der Wecker aus Signal 3.
- Die Wache kauft nicht. Sie sagt, dass es etwas zu kaufen gibt.
