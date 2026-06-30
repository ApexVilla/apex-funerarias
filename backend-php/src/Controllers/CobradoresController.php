<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Repositories\RecebimentosRepository;
use App\Support\ApiContext;
use App\Support\Database;
use App\Support\JsonResponse;
use App\Support\Pagination;
use App\Support\Request;

final class CobradoresController
{
    public static function lista(): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        $query = Request::query();
        $search = trim((string) ($query['search'] ?? ''));
        $status = trim((string) ($query['status'] ?? ''));

        $where = ['cb.empresa_id = :empresa_id'];
        $params = ['empresa_id' => $empresaId];

        if ($status !== '') {
            $where[] = 'cb.status = :status';
            $params['status'] = $status;
        }

        if ($search !== '') {
            $where[] = '(cb.nome ilike :search or cb.cpf ilike :search or cb.email ilike :search)';
            $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search);
            $params['search'] = '%' . $escaped . '%';
        }

        $whereSql = implode(' and ', $where);
        $sql = "select
                cb.id,
                cb.nome,
                coalesce(cb.email, '') as email,
                coalesce(cb.telefone, '') as telefone,
                cb.status,
                cb.comissao_percentual,
                cb.comissao_por_metodo,
                count(distinct cp.cliente_id)::int as total_clientes_ativos,
                coalesce(sum(cp.valor_centavos), 0)::bigint as total_cobrado_mes_centavos,
                coalesce(sum(case when cp.status = 'cobrado' then cp.valor_centavos else 0 end), 0)::bigint as total_recebido_mes_centavos
            from public.cobradores cb
            left join public.cob_cobrancas_pendentes cp
              on cp.cobrador_id = cb.id
             and cp.empresa_id = cb.empresa_id
            where {$whereSql}
            group by cb.id, cb.nome, cb.email, cb.telefone, cb.status, cb.comissao_percentual, cb.comissao_por_metodo
            order by cb.nome asc";

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        JsonResponse::ok($stmt->fetchAll());
    }

    public static function recebimentos(): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        $mes = trim((string) (Request::query()['mes'] ?? ''));
        $query = Request::query();
        $temPaginacao = isset($query['page']) || isset($query['per_page']);
        $repo = new RecebimentosRepository(Database::pdo());

        if ($temPaginacao) {
            $pg = Pagination::fromQuery();
            JsonResponse::ok($repo->listar(
                $empresaId,
                $mes !== '' ? $mes : null,
                $pg['per_page'],
                $pg['offset'],
            ));
            return;
        }

        // Sem paginação explícita: mantém contrato (array plano) com teto de seguranca.
        JsonResponse::ok($repo->listar($empresaId, $mes !== '' ? $mes : null));
    }
}
