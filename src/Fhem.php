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

    public function __construct(string $baseUrl)
    {
        $this->base = rtrim($baseUrl, '/');
    }

    /** Perform a GET. Returns [httpCode, body, responseHeaders[]]. */
    private function http(string $url): array
    {
        $ctx = stream_context_create(['http' => [
            'method'        => 'GET',
            'timeout'       => 15,
            'ignore_errors' => true, // still return body on 4xx/5xx
        ]]);
        $body = @file_get_contents($url, false, $ctx);
        $headers = $http_response_header ?? [];
        $code = 0;
        foreach ($headers as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) { $code = (int)$m[1]; }
        }
        return [$code, $body === false ? '' : $body, $headers];
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
}
