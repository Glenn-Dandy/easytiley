# EasyTiley

**🇩🇪 Deutsch** · [🇬🇧 English](README.en.md)

Web-Dashboard für FHEM mit editierbaren Gerätekacheln.
Kacheln hinzufügen, frei platzieren, vergrößern, verschmelzen und speichern — alles im Browser.

![EasyTiley Dashboard](docs/screenshot.png)

```
Browser ──HTTP/SSE──> 1 Docker-Container ──HTTP──> FHEMWEB
                      (nginx + php-fpm)
                           │
                           └── SQLite (data/fhem.db)  ← Dashboards & Kachel-Layouts
```

> nginx **und** php-fpm laufen zusammen in **einem** Image (via supervisord) — ein Container genügt.

* **Frontend:** Vanilla JS + [Gridstack](https://gridstackjs.com) (Drag&Drop/Resize), eigene Kacheln + Themes, zweisprachig (DE/EN).
* **Backend:** PHP 8.3, spricht FHEMWEB via `jsonlist2` + `set` an (CSRF-Token automatisch).
* **Live-Daten:** FHEM-Push in Echtzeit (longpoll → Server-Sent-Events), 3-s-Polling nur als Fallback.
* **Speicher:** SQLite, ein Layout je Dashboard als JSON. Läuft komplett offline (keine CDNs).

## Voraussetzung

Docker + Docker Compose. Falls noch nicht vorhanden (Ubuntu, einmalig, braucht sudo):

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"   # danach einmal ab- und neu anmelden
```

## Installieren & Starten

```bash
git clone https://github.com/Glenn-Dandy/easytiley.git && cd easytiley
mkdir -p data && chmod 777 data      # php-fpm (uid 82) muss in data/ schreiben
docker compose up -d --build         # baut das Image lokal und startet den Container
# -> http://localhost:8080
```

Danach die **FHEM-Adresse im Browser unter ⚙ Einstellungen** setzen (IP:Port oder
volle URL), **Testen**, **Speichern** — kein Rebuild nötig. Die Adresse liegt in
SQLite, dieselbe Instanz läuft also ohne Codeänderung gegen jedes FHEM.

Optional als Start-Default vorab per Env: `FHEM_URL=http://<ip>:8083/fhem`.
Der Container muss das FHEM im Netz erreichen (gleiches LAN/Routing). Die
Dashboards in `data/fhem.db` überleben Updates/Rebuilds.

**HTTPS & Passwortschutz:** FHEMWEB mit `attr WEB HTTPS 1` wird unterstützt —
einfach `https://<ip>:8083` als Adresse eintragen. Selbstsignierte Zertifikate
(der FHEM-Normalfall) sind per Voreinstellung erlaubt (abschaltbar in den
Einstellungen). Ist FHEMWEB per `attr WEB basicAuth …` geschützt, Benutzername
und Passwort in den Einstellungen hinterlegen — sie bleiben serverseitig in
der SQLite und werden nie an den Browser ausgeliefert.

**Tipp Reverse-Proxy:** Läuft FHEM hinter einem Proxy, dessen Puffern die
Echtzeit-Events verzögert (nginx: `proxy_buffering off;`) — oder EasyTiley
einfach direkt auf die LAN-Adresse von FHEM zeigen lassen.

## Aktualisieren

Im geklonten Ordner (`cd easytiley`):

```bash
git pull                      # neuen Code holen
docker compose up -d --build  # Image neu bauen + Container ersetzen
```

Deine Dashboards in `data/fhem.db` bleiben erhalten. Altes Image aufräumen:
`docker image prune -f`.

## Bedienung

1. **⚙ Einstellungen** → FHEM-Adresse eintragen, **Testen**, **Speichern**.
   Dort auch: Design (dunkel/hell), **Sprache (Deutsch/English)**, Vibration.
2. **✎ Bearbeiten** → Editiermodus: Kacheln frei ziehen, an der rechten/unteren
   Kante skalieren.
3. **+ Kachel** → Typ + Gerät wählen (Readings/Befehle werden automatisch erkannt,
   das Reading-Dropdown zeigt die aktuellen Werte).
4. **✎** auf einer Kachel → bearbeiten; **✕** → entfernen.
5. **🔗** → Kachel mit einer Nachbar-Kachel **verschmelzen**: danach eine der
   4 Andock-Kanten der Zielkachel antippen. Verbundene Karten lassen sich auch
   über-/nebeneinander stapeln; **⧉** löst sie wieder auf. Funktioniert auch
   innerhalb von Gruppen.
6. **Kachel auf einen Raum-Tab ziehen** → verschiebt sie in diesen Raum.
7. **Speichern** → Layout landet in SQLite. **Fertig** → Anzeige-/Bedienmodus mit Live-Werten.
8. **⛶** → Vollbild (praktisch für Wand-Tablets, funktioniert auch über HTTP).

Kacheltypen: `Wert / Sensor`, `Schalter (on/off)`, `Licht (an/aus + RGB + CT)`,
`readingsGroup`, `Button(s) / Set-Befehle`, `Thermostat / Heizung`,
`Status (Fenster / Tür / Kontakt)`, `Rollladen / Jalousie`, `Diagramm / Verlauf
(FileLog/DbLog)`, `Wetter (PROPLANTA)`, `Gruppe / Raum-Box`, `Uhrzeit / Datum`,
`Notiz (Text / Checkliste)`, `Beschriftung / Text`.

**Freies Raster:** Kacheln liegen, wo du sie hinsetzt. Nur leerer Platz **über
allen** Kacheln wird automatisch entfernt — innere Lücken bleiben.

**Räume als Tabs:** Jeder Tab oben ist ein Raum/Dashboard. **＋** legt einen an
(im Editiermodus); Klick auf den aktiven Tab benennt ihn um, **✕** löscht ihn,
Ziehen sortiert die Tabs um.

**readingsGroup-Kachel:** zeigt eine FHEM-`readingsGroup`. FHEM rendert intern,
das Backend parst Werte + Icons heraus und das Frontend zeichnet eine **eigene
Tabelle im Theme-Look** (Aktualisierung alle 30 s).

**Gruppe / Raum-Box:** ein verschachteltes Raster im selben Koordinatensystem wie
das Hauptraster; Kacheln behalten beim Hinein-/Herausziehen ihre Größe 1:1.

**Diagramm-Kachel:** Verlaufskurven direkt aus FileLog/DbLog — Log-Gerät wählen,
Messwert aus lesbarer Liste, Zeitraum 6 h – 7 Tage, optional geglättet.

## API (PHP, unter `/api/`)

| Endpoint | Methode | Zweck |
|---|---|---|
| `/api/health` | GET | FHEM-Verbindung + CSRF prüfen |
| `/api/devices?names=A,B` | GET | Readings ausgewählter Geräte |
| `/api/devicelist` | GET | leichte Geräteliste für den Editor |
| `/api/cmd` | POST | `{device,args}` → `set`, oder `{cmd}` roh |
| `/api/stream?names=A,B` | GET | Server-Sent-Events (FHEM-Push) |
| `/api/chart?log=L&spec=S&hours=N` | GET | Verlaufsdaten aus FileLog/DbLog |
| `/api/dashboards` | GET/POST | Liste / neues Dashboard / Reihenfolge |
| `/api/dashboard?id=N` | GET/POST/DELETE | Layout laden / speichern / löschen |

## Konfiguration (`.env`)

| Variable | Default |
|---|---|
| `FHEM_URL` | `http://192.168.10.2:8083/fhem` |
| `HTTP_PORT` | `8080` |
| `TZ` | `Europe/Berlin` |

## Projektstruktur

```
docker/            Dockerfile (php-fpm) + nginx.conf
src/               Fhem.php (FHEM-Client), Db.php (SQLite)
public/            api.php (Router) + index.html + js/ + css/ + vendor/
data/              fhem.db (SQLite, gitignored)
```

## Roadmap / mögliche Erweiterungen

* Weitere Kacheltypen (Kamera, Medien).
* Stapel-Ansicht für Smartphones.
* Service Worker (installierbare Offline-PWA).

## Lizenz

MIT — siehe [LICENSE](LICENSE).
