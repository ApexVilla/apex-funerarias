<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Repositories\FrotaRepository;
use App\Support\ApiContext;
use App\Support\Database;
use App\Support\JsonResponse;
use App\Support\Pagination;
use App\Support\Request;

final class FrotaController
{
    public static function veiculos(): void
    {
        self::list('veiculos');
    }

    public static function motoristas(): void
    {
        self::list('motoristas');
    }

    public static function abastecimentos(): void
    {
        self::list('abastecimentos');
    }

    public static function manutencoes(): void
    {
        self::list('manutencoes');
    }

    public static function viagens(): void
    {
        self::list('viagens');
    }

    public static function detalhesViagem(string $id): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        $repo = new FrotaRepository(Database::pdo());
        $viagem = $repo->getViagem($id, $empresaId);

        if (!$viagem) {
            JsonResponse::fail(['Viagem nao encontrada.'], 404);
            return;
        }

        JsonResponse::ok($viagem);
    }

    public static function salvarViagem(?string $id = null): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        $data = Request::body();
        $repo = new FrotaRepository(Database::pdo());

        try {
            if ($id) {
                $repo->updateViagem($id, $empresaId, $data);
                JsonResponse::ok(['message' => 'Viagem atualizada com sucesso.']);
            } else {
                $newId = $repo->createViagem($empresaId, $data);
                JsonResponse::ok(['message' => 'Viagem criada com sucesso.', 'id' => $newId], [], 201);
            }
        } catch (\RuntimeException $e) {
            JsonResponse::fail([$e->getMessage()], 422);
        } catch (\Throwable $e) {
            error_log('[FrotaController::salvarViagem] ' . $e->getMessage());
            $debug = strtolower(trim((string) \App\Support\Env::get('APP_DEBUG', 'false')));
            $expose = in_array($debug, ['1', 'true', 'yes', 'on'], true);
            JsonResponse::fail([$expose ? 'Erro ao salvar viagem: ' . $e->getMessage() : 'Erro interno ao salvar viagem.'], 500);
        }
    }

    public static function gastos(): void
    {
        self::list('gastos');
    }

    private static function list(string $resource): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        $repo = new FrotaRepository(Database::pdo());
        $pagination = Pagination::fromQuery();
        $query = Request::query();
        $filters = [
            'search' => $query['search'] ?? null,
            'status' => $query['status'] ?? null,
        ];

        $sqlFrom = match ($resource) {
            'veiculos' => $repo->fromVeiculos(),
            'motoristas' => $repo->fromMotoristas(),
            'abastecimentos' => $repo->fromAbastecimentos(),
            'manutencoes' => $repo->fromManutencoes(),
            'viagens' => $repo->fromViagens(),
            'gastos' => $repo->fromGastos(),
            default => '',
        };

        if ($sqlFrom === '') {
            JsonResponse::fail(['Recurso nao encontrado.'], 404);
            return;
        }

        $result = $repo->list($sqlFrom, $empresaId, $filters, $pagination['per_page'], $pagination['offset']);

        JsonResponse::ok($result['rows'], [
            'page' => $pagination['page'],
            'per_page' => $pagination['per_page'],
            'total' => $result['total'],
            'total_pages' => (int) ceil(($result['total'] ?: 1) / $pagination['per_page']),
            'resource' => $resource,
        ]);
    }
}
