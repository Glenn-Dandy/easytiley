<?php
declare(strict_types=1);

require __DIR__ . '/../src/Fhem.php';
require __DIR__ . '/../src/Db.php';

header('Content-Type: application/json; charset=utf-8');

$FHEM_URL = getenv('FHEM_URL') ?: 'http://192.168.10.2:8083/fhem';
$DB_PATH  = getenv('DB_PATH')  ?: (__DIR__ . '/../data/fhem.db');

/** Path after /api/ , e.g. "devices", "dashboard". */
$path   = trim((string)($_SERVER['PATH_INFO'] ?? $_SERVER['REQUEST_URI'] ?? ''), '/');
$path   = preg_replace('#^api/#', '', $path);
$path   = explode('?', $path)[0];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function body_json(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}
function out($data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $msg, int $code = 500): void
{
    out(['error' => $msg], $code);
}

/** Compact a jsonlist2 result row into the shape the frontend needs. */
function compact_device(array $r): array
{
    $readings = [];
    foreach (($r['Readings'] ?? []) as $name => $rd) {
        $readings[$name] = [
            'value' => $rd['Value'] ?? '',
            'time'  => $rd['Time']  ?? '',
        ];
    }
    return [
        'name'     => $r['Name'] ?? '',
        'type'     => $r['Internals']['TYPE'] ?? '',
        'state'    => $r['Internals']['STATE'] ?? ($readings['state']['value'] ?? ''),
        'room'     => $r['Attributes']['room'] ?? '',
        'alias'    => $r['Attributes']['alias'] ?? ($r['Name'] ?? ''),
        'readings' => $readings,
    ];
}

/** Parse FHEM PossibleSets ("on:noArg off:noArg pct:slider,0,1,100 ...") into command names. */
function parse_sets(string $possibleSets): array
{
    $out = [];
    foreach (preg_split('/\s+/', trim($possibleSets)) as $tok) {
        if ($tok === '') continue;
        $out[] = explode(':', $tok)[0]; // drop the ":argHint" part
    }
    return $out;
}

/** Find the reading that actually reflects on/off (YeeLight: "power", not "state"="opened"). */
function detect_onoff(array $rawReadings): ?string
{
    $found = [];
    foreach ($rawReadings as $name => $rd) {
        $v = strtolower((string)($rd['Value'] ?? ''));
        if ($v === 'on' || $v === 'off') { $found[$name] = true; }
    }
    if (!$found) return null;
    foreach (['power', 'POWER', 'onoff', 'relay', 'state'] as $pref) {
        if (isset($found[$pref])) return $pref;
    }
    return array_key_first($found);
}

/**
 * Parse FHEM's rendered readingsGroup HTML into structured rows so the frontend
 * can draw its own themed table. Keeps icons (img/svg), drops FHEM styling.
 * Returns [ ['sep'=>bool, 'cells'=>[htmlString,...]], ... ].
 */
/** Text content of a node, but skipping icon subtrees (svg/img carry junk text like potrace comments). */
function rg_text(DOMNode $n): string
{
    if ($n->nodeType === XML_TEXT_NODE) return $n->nodeValue;
    if ($n->nodeType !== XML_ELEMENT_NODE) return '';
    $tag = strtolower($n->nodeName);
    if ($tag === 'svg' || $tag === 'img') return '';
    $s = '';
    foreach ($n->childNodes as $c) $s .= rg_text($c);
    return $s;
}

function rg_parse(string $html): array
{
    if (trim($html) === '') return [];
    $doc = new DOMDocument();
    libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="utf-8"?><div>' . $html . '</div>');
    libxml_clear_errors();
    $xp = new DOMXPath($doc);

    // The real grid is the inner table with class "readingsGroup".
    $table = $xp->query("//table[contains(@class,'readingsGroup')]")->item(0)
          ?: $xp->query('//table')->item(0);
    if (!$table) return [];

    $rows = [];
    foreach ($xp->query('.//tr', $table) as $tr) {
        // only the tr's own cells (the inner table has no nested tables)
        $cells = [];
        $sep   = false;
        foreach ($xp->query('./td | ./th', $tr) as $td) {
            if ($xp->query('.//hr', $td)->length) { $sep = true; continue; }
            $icons = '';
            foreach ($xp->query('.//img | .//svg', $td) as $node) {
                foreach (['informid', 'informId', 'class', 'id'] as $a) {
                    if ($node->hasAttribute($a)) $node->removeAttribute($a);
                }
                $icon = $doc->saveHTML($node);
                $icon = preg_replace('/<!--.*?-->/s', '', $icon);                       // potrace comments
                $icon = preg_replace('#<(metadata|desc|title)\b[^>]*>.*?</\1>#is', '', $icon); // hidden text
                $icons .= $icon;
            }
            $text = preg_replace('/\s+/u', ' ', trim(rg_text($td)));
            $cells[] = $icons . ($text !== '' ? '<span class="rg-v">' . htmlspecialchars($text, ENT_QUOTES) . '</span>' : '');
        }
        if ($sep && !$cells) { $rows[] = ['sep' => true, 'cells' => []]; }
        elseif ($cells)      { $rows[] = ['sep' => false, 'cells' => $cells]; }
    }
    return $rows;
}

