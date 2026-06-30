<?php
declare(strict_types=1);

/** SQLite storage for dashboards/tile layouts. */
class Db
{
    private PDO $pdo;

    public function __construct(string $path)
    {
        $this->pdo = new PDO('sqlite:' . $path);
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->migrate();
    }

    private function migrate(): void
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS dashboards (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                name    TEXT NOT NULL,
                layout  TEXT NOT NULL DEFAULT "[]",
                updated TEXT
            )'
        );
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT
            )'
        );
        // Seed a default dashboard on first run, with a clock tile top-left.
        $n = (int)$this->pdo->query('SELECT COUNT(*) FROM dashboards')->fetchColumn();
        if ($n === 0) {
            $seed = '[{"id":"clk-default","type":"clock","x":0,"y":0,"w":3,"h":3}]';
            $this->pdo->prepare('INSERT INTO dashboards (name, layout, updated) VALUES (?, ?, ?)')
                      ->execute(['Start', $seed, date('c')]);
        }
    }

    public function getSetting(string $key, ?string $default = null): ?string
    {
        $st = $this->pdo->prepare('SELECT value FROM settings WHERE key = ?');
        $st->execute([$key]);
        $v = $st->fetchColumn();
        return $v === false ? $default : (string)$v;
    }

    public function setSetting(string $key, string $value): void
    {
        $this->pdo->prepare(
            'INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        )->execute([$key, $value]);
    }

    public function listDashboards(): array
    {
        return $this->pdo->query('SELECT id, name, updated FROM dashboards ORDER BY id')->fetchAll();
    }

    public function getDashboard(int $id): ?array
    {
        $st = $this->pdo->prepare('SELECT id, name, layout, updated FROM dashboards WHERE id = ?');
        $st->execute([$id]);
        $row = $st->fetch();
        return $row ?: null;
    }

    public function createDashboard(string $name): int
    {
        $st = $this->pdo->prepare('INSERT INTO dashboards (name, layout, updated) VALUES (?, "[]", ?)');
        $st->execute([$name, date('c')]);
        return (int)$this->pdo->lastInsertId();
    }

    public function saveLayout(int $id, string $layoutJson, ?string $name = null): void
    {
        if ($name !== null) {
            $st = $this->pdo->prepare('UPDATE dashboards SET layout = ?, name = ?, updated = ? WHERE id = ?');
            $st->execute([$layoutJson, $name, date('c'), $id]);
        } else {
            $st = $this->pdo->prepare('UPDATE dashboards SET layout = ?, updated = ? WHERE id = ?');
            $st->execute([$layoutJson, date('c'), $id]);
        }
    }

    public function deleteDashboard(int $id): void
    {
        $this->pdo->prepare('DELETE FROM dashboards WHERE id = ?')->execute([$id]);
    }
}
