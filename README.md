# FHEM Frontend

Web-Dashboard für FHEM mit editierbaren Gerätekacheln (FTUI-Optik).
Kacheln hinzufügen, verschieben, vergrößern und speichern — alles im Browser.

```
Browser ──HTTP──> nginx + php-fpm (Docker) ──HTTP──> FHEMWEB (192.168.10.2:8083)
                       │
                       └── SQLite (data/fhem.db)  ← Dashboards & Kachel-Layouts
```

* **Frontend:** Vanilla JS + [Gridstack](https://gridstackjs.com) (Drag&Drop/Resize), FTUI-Stil.
* **Backend:** PHP 8.3, spricht FHEMWEB via `jsonlist2` + `set` an (CSRF-Token automatisch).
* **Live-Daten:** Polling der Dashboard-Geräte (alle 3 s). Erweiterbar auf SSE/longpoll.
* **Speicher:** SQLite, ein Layout je Dashboard als JSON.

## Start

Voraussetzung: Docker + Docker Compose (siehe unten).

```bash
cp .env.example .env          # FHEM_URL / Port ggf. anpassen
docker compose up -d --build
# -> http://localhost:8080
```

### Docker auf dieser Box installieren (einmalig, braucht sudo)

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"   # danach einmal ab- und neu anmelden
```

## Bedienung

1. **Bearbeiten** klicken → Editiermodus (Kacheln lassen sich ziehen/skalieren).
2. **+ Kachel** → Typ, Gerät (Suche über alle 294 Devices), Reading wählen.
3. **Speichern** → Layout landet in SQLite.
4. **Fertig** → normaler Anzeige-/Bedienmodus mit Live-Werten.

Kacheltypen: `Wert/Sensor`, `Schalter (on/off)`, `Dimmer (0–100 %)`, `Button (set-Befehl)`, `Beschriftung`.

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
* Mehr Kacheltypen (Charts, Thermostat, Kamera, RGB).
* Echte FTUI-Widgets einbetten.
* Icon-Auswahl je Kachel, Räume/Tabs.
