<?php

declare(strict_types=1);

namespace App\Support;

use PDO;
use PDOException;
use RuntimeException;

final class Database
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $dbUrl = Env::get('DB_URL');
        $host = Env::get('DB_HOST', '127.0.0.1');
        $port = Env::get('DB_PORT', '5432');
        $fallbackHost = Env::get('DB_FALLBACK_HOST');
        $fallbackPort = Env::get('DB_FALLBACK_PORT', '6543');
        $name = Env::get('DB_NAME', 'postgres');
        $user = Env::get('DB_USER', 'postgres');
        $password = Env::get('DB_PASSWORD', '');
        $sslmode = Env::get('DB_SSLMODE', 'require');

        if (is_string($dbUrl) && trim($dbUrl) !== '') {
            $parsed = parse_url(trim($dbUrl));
            if (is_array($parsed)) {
                $host = (string) ($parsed['host'] ?? $host);
                $port = isset($parsed['port']) ? (string) $parsed['port'] : $port;
                $name = isset($parsed['path']) ? ltrim((string) $parsed['path'], '/') : $name;
                $user = isset($parsed['user']) ? rawurldecode((string) $parsed['user']) : $user;
                $password = isset($parsed['pass']) ? rawurldecode((string) $parsed['pass']) : $password;
            }
        }

        $candidates = [
            ['host' => $host, 'port' => $port],
        ];
        if (is_string($fallbackHost) && trim($fallbackHost) !== '') {
            $candidates[] = ['host' => trim($fallbackHost), 'port' => $fallbackPort];
        }

        $errors = [];
        foreach ($candidates as $candidate) {
            $dsn = sprintf(
                'pgsql:host=%s;port=%s;dbname=%s;sslmode=%s;connect_timeout=5',
                $candidate['host'],
                $candidate['port'],
                $name,
                $sslmode
            );

            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ];

            // Transaction pooler do Supabase (porta 6543, pgbouncer em modo
            // transaction) nao suporta prepared statements server-side persistentes:
            // emulamos os prepares para que o pool de conexoes seja seguro em escala.
            if ((string) $candidate['port'] === '6543') {
                $options[PDO::ATTR_EMULATE_PREPARES] = true;
            }

            try {
                self::$pdo = new PDO($dsn, $user, $password, $options);
                return self::$pdo;
            } catch (PDOException $exception) {
                $errors[] = sprintf('%s:%s -> %s', $candidate['host'], $candidate['port'], $exception->getMessage());
            }
        }

        throw new RuntimeException('Falha na conexao com o banco: ' . implode(' | ', $errors));
    }
}
