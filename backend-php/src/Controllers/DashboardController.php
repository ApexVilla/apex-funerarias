<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\ApiContext;
use App\Support\Database;
use App\Support\JsonResponse;
use PDO;

final class DashboardController
{
    public static function resumo(): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        /** @var PDO $pdo */
        $pdo = Database::pdo();

        // Parâmetros únicos por sub-query — PDO não garante comportamento correto
        // quando o mesmo nome de parâmetro aparece múltiplas vezes numa query.
        $sql = "SELECT
            (SELECT count(*)::int FROM public.clientes c
              WHERE c.empresa_id = :e1 AND c.deleted_at IS NULL)                              AS clientes,
            (SELECT count(*)::int FROM public.fin_contas_receber cr
              WHERE cr.empresa_id = :e2)                                                      AS contas_receber,
            (SELECT coalesce(sum(cr.valor_aberto_centavos), 0)::bigint
              FROM public.fin_contas_receber cr
              WHERE cr.empresa_id = :e3
                AND cr.status IN ('aberto', 'vencido', 'pago_parcial'))                       AS total_aberto_centavos,
            (SELECT count(*)::int FROM public.frota_veiculos fv
              WHERE fv.empresa_id = :e4)                                                      AS veiculos,
            (SELECT count(*)::int FROM public.cob_cobrancas_pendentes cp
              WHERE cp.empresa_id = :e5 AND cp.status <> 'cobrado')                           AS cobrancas_pendentes";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'e1' => $empresaId,
            'e2' => $empresaId,
            'e3' => $empresaId,
            'e4' => $empresaId,
            'e5' => $empresaId,
        ]);
        $row = $stmt->fetch() ?: [];

        JsonResponse::ok($row);
    }
}
