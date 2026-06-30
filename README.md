# FHEM Frontend

Web-Dashboard für FHEM mit editierbaren Gerätekacheln.
Kacheln hinzufügen, frei platzieren, vergrößern, verschmelzen und speichern — alles im Browser.

```
Browser ──HTTP──> 1 Docker-Container ──HTTP──> FHEMWEB (192.168.10.2:8083)
                  (nginx + php-fpm)
                       │
                       └── SQLite (data/fhem.db)  ← Dashboards & Kachel-Layouts
```

> nginx **und** php-fpm laufen zusammen in **einem** Image (via supervisord) — ein Container genügt.

* **Frontend:** Vanilla JS + [Gridstack](https://gridstackjs.com) (Drag&Drop/Resize), eigene Kacheln + Themes.
* **Backend:** PHP 8.3, spricht FHEMWEB via `jsonlist2` + `set` an (CSRF-Token automatisch).
* **Live-Daten:** Polling der Dashboard-Geräte (alle 3 s). Erweiterbar auf SSE/longpoll.
* **Speicher:** SQLite, ein Layout je Dashboard als JSON.

## Voraussetzung

Docker + Docker Compose. Falls noch nicht vorhanden (Ubuntu, einmalig, braucht sudo):

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"   # danach einmal ab- und neu anmelden
```

## Installieren & Starten

```bash
git clone <repo-url> fhem-frontend && cd fhem-frontend
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

## Bedienung

1. **⚙ Einstellungen** → FHEM-Adresse eintragen, **Testen**, **Speichern**.
2. **Bearbeiten** → Editiermodus: Kacheln frei ziehen, an der rechten/unteren
   Kante skalieren.
3. **+ Kachel** → Typ + Gerät wählen (Reading wird für Schalter/Licht automatisch erkannt).
4. **✎** auf einer Kachel → bearbeiten; **✕** → entfernen.
5. **🔗** → Kachel mit einer Nachbar-Kachel **verschmelzen**: danach eine der
   4 Andock-Kanten der Zielkachel antippen. Verbundene Karten lassen sich auch
   über-/nebeneinander stapeln; **⧉** löst sie wieder auf.
6. **Speichern** → Layout landet in SQLite. **Fertig** → Anzeige-/Bedienmodus mit Live-Werten.

Kacheltypen: `Wert / Sensor`, `Schalter (on/off)`, `Licht (an/aus + RGB + CT)`,
`readingsGroup`, `Gruppe / Raum-Box`, `Button(s) / Set-Befehle`.

**Freies Raster:** Kacheln liegen, wo du sie hinsetzt. Nur leerer Platz **über
allen** Kacheln wird automatisch entfernt — innere Lücken bleiben.

**Räume als Tabs:** Jeder Tab oben ist ein Raum/Dashboard. **＋** legt einen an;
im Editiermodus benennt ein Klick auf den aktiven Tab ihn um, **✕** löscht ihn.

**readingsGroup-Kachel:** zeigt eine FHEM-`readingsGroup` (z. B. Wetter). FHEM
rendert intern, das Backend parst Werte + Icons heraus (DOMDocument) und das
Frontend zeichnet eine **eigene Tabelle im Dark-Theme** (Aktualisierung alle 30 s).

**Gruppe / Raum-Box:** ein verschachteltes Raster; Kacheln per Drag hinein- oder
herausziehen (Größe wird proportional ans Ziel-Raster angepasst).

## API (PHP, unter `/api/`)

| Endpoint | Methode | Zweck |
|---|---|---|
| `/api/health` | GET | FHEM-Verbindung + CSRF prüfen |
| `/api/devices?names=A,B` | GET | Readings ausgewählter Geräte |
| `/api/devicelist` | GET | leichte Geräteliste für den Editor |
| `/api/cmd` | POST | `{device,args}` → `set`, oder `{cmd}` roh |
| `/api/dashboards` | GET/POST | Liste / neues Dashboard |
| `/api/dashboard?id=N` | GET/POST/DELETE | Layout laden / speichern / löschen |

## Konfiguration (`.env`)

| Variable | Default |
|---|---|
| `FHEM_URL` | `http://192.168.10.2:8083/fhem` |
| `HTTP_PORT` | `8080` |

## Projektstruktur

```
docker/            Dockerfile (php-fpm) + nginx.conf
src/               Fhem.php (FHEM-Client), Db.php (SQLite)
public/            api.php (Router) + index.html + js/ + css/
data/              fhem.db (SQLite, gitignored)
```

## Roadmap / mögliche Erweiterungen

* SSE/longpoll statt Polling (Push-Updates direkt aus FHEM).
* Mehr Kacheltypen (Charts, Thermostat, Kamera).
* Icon-Auswahl je Kachel.