try {
    $db = new Db($DB_PATH);
    // Runtime-configurable FHEM URL (settings override the build-time env default),
    // so the same image works against any FHEM instance.
    $fhemUrl = $db->getSetting('fhem_url') ?: $FHEM_URL;
    $fhem    = new Fhem($fhemUrl);

    switch ($path) {

        // ---- Settings -------------------------------------------------------
        case 'settings':
            if ($method === 'POST') {
                $b   = body_json();
                // Grid generation marker (one-time layout migration flag). Global,
                // so a second device doesn't re-run a migration already applied.
                if (isset($b['gridGen'])) {
                    $db->setSetting('grid_gen', (string)(int)$b['gridGen']);
                    out(['ok' => true, 'gridGen' => (int)$b['gridGen']]);
                }
                $url = trim((string)($b['fhemUrl'] ?? ''));
                if ($url === '') fail('fhemUrl required', 400);
                if (!preg_match('#^https?://#i', $url)) $url = 'http://' . $url;
                $p = parse_url($url);                       // append /fhem if only host[:port] given
                if (empty($p['path']) || $p['path'] === '/') $url = rtrim($url, '/') . '/fhem';
                // Probe the candidate URL before (optionally) persisting.
                $reachable = false;
                try { $reachable = (new Fhem($url))->token() !== ''; } catch (Throwable $e) {}
                $save = empty($b['test']);
                if ($save) $db->setSetting('fhem_url', $url);
                out(['ok' => true, 'reachable' => $reachable, 'saved' => $save, 'fhemUrl' => $url]);
            }
            out(['fhemUrl' => $fhemUrl, 'default' => $FHEM_URL, 'gridGen' => (int)($db->getSetting('grid_gen') ?: 1)]);

        // ---- readingsGroup: parse FHEM's rendering into our own table -------
        case 'readingsgroup': // GET ?name=WetterInfo -> { rows:[{sep,cells[]}] }
            $name = preg_replace('/[^A-Za-z0-9_.\-]/', '', (string)($_GET['name'] ?? ''));
            if ($name === '') fail('name required', 400);
            $html = $fhem->cmd("{readingsGroup_2html('$name')}");
            // Route /fhem/ icon URLs through our own proxy so every device loads them
            // from the app (identical everywhere; only the container must reach FHEM).
            $html = str_replace(['="/fhem/', "='/fhem/"], ['="/api/fhemasset?path=/fhem/', "='/api/fhemasset?path=/fhem/"], $html);
            out(['rows' => rg_parse($html)]);

        // ---- icon proxy: fetch a FHEM asset and serve it from the app -------
        case 'fhemasset': // GET ?path=/fhem/images/.../sunny.svg
            $assetPath = (string)($_GET['path'] ?? '');
            if (!preg_match('#^/fhem/[A-Za-z0-9/_.\-]+$#', $assetPath) || strpos($assetPath, '..') !== false)
                fail('bad path', 400);                     // FHEM assets only, no path traversal
            [$code, $body, $ct] = $fhem->asset($fhem->host() . $assetPath);
            if ($code < 200 || $code >= 300 || $body === '') fail('asset unavailable', 502);
            header('Content-Type: ' . ($ct ?: 'application/octet-stream'));
            header('Cache-Control: public, max-age=604800'); // icons are static
            echo $body;
            exit;

        // ---- live push: FHEM longpoll -> Server-Sent-Events -----------------
        case 'stream': // GET ?names=Lamp,Door  -> SSE of reading updates
            $names = isset($_GET['names']) ? preg_replace('/[^A-Za-z0-9_.,\-]/', '', $_GET['names']) : '';
            $list  = array_values(array_filter(explode(',', $names)));
            $filter = $list
                ? '^(' . implode('|', array_map(fn($n) => preg_quote($n, '#'), $list)) . ')$'
                : '.*';

            header('Content-Type: text/event-stream; charset=utf-8'); // replaces the JSON header
            header('Cache-Control: no-cache');
            header('X-Accel-Buffering: no');
            while (ob_get_level() > 0) ob_end_flush();
            ignore_user_abort(true);
            @set_time_limit(0);
            echo ": connected\n\n"; @flush();

            $fhem->stream($filter, function (string $line) {
                if ($line === "\0ping") { echo ": ping\n\n"; @flush(); return; }
                if ($line === '') return;
                $parts = explode('<<', $line);
                if (count($parts) < 2) return;                       // not a status line
                $key = $parts[0];
                $val = $parts[1];
                if (substr($key, -3) === '-ts') return;              // timestamp lines
                $val = preg_replace('#^<html>(.*)</html>$#s', '$1', $val); // unwrap FHEM <html> values
                $dash = strpos($key, '-');
                if ($dash === false) { $device = $key; $reading = 'state'; }
                else { $device = substr($key, 0, $dash); $reading = substr($key, $dash + 1); }
                if ($device === '' || $reading === '' || strpos($reading, ' ') !== false) return;
                echo 'data: ' . json_encode(['d' => $device, 'r' => $reading, 'v' => $val], JSON_UNESCAPED_UNICODE) . "\n\n";
                @flush();
            });
            exit;

        // ---- FHEM live data -------------------------------------------------
        case 'devices': // GET ?names=Lamp,Door   (omit names = all 294, heavy)
            $names = isset($_GET['names']) ? preg_replace('/[^A-Za-z0-9_.,\-]/', '', $_GET['names']) : null;
            $data  = $fhem->jsonlist2($names);
            $list  = array_map('compact_device', $data['Results'] ?? []);
            out(['devices' => $list, 'count' => count($list)]);

        case 'devicelist': // GET -> lightweight {name,type,room,readings[]} for the editor picker
            // Cached briefly: the full jsonlist2 is ~1.7 MB and would otherwise
            // be re-fetched on every page load / tab.
            $cacheFile = dirname($DB_PATH) . '/devicelist.' . substr(md5($fhemUrl), 0, 8) . '.json';
            if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < 300) {
                echo file_get_contents($cacheFile); // fresh (< 5 min)
                exit;
            }
            try {
                $data = $fhem->jsonlist2();
                $list = array_map(function ($r) {
                    $rd = $r['Readings'] ?? [];
                    return [
                        'name'     => $r['Name'] ?? '',
                        'type'     => $r['Internals']['TYPE'] ?? '',
                        'room'     => $r['Attributes']['room'] ?? '',
                        'alias'    => $r['Attributes']['alias'] ?? ($r['Name'] ?? ''),
                        'readings' => array_keys($rd),
                        'sets'     => parse_sets($r['PossibleSets'] ?? ''),
                        'onoff'    => detect_onoff($rd),
                    ];
                }, $data['Results'] ?? []);
                $payload = json_encode(['devices' => $list, 'count' => count($list)],
                                       JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                @file_put_contents($cacheFile, $payload);
                echo $payload;
            } catch (Throwable $e) {
                // FHEM busy/slow -> serve stale cache rather than hang the UI
                if (is_file($cacheFile)) { echo file_get_contents($cacheFile); }
                else { fail('devicelist unavailable: ' . $e->getMessage(), 504); }
            }
            exit;

        case 'cmd': // POST {device, args}  OR  {cmd}
            if ($method !== 'POST') fail('POST required', 405);
            $b = body_json();
            if (!empty($b['cmd'])) {
                $res = $fhem->cmd((string)$b['cmd']);
            } elseif (!empty($b['device']) && isset($b['args'])) {
                $res = $fhem->set((string)$b['device'], (string)$b['args']);
            } else {
                fail('need {device,args} or {cmd}', 400);
            }
            out(['ok' => true, 'result' => $res]);

        // ---- Dashboards (SQLite) -------------------------------------------
        case 'dashboards':
            if ($method === 'POST') {
                $b = body_json();
                $id = $db->createDashboard((string)($b['name'] ?? 'Neu'));
                out(['id' => $id], 201);
            }
            out(['dashboards' => $db->listDashboards()]);

        case 'dashboard':
            $id = (int)($_GET['id'] ?? 0);
            if ($method === 'GET') {
                $d = $db->getDashboard($id);
                if (!$d) fail('not found', 404);
                $d['layout'] = json_decode($d['layout'], true) ?: [];
                out($d);
            }
            if ($method === 'DELETE') {
                $db->deleteDashboard($id);
                out(['ok' => true]);
            }
            if ($method === 'POST' || $method === 'PUT') { // save layout
                $b = body_json();
                $id = (int)($b['id'] ?? $id);
                $layout = json_encode($b['layout'] ?? [], JSON_UNESCAPED_UNICODE);
                $db->saveLayout($id, $layout, isset($b['name']) ? (string)$b['name'] : null);
                out(['ok' => true]);
            }
            fail('unsupported method', 405);

        // ---- Layout backup -------------------------------------------------
        case 'export': // GET -> all dashboards with their layouts
            $dash = [];
            foreach ($db->listDashboards() as $d) {
                $full = $db->getDashboard((int)$d['id']);
                $dash[] = ['name' => $full['name'], 'layout' => json_decode($full['layout'], true) ?: []];
            }
            out(['version' => 1, 'dashboards' => $dash]);

        case 'import': // POST {dashboards:[{name,layout}]} -> replaces all
            if ($method !== 'POST') fail('POST required', 405);
            $b = body_json();
            $list = $b['dashboards'] ?? null;
            if (!is_array($list) || !$list) fail('keine Dashboards im Import', 400);
            foreach ($db->listDashboards() as $d) $db->deleteDashboard((int)$d['id']);
            foreach ($list as $dash) {
                $id = $db->createDashboard((string)($dash['name'] ?? 'Import'));
                $db->saveLayout($id, json_encode($dash['layout'] ?? [], JSON_UNESCAPED_UNICODE));
            }
            out(['ok' => true, 'count' => count($list)]);

        case 'health':
            $token = $fhem->token();
            out(['ok' => true, 'fhem' => $FHEM_URL, 'csrf' => $token !== '']);

        default:
            fail("unknown endpoint: /$path", 404);
    }
} catch (Throwable $e) {
    fail($e->getMessage(), 500);
}
