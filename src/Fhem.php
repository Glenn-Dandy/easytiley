<?php
declare(strict_types=1);

/**
 * Minimal FHEM client talking to FHEMWEB over HTTP.
 * Handles the X-FHEM-csrfToken handshake transparently.
 * Uses PHP stream wrappers (no curl dependency).
 */
class Fhem
{
    private string $base;
    private ?string $csrf = null;
    private string $user;
    private string $pass;
    private bool $insecure;   // accept self-signed TLS certs (the FHEM norm)

    public function __construct(string $baseUrl, string $user = '', string $pass = '', bool $insecure = true)
    {
        $this->base     = rtrim($baseUrl, '/');
        $this->user     = $user;
        $this->pass     = $pass;
        $this->insecure = $insecure;
    }

    /** curl options shared by all FHEM requests: Basic Auth (FHEMWEB attr basicAuth) + TLS mode. */
    private function curlCommon(): array
    {
        $opts = [];
        if ($this->user !== '') {
            $opts[CURLOPT_HTTPAUTH] = CURLAUTH_BASIC;
            $opts[CURLOPT_USERPWD]  = $this->user . ':' . $this->pass;
        }
        if ($this->insecure) {
            $opts[CURLOPT_SSL_VERIFYPEER] = false;
            $opts[CURLOPT_SSL_VERIFYHOST] = 0;
        }
        return $opts;
    }

