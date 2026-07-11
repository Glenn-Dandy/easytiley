// Two-language UI (de = source language in markup/code, en = translated).
// LANG comes from localStorage or the browser; tr() translates dynamic strings,
// translateDom() walks the static HTML once at boot. Loads before all other app scripts.
const LANG = localStorage.getItem('lang') ||
  ((navigator.language || '').toLowerCase().startsWith('de') ? 'de' : 'en');

const I18N_DAYS   = LANG === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                                  : ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const I18N_MONTHS = LANG === 'en' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                                  : ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const TR = {
  // dialog: types
  'Kachel hinzufügen': 'Add tile', 'Kachel bearbeiten': 'Edit tile', 'Typ': 'Type',
  'FHEM-Gerät': 'FHEM device', 'Ohne FHEM': 'Without FHEM',
  'Wert / Sensor': 'Value / sensor', 'Schalter (on/off)': 'Switch (on/off)',
  'Licht (an/aus + RGB + CT)': 'Light (on/off + RGB + CT)',
  'Button(s) / Set-Befehle': 'Button(s) / set commands', 'Thermostat / Heizung': 'Thermostat / heating',
  'Status (Fenster / Tür / Kontakt)': 'Status (window / door / contact)',
  'Rollladen / Jalousie': 'Shutter / blinds', 'Diagramm / Verlauf': 'Chart / history',
  'Wetter': 'Weather', 'Gruppe / Raum-Box': 'Group / room box', 'Uhrzeit / Datum': 'Clock / date',
  'Notiz': 'Note', 'Beschriftung / Text': 'Label / text',
  // dialog: common fields
  'Gerät': 'Device', 'Gerät suchen…': 'Search device…', 'z.B. state, temperature': 'e.g. state, temperature',
  'Beschriftung': 'Label', 'Anzeigename': 'Display name', 'Auf Geräte-Alias zurücksetzen': 'Reset to device alias',
  'Standard': 'Default', 'Icon-Farbe': 'Icon colour', 'Einheit': 'Unit',
  'Titel anzeigen': 'Show title', 'Abbrechen': 'Cancel', 'Übernehmen': 'Apply',
  // chart
  'Log-Gerät (FileLog / DbLog)': 'Log device (FileLog / DbLog)', 'Log wählen…': 'Choose a log…',
  'Messwert': 'Measurement', 'Zeitraum': 'Time range',
  '6 Stunden': '6 hours', '12 Stunden': '12 hours', '24 Stunden': '24 hours', '48 Stunden': '48 hours', '7 Tage': '7 days',
  'Werte glätten': 'Smooth values', 'Beschriftung anzeigen': 'Show labels',
  'Erweitert – Log-Spezifikation': 'Advanced – log specification', 'Spezifikation': 'Specification',
  'Wird aus der Messwert-Auswahl erzeugt. FileLog:': 'Generated from the measurement choice. FileLog:',
  '– manuell (siehe Erweitert) –': '– manual (see Advanced) –',
  'keine Daten im Zeitraum': 'no data in this range', 'zu wenig Datenpunkte': 'not enough data points',
  // cover
  'Invertiert (Gerät meldet 100 % = geschlossen)': 'Inverted (device reports 100 % = closed)',
  'Position (Reading)': 'Position (reading)', 'Position setzen (Befehl)': 'Set position (command)',
  'Öffnen (Befehl)': 'Open (command)', 'Schließen (Befehl)': 'Close (command)', 'Stopp (Befehl)': 'Stop (command)',
  'optional – sonst Position 100': 'optional – falls back to position 100',
  'optional – sonst Position 0': 'optional – falls back to position 0',
  'optional – blendet ■ ein': 'optional – shows ■',
  'offen': 'open', 'geschlossen': 'closed', 'teils offen': 'partly open',
  'öffnen': 'open', 'schließen': 'close', 'stopp': 'stop',
  // thermostat
  'Erweitert – Readings & Befehle': 'Advanced – readings & commands',
  'Werden beim Gerät-Auswählen automatisch erkannt – nur bei Bedarf anpassen.':
    'Detected automatically when a device is picked – adjust only if needed.',
  'Schrittweite': 'Step size', 'Ist-Temperatur (Reading)': 'Actual temperature (reading)',
  'Soll-Temperatur (Reading)': 'Target temperature (reading)', 'Soll setzen (Befehl)': 'Set target (command)',
  'Ventil (Reading)': 'Valve (reading)', 'Batterie (Reading)': 'Battery (reading)',
  'Modus (Reading)': 'Mode (reading)', 'Modus setzen (Befehl)': 'Set mode (command)',
  'optional – blendet Modus-Tasten ein': 'optional – shows the mode buttons',
  'Manuell': 'Manual', 'kühler': 'cooler', 'wärmer': 'warmer', 'Ventil': 'Valve',
  // status tile
  'Zustände – Wert → Icon': 'States – value → icon', '+ Zustand': '+ state',
  'Wert, z.B. open (leer=Standard)': 'value, e.g. open (empty = default)', 'Text (optional)': 'Text (optional)',
  'gekippt': 'tilted', 'zu': 'closed',
  // buttons tile
  'Anzeige': 'Display', 'Icons': 'Icons', '1 Icon wechselnd': '1 icon cycling',
  'Buttons – Befehl + Text/Icon': 'Buttons – command + text/icon', '+ Befehl': '+ command',
  'Befehl, z.B. on': 'command, e.g. on', 'Leuchtet, wenn dieser Zustand aktiv ist': 'Glows while this state is active',
  'Umschalten': 'Toggle',
  // light
  'RGB-Farbe': 'RGB colour', 'Farb-Befehl': 'Colour command', 'Weiß (CT)': 'White (CT)',
  'Befehl': 'Command', 'von K': 'from K', 'bis K': 'to K', 'Helligkeit (Dimmen)': 'Brightness (dimming)',
  // note
  'Notiz bearbeiten': 'Edit note', 'Titel': 'Title', 'Modus': 'Mode', 'Text': 'Text',
  'Checkliste': 'Checklist', 'Punkte – eine Zeile pro Punkt': 'Items – one line per item', 'Freier Text…': 'Free text…',
  // weather
  'Ist-Werte aus Fremd-Gerät': 'Current values from another device', '(leer = Proplanta)': '(empty = Proplanta)',
  'Temp': 'Temp', 'Feuchte': 'Humidity', 'Druck': 'Pressure', 'Wind': 'Wind',
  'Regen': 'Rain', 'Sonne': 'Sun',
  // settings
  'Einstellungen': 'Settings', 'Design': 'Theme', 'Dunkel': 'Dark', 'Hell': 'Light', 'Sprache': 'Language',
  'Vibration bei Bedienung': 'Vibrate on touch', 'Ton bei Bedienung': 'Sound on touch', 'Reduzierte Effekte (Performance)': 'Reduced effects (performance)',
  'FHEM-Adresse (IP oder URL)': 'FHEM address (IP or URL)',
  'wird ergänzt. HTTPS wird unterstützt.': 'is appended. HTTPS is supported.', 'Beispiel:': 'Example:',
  'Benutzername': 'Username', '(leer = kein Passwortschutz)': '(empty = no password protection)',
  'Passwort': 'Password', 'Selbstsignierte Zertifikate erlauben': 'Allow self-signed certificates',
  'Layout (alle Dashboards)': 'Layout (all dashboards)', '⬇ Exportieren': '⬇ Export', '⬆ Importieren': '⬆ Import',
  'Schließen': 'Close', 'Testen': 'Test', 'Speichern': 'Save',
  '…prüfe Verbindung…': '…testing connection…', '✓ erreichbar: ': '✓ reachable: ',
  '✗ nicht erreichbar: ': '✗ not reachable: ', '✗ Login abgelehnt (Benutzer/Passwort prüfen)': '✗ login rejected (check username/password)',
  '✓ gespeichert & verbunden': '✓ saved & connected',
  '⚠ gespeichert, aber nicht erreichbar: ': '⚠ saved, but not reachable: ',
  '⚠ gespeichert, aber Login abgelehnt (Benutzer/Passwort prüfen)': '⚠ saved, but login rejected (check username/password)',
  'Bitte eine Adresse eingeben.': 'Please enter an address.',
  'gespeichert – leer lassen zum Behalten': 'saved – leave empty to keep',
  'Layout exportiert ✓': 'Layout exported ✓', 'Gespeichert ✓': 'Saved ✓', 'Export-Fehler: ': 'Export error: ', 'Import-Fehler: ': 'Import error: ',
  'keine Dashboards in der Datei': 'no dashboards in the file',
  'Alle aktuellen Dashboards durch den Import ersetzen?': 'Replace all current dashboards with the import?',
  // topbar / rooms / edit mode
  'Bearbeiten': 'Edit', 'Vollbild': 'Fullscreen', 'Verbindung': 'Connection', 'Fertig': 'Done',
  'Neuer Raum': 'New room', 'Name des neuen Raums/Tabs:': 'Name of the new room/tab:',
  'Raum umbenennen:': 'Rename room:', 'Mindestens ein Raum muss bleiben.': 'At least one room must remain.',
  'Diesen Raum mit allen Kacheln löschen?': 'Delete this room with all its tiles?', 'Raum löschen': 'Delete room',
  'Entfernen': 'Remove', 'Mit Nachbar verbinden': 'Merge with neighbour',
  // tile runtime
  'An': 'On', 'Aus': 'Off', 'lädt…': 'loading…', '– keine Daten –': '– no data –', 'Fehler: ': 'Error: ',
  'Standard (automatisch)': 'Default (automatic)', 'Kein Icon': 'No icon', 'Icon suchen…': 'Search icons…',
  // hint fragments (split by <code> tags in the markup)
  'Reading-Wert links (z. B.': 'Reading value on the left (e.g.',
  ') → Icon + Text + Farbe. „Wert" leer = Standard/sonst (Fallback).': ') → icon + text + colour. Empty value = default/fallback.',
  'Voraussetzung: ein': 'Requires a',
  '-Device (z. B. AgroWeather).': 'device (e.g. AgroWeather).',
  // icon library labels (picker titles + search)
  'Licht': 'Light', 'Lampe': 'Lamp', 'Deckenlampe': 'Ceiling lamp', 'Steckdose': 'Socket', 'Schalter': 'Switch',
  'Thermometer': 'Thermometer', 'Luftfeuchte': 'Humidity', 'Energie': 'Energy', 'Tür': 'Door', 'Tür offen': 'Door open',
  'Garagentor': 'Garage door', 'Fenster zu': 'Window closed', 'Fenster offen': 'Window open',
  'Fenster gekippt': 'Window tilted', 'Schloss zu': 'Lock closed', 'Schloss auf': 'Lock open',
  'Rollladen': 'Shutter', 'Jalousie': 'Blinds', 'Vorhang': 'Curtain', 'Ventilator': 'Fan', 'Heizung': 'Heating',
  'Thermostat': 'Thermostat', 'Klima': 'AC', 'Warmwasser': 'Hot water', 'Lautsprecher': 'Speaker', 'Musik': 'Music',
  'Kamera': 'Camera', 'Bewegung': 'Motion', 'Rauchmelder': 'Smoke detector', 'Wasser-Leck': 'Water leak',
  'Tropfen': 'Droplet', 'Flamme': 'Flame', 'Mond': 'Moon', 'Wolke': 'Cloud', 'Schnee': 'Snow', 'Kaffee': 'Coffee',
  'Bett': 'Bed', 'Sofa': 'Sofa', 'Herd / Küche': 'Stove / kitchen', 'Bad / Dusche': 'Bath / shower',
  'Ladestation': 'Charger', 'Batterie': 'Battery', 'WLAN': 'Wi-Fi', 'Uhr': 'Clock', 'Kalender': 'Calendar',
  'Glocke': 'Bell', 'Alarm scharf': 'Alarm armed', 'Alarm unscharf': 'Alarm disarmed', 'Anwesend': 'Present',
  'Abwesend': 'Absent', 'Haus': 'House', 'Zahnrad': 'Gear', 'Pflanze': 'Plant', 'Saugroboter': 'Vacuum',
  'Schlüssel': 'Key', 'Mülleimer': 'Trash', 'Luftdruck': 'Air pressure',
};

// Normalize NBSP in the table keys too (easy to type one by accident).
for (const k of Object.keys(TR)) {
  const n = k.replace(/\u00a0/g, ' ');
  if (n !== k) { TR[n] = TR[k]; delete TR[k]; }
}

const tr = s => LANG === 'de' ? s : (TR[s.replace(/\u00a0/g, ' ')] || s);

// Translate the static markup once (text nodes + placeholder/title attributes).
function translateDom(root) {
  if (LANG === 'de') return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const raw = n.nodeValue.trim();
    const k = raw.replace(/\u00a0/g, ' ');           // markup uses &nbsp; in places
    if (raw && TR[k]) n.nodeValue = n.nodeValue.replace(raw, TR[k]);
  }
  root.querySelectorAll('[placeholder], [title]').forEach(e => {
    const norm = x => x.trim().replace(/\u00a0/g, ' ');
    const p = e.getAttribute('placeholder');
    if (p && TR[norm(p)]) e.setAttribute('placeholder', TR[norm(p)]);
    const t = e.getAttribute('title');
    if (t && TR[norm(t)]) e.setAttribute('title', TR[norm(t)]);
  });
}
document.addEventListener('DOMContentLoaded', () => translateDom(document.body));
