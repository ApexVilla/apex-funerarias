<?php

declare(strict_types=1);

namespace App\Support;

final class Pagination
{
    /**
     * @return array{page:int,per_page:int,offset:int}
     */
    public static function fromQuery(): array
    {
        $query = Request::query();
        $page = max(1, (int) ($query['page'] ?? 1));
        $perPage = max(1, min(200, (int) ($query['per_page'] ?? 20)));
        $offset = ($page - 1) * $perPage;

        return ['page' => $page, 'per_page' => $perPage, 'offset' => $offset];
    }
}