    /**
     * Perform a GET. Returns [httpCode, body, responseHeaders[]].
     * Prefers curl: PHP's stream wrapper hangs ~15-60s on FHEMWEB's keep-alive
     * sockets (waits for close instead of honoring Content-Length). curl doesn't.
     */
    private function http(string $url): array
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, $this->curlCommon() + [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HEADER         => true,
                CURLOPT_TIMEOUT        => 15,
                CURLOPT_CONNECTTIMEOUT => 5,
            ]);
            $resp  = curl_exec($ch);
            $code  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $hsize = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
            curl_close($ch);
            if ($resp === false) { return [0, '', []]; }
            $headers = preg_split('/\r\n/', trim(substr($resp, 0, $hsize))) ?: [];
            return [$code, substr($resp, $hsize), $headers];
        }

        // Fallback (e.g. CLI without curl): bound the keep-alive hang with Connection: close.
        $hdr = "Connection: close\r\n";
        if ($this->user !== '') $hdr .= 'Authorization: Basic ' . base64_encode($this->user . ':' . $this->pass) . "\r\n";
        $ctx = stream_context_create(['http' => [
            'method'           => 'GET',
            'timeout'          => 15,
            'ignore_errors'    => true,
            'protocol_version' => 1.1,
            'header'           => $hdr,
        ], 'ssl' => $this->insecure ? ['verify_peer' => false, 'verify_peer_name' => false] : []]);
        $body = @file_get_contents($url, false, $ctx);
        $headers = $http_response_header ?? [];
        $code = 0;
        foreach ($headers as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) { $code = (int)$m[1]; }
        }
        return [$code, $body === false ? '' : $body, $headers];
    }

    /** Base host (scheme://host[:port]) without the /fhem path — for asset URLs. */
    public function host(): string
    {
        $p = parse_url($this->base);
        return ($p['scheme'] ?? 'http') . '://' . ($p['host'] ?? '') . (isset($p['port']) ? ':' . $p['port'] : '');
    }

    /** Fetch a raw asset (icon image/svg) by absolute URL. Returns [code, body, contentType]. */
    public function asset(string $url): array
    {
        [$code, $body, $headers] = $this->http($url);
        $ct = '';
        foreach ($headers as $h) {
            if (preg_match('#^Content-Type:\s*(.+)$#i', trim($h), $m)) { $ct = trim($m[1]); break; }
        }
        return [$code, $body, $ct];
    }

    /** Fetch (and cache) the CSRF token from FHEMWEB. */
    public function token(bool $force = false): string
    {
        if ($this->csrf !== null && !$force) {
            return $this->csrf;
        }
        [, , $headers] = $this->http($this->base);
        $this->csrf = '';
        foreach ($headers as $h) {
            if (preg_match('/^X-FHEM-csrfToken:\s*(.+)$/i', trim($h), $m)) {
                $this->csrf = trim($m[1]);
                break;
            }
        }
        return $this->csrf;
    }

    /**
     * Run a raw FHEM command (e.g. "set Lamp on", "jsonlist2 Lamp").
     * Returns the raw response body. Retries once on CSRF rejection.
     */
    public function cmd(string $command, bool $retry = true): string
    {
        $url = $this->base . '?cmd=' . rawurlencode($command)
             . '&XHR=1&fwcsrf=' . rawurlencode($this->token());

        [$code, $body] = $this->http($url);

        if ($code === 400 && $retry) {
            // token likely stale (FHEM restarted) -> refresh once
            $this->token(true);
            return $this->cmd($command, false);
        }
        if ($code < 200 || $code >= 300) {
            throw new RuntimeException("FHEM command failed (HTTP $code): $command");
        }
        return $body;
    }

    /** jsonlist2 as decoded array. $spec limits to a device list e.g. "Lamp,Door". */
    public function jsonlist2(?string $spec = null): array
    {
        $cmd  = 'jsonlist2' . ($spec !== null && $spec !== '' ? ' ' . $spec : '');
        $body = $this->cmd($cmd);
        $data = json_decode($body, true);
        if (!is_array($data)) {
            throw new RuntimeException('jsonlist2 returned invalid JSON');
        }
        return $data;
    }

    /** Send "set $device $args" (args already space separated, e.g. "on" or "pct 60"). */
    public function set(string $device, string $args): string
    {
        return $this->cmd("set $device $args");
    }

    /**
     * Open a FHEMWEB longpoll (inform) connection and call $onLine(string) for
     * every received line. Blocks until the client disconnects or $maxSeconds
     * elapse. $filter is a regex matched against device names ("^(Lamp|Door)$").
     * Every ~15s of silence $onLine("\0ping") is emitted so callers can keep the
     * client connection alive; it also lets us notice a disconnected client.
     */
    public function stream(string $filter, callable $onLine, int $maxSeconds = 3600): void
    {
        if (!function_exists('curl_init')) return;
        $since  = (string)round(microtime(true) * 1000);
        $inform = 'type=status;filter=' . $filter . ';since=' . $since;
        $url    = $this->base . '?XHR=1&inform=' . rawurlencode($inform) . '&timestamp=' . $since;

        $buf = '';
        $lastBeat = microtime(true);
        $ch = curl_init($url);
        curl_setopt_array($ch, $this->curlCommon() + [
            CURLOPT_TIMEOUT        => $maxSeconds,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_WRITEFUNCTION  => function ($ch, $chunk) use (&$buf, $onLine) {
                $buf .= $chunk;
                while (($p = strpos($buf, "\n")) !== false) {
                    $onLine(rtrim(substr($buf, 0, $p), "\r"));
                    $buf = substr($buf, $p + 1);
                }
                return connection_aborted() ? 0 : strlen($chunk);   // return != len -> curl aborts
            },
            CURLOPT_NOPROGRESS       => false,
            CURLOPT_XFERINFOFUNCTION => function () use (&$lastBeat, $onLine) {
                if (connection_aborted()) return 1;                 // non-zero -> abort
                $now = microtime(true);
                if ($now - $lastBeat > 15) { $lastBeat = $now; $onLine("\0ping"); }
                return 0;
            },
        ]);
        curl_exec($ch);
        curl_close($ch);
    }

    /**
     * Connection probe for the settings "Testen" button.
     * Returns ['ok' => csrf token received, 'code' => http status] so the UI can
     * distinguish "wrong password" (401) from "unreachable" (0/5xx).
     */
    public function probe(): array
    {
        [$code, , $headers] = $this->http($this->base);
        $csrf = '';
        foreach ($headers as $h) {
            if (preg_match('/^X-FHEM-csrfToken:\s*(.+)$/i', trim($h), $m)) { $csrf = trim($m[1]); break; }
        }
        // FHEMWEB without csrfToken attr still answers 200 — treat any 2xx as reachable.
        return ['ok' => ($code >= 200 && $code < 300), 'code' => $code, 'csrf' => $csrf !== ''];
    }
}
