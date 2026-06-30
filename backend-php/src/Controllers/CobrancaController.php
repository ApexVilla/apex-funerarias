<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Repositories\CobrancaRepository;
use App\Repositories\RecebimentosRepository;
use App\Support\ApiAuth;
use App\Support\ApiContext;
use App\Support\Database;
use App\Support\JsonResponse;
use App\Support\Pagination;
use App\Support\Request;
use RuntimeException;

final class CobrancaController
{
    public static function pendentes(): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        $pagination = Pagination::fromQuery();
        $query = Request::query();

        $repo = new CobrancaRepository(Database::pdo());
        $result = $repo->pendentes(
            $empresaId,
            [
                'status' => $query['status'] ?? null,
                'prioridade' => $query['prioridade'] ?? null,
                'search' => $query['search'] ?? null,
            ],
            $pagination['per_page'],
            $pagination['offset']
        );

        JsonResponse::ok($result['rows'], [
            'page' => $pagination['page'],
            'per_page' => $pagination['per_page'],
            'total' => $result['total'],
            'total_pages' => (int) ceil(($result['total'] ?: 1) / $pagination['per_page']),
        ]);
    }

    public static function criarAcao(): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        $user = ApiAuth::requireUser();
        $body = Request::body();
        $tipo = (string) ($body['tipo'] ?? '');
        if (!in_array($tipo, ['ligacao', 'whatsapp', 'email', 'promessa'], true)) {
            JsonResponse::fail(['Tipo de acao invalido.'], 422);
            return;
        }

        // Força user_id do token autenticado — nunca aceitar do body
        $body['user_id'] = $user['id'] !== 'dev-skip-auth' ? $user['id'] : null;

        $repo = new CobrancaRepository(Database::pdo());
        $repo->criarAcao($empresaId, $body);

        JsonResponse::ok(['message' => 'Acao registrada com sucesso.']);
    }

    public static function atribuirCarteira(): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        $body = Request::body();
        $cobradorId = trim((string) ($body['cobrador_id'] ?? ''));
        $clienteIds = $body['cliente_ids'] ?? [];

        $removerCarteira = $cobradorId === '__sem_cobrador__';

        if (!is_array($clienteIds) || count($clienteIds) === 0) {
            JsonResponse::fail(['Selecione ao menos um cliente para atribuir.'], 422);
            return;
        }

        $clienteIdsSanitizados = array_values(array_filter(
            array_map(
                static fn($id): string => trim((string) $id),
                $clienteIds
            ),
            static fn(string $id): bool => $id !== ''
        ));

        if (count($clienteIdsSanitizados) === 0) {
            JsonResponse::fail(['Selecione ao menos um cliente valido para atribuir.'], 422);
            return;
        }

        $atualizados = 0;
        try {
            $repo        = new CobrancaRepository(Database::pdo());
            $atualizados = $repo->atribuirCarteiraClientes(
                $empresaId,
                $removerCarteira ? null : $cobradorId,
                $clienteIdsSanitizados
            );
        } catch (\RuntimeException $e) {
            JsonResponse::fail([$e->getMessage()], 422);
            return;
        }

        JsonResponse::ok([
            'message' => 'Carteira atualizada com sucesso.',
            'total_atualizados' => $atualizados,
        ]);
    }

    public static function detalheRecebimento(string $id): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        $repo = new RecebimentosRepository(Database::pdo());
        $row = $repo->obter($empresaId, $id);
        if ($row === null) {
            JsonResponse::fail(['Recebimento não encontrado.'], 404);
            return;
        }

        JsonResponse::ok($row);
    }

    public static function criarRecebimento(): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        $user = ApiAuth::requireUser();
        $body = Request::body();

        try {
            $repo = new RecebimentosRepository(Database::pdo());
            $row = $repo->criar($empresaId, $body, $user['id'] !== 'dev-skip-auth' ? $user['id'] : null);
            JsonResponse::ok($row);
        } catch (RuntimeException $e) {
            JsonResponse::fail([$e->getMessage()], 422);
        }
    }

    public static function atualizarRecebimento(string $id): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        $body = Request::body();

        try {
            $repo = new RecebimentosRepository(Database::pdo());
            $row = $repo->atualizar($empresaId, $id, $body);
            JsonResponse::ok($row);
        } catch (RuntimeException $e) {
            $msg = $e->getMessage();
            $code = str_contains($msg, 'não encontrado') ? 404 : 422;
            JsonResponse::fail([$msg], $code);
        }
    }
}
