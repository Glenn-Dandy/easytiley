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

try {
    $fhem = new Fhem($FHEM_URL);
    $db   = new Db($DB_PATH);

    switch ($path) {

        // ---- FHEM live data -------------------------------------------------
        case 'devices': // GET ?names=Lamp,Door   (omit names = all 294, heavy)
            $names = isset($_GET['names']) ? preg_replace('/[^A-Za-z0-9_.,\-]/', '', $_GET['names']) : null;
            $data  = $fhem->jsonlist2($names);
            $list  = array_map('compact_device', $data['Results'] ?? []);
            out(['devices' => $list, 'count' => count($list)]);

        case 'devicelist': // GET -> lightweight {name,type,room,readings[]} for the editor picker
            // Cached briefly: the full jsonlist2 is ~1.7 MB and would otherwise
            // be re-fetched on every page load / tab.
            $cacheFile = dirname($DB_PATH) . '/devicelist.cache.json';
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

        case 'health':
            $token = $fhem->token();
            out(['ok' => true, 'fhem' => $FHEM_URL, 'csrf' => $token !== '']);

        default:
            fail("unknown endpoint: /$path", 404);
    }
} catch (Throwable $e) {
    fail($e->getMessage(), 500);
}
