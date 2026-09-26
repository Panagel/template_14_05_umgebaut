# Feuertanz-Ticketwache

Meldet, **sobald es Karten fuer das Feuertanz Festival auf Burg Abenberg
gibt** — und vorher, wann das Festival stattfindet und wann der Vorverkauf
startet. Kein Newsletter-Ersatz: die Wache schaut zweimal pro Stunde auf die
Seite des Veranstalters und auf die Ticketportale und schickt genau dann eine
Nachricht, wenn sich etwas geaendert hat, das mit Kartenkauf zu tun hat.

Laeuft in GitHub Actions. Der PC bleibt aus.

Gleiche Bauart wie der H2D-Preiswatcher im selben Repo: Node ohne
Abhaengigkeiten, Zustand im Repo, Push ueber ntfy (und Telegram, wenn
gewuenscht). Beide Wachen benutzen dasselbe `notify.js` und damit dieselben
Secrets — ist der Preiswatcher eingerichtet, ist die Ticketwache es auch.

> **Es heisst Burg Abenberg, nicht Schloss Abendberg.** Eine Burg im
> mittelfraenkischen Abenberg bei Nuernberg, kein Schloss und kein
> Abendberg — deshalb sucht die Wache nach `abenberg`.

## Der Stand, von dem aus die Wache startet

Recherchiert am 26.09.2026. Die Seite des Veranstalters selbst war aus der
Entwicklungsumgebung nicht abrufbar (die Netzfreigabe dieser Umgebung
erlaubt `www.feuertanz-festival.com` nicht), die Angaben stammen deshalb aus
der Websuche. Auf einem GitHub-Runner gilt diese Sperre nicht.

| Ausgabe | Termin | Karten |
|---|---|---|
| 2025 | 13./14. Juni 2025 | vorbei |
| 2026 | 12./13. Juni 2026 | vorbei, war **ausverkauft** |
| **2027** | **noch nicht offiziell bestaetigt** — ein Fremdkalender fuehrt Fr./Sa., 25./26. Juni 2027 | **noch kein Vorverkauf** |

Das ist genau die Lage, fuer die diese Wache gebaut ist: der Termin steht
noch nicht fest, der Vorverkauf hat nicht begonnen, und wenn er beginnt, ist
das Festival erfahrungsgemaess schnell weg. Bis dahin bleibt die Wache
still — Stille ist hier das erwartete Ergebnis, nicht ein Zeichen, dass
nichts laeuft.

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
nicht die der Wache, und hier der einzige Handgriff, der wirklich noetig ist:
Standardbranch dieses Repos ist derzeit `claude/h2d-bambulab-drucker-setup-ygc3pv`.
Solange das so bleibt, faengt die Ticketwache nicht von allein an zu laufen.

Unter *Settings → General → Default branch* auf
`claude/feuertanzfestival-ticket-watcher-5jxgut` umstellen. Die Dateien des
Preiswatchers liegen auf diesem Branch unveraendert mit drin und heissen
anders (`scan.js` gegen `ticket-scan.js`, `data/` gegen `data-feuertanz/`) —
**beide Wachen laufen danach**, jede mit ihrem eigenen Zeitplan.

**2. Secrets** (*Settings → Secrets and variables → Actions*) — dieselben wie
beim Preiswatcher, nichts Neues, wenn der schon laeuft:

| Secret | Pflicht | Zweck |
|---|---|---|
| `NTFY_TOPIC` | ja | ntfy-Topic, frei waehlbar, aber **nicht erratbar machen** — jeder mit dem Namen liest mit |
| `NTFY_TOKEN` | nein | nur fuer geschuetzte ntfy-Topics |
| `TELEGRAM_TOKEN` | nein | falls du zusaetzlich Telegram willst |
| `TELEGRAM_CHAT_ID` | nein | Ziel-Chat |

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
node ticket-selbsttest.js     # 50 Pruefungen, 12 Buehnen
```

Der Selbsttest legt Seiten auf die Platte und laesst die Wache darauf laufen:
vergangene Ausgabe, Termin wird bekannt, Vorverkauf angekuendigt, Karten laut
Text, Karten laut Datenblock, ausverkauft schlaegt den Wortlaut, Rueckkehr in
den Verkauf, umformulierte Seite, die Wortlaut-Tabelle aus Signal 3, Ruhe
ohne Commit, und der Fall "Karten zuerst, Termin spaeter" — der darf nur
einmal klingeln. Er laeuft in jedem Wachlauf mit — nach dem Melden, damit ein
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

Die Adressen und Wortlaute sind recherchiert, aber **nicht gegen die echten
Seiten gemessen**: aus dieser Entwicklungsumgebung liessen sich
`www.feuertanz-festival.com`, `www.concertbuero-franken.de`,
`www.eventim.de` und `www.reservix.de` nicht abrufen — die Netzfreigabe der
Umgebung laesst sie nicht durch (HTTP 403 vom Egress-Proxy, nicht von den
Seiten). Geprueft ist deshalb bisher:

- die **Bewertung** vollstaendig, gegen Seiten auf der Platte (40 Pruefungen),
- die **Datumserkennung** gegen deutsche Schreibweisen (`12.06.2026`,
  `12.-13.06.2026`, `12. und 13. Juni 2026`, `30. Mai bis 1. Juni 2027`,
  ISO, dazu die Abweisung von `31.02.2027`),
- die **Wortlaute** gegen zehn Formulierungen.

Ungeprueft ist, ob die vier Unterseiten der Veranstalterseite so heissen und
ob die Portale von einem Runner aus antworten. Genau dafuer ist die
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
