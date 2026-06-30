<?php

declare(strict_types=1);

namespace App\Support;

final class Request
{
    private const MAX_BODY_BYTES = 1_048_576; // 1 MB

    /**
     * @return array<string, mixed>
     */
    public static function query(): array
    {
        return $_GET;
    }

    /**
     * @return array<string, mixed>
     */
    public static function body(): array
    {
        $raw = file_get_contents('php://input', false, null, 0, self::MAX_BODY_BYTES);
        if ($raw === false || $raw === '') {
            return [];
        }

        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    public static function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $value = $_SERVER[$key] ?? null;
        return is_string($value) && $value !== '' ? $value : null;
    }
}
