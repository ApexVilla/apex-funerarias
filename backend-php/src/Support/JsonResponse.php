<?php

declare(strict_types=1);

namespace App\Support;

final class JsonResponse
{
    /**
     * @param array<string, mixed> $payload
     */
    public static function send(array $payload, int $statusCode = 200): void
    {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /**
     * @param mixed $data
     * @param array<string, mixed> $meta
     */
    public static function ok(mixed $data, array $meta = [], int $statusCode = 200): void
    {
        self::send([
            'success' => true,
            'data' => $data,
            'meta' => $meta,
            'errors' => [],
        ], $statusCode);
    }

    /**
     * @param array<int, string> $errors
     * @param array<string, mixed> $meta
     */
    public static function fail(array $errors, int $statusCode = 400, array $meta = []): void
    {
        self::send([
            'success' => false,
            'data' => null,
            'meta' => $meta,
            'errors' => $errors,
        ], $statusCode);
    }
}
