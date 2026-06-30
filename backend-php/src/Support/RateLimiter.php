<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Rate limiter simples de janela fixa, sem dependencias externas.
 *
 * Persiste contadores em arquivos no diretorio temporario do sistema, com
 * trava (flock) para ser seguro entre processos PHP-FPM concorrentes. Serve
 * como defesa em profundidade contra abuso/brute-force; em uma frota com varios
 * nos, troque por um backend compartilhado (Redis) usando a mesma interface.
 */
final class RateLimiter
{
    /**
     * Retorna true se a requisicao esta dentro do limite; false se excedeu.
     */
    public static function allow(string $key, int $maxRequests, int $windowSeconds): bool
    {
        if ($maxRequests <= 0 || $windowSeconds <= 0) {
            return true;
        }

        $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'funeraria_ratelimit';
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        if (!is_dir($dir) || !is_writable($dir)) {
            // Sem armazenamento utilizavel: nao bloqueia (fail-open) para nao
            // derrubar o servico por causa de uma falha de infraestrutura local.
            return true;
        }

        $now = time();
        $window = (int) floor($now / $windowSeconds);
        $file = $dir . DIRECTORY_SEPARATOR . sha1($key . '|' . $window) . '.json';

        $handle = @fopen($file, 'c+');
        if ($handle === false) {
            return true;
        }

        try {
            if (!flock($handle, LOCK_EX)) {
                return true;
            }

            $raw = stream_get_contents($handle);
            $count = 0;
            if (is_string($raw) && $raw !== '') {
                $decoded = json_decode($raw, true);
                if (is_array($decoded) && isset($decoded['count'])) {
                    $count = (int) $decoded['count'];
                }
            }

            $count++;
            $allowed = $count <= $maxRequests;

            ftruncate($handle, 0);
            rewind($handle);
            fwrite($handle, json_encode(['count' => $count, 'reset' => ($window + 1) * $windowSeconds]));
            fflush($handle);

            return $allowed;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    public static function clientIp(): string
    {
        $candidates = [
            $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
            $_SERVER['HTTP_X_REAL_IP'] ?? null,
        ];
        $forwarded = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null;
        if (is_string($forwarded) && $forwarded !== '') {
            $parts = explode(',', $forwarded);
            $candidates[] = trim($parts[0]);
        }
        $candidates[] = $_SERVER['REMOTE_ADDR'] ?? null;

        foreach ($candidates as $ip) {
            if (is_string($ip) && filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
        return 'unknown';
    }
}
