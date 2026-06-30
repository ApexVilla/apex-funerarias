<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;
use RuntimeException;

final class RecebimentosRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listar(string $empresaId, ?string $mes = null, int $limit = 1000, int $offset = 0): array
    {
        // Teto de segurança para evitar varredura ilimitada da tabela em escala.
        $limit  = max(1, min(2000, $limit));
        $offset = max(0, $offset);

        $params = ['empresa_id' => $empresaId];
        $where  = ['r.empresa_id = :empresa_id'];

        if ($mes !== null && $mes !== '') {
            $where[]      = "to_char(r.data, 'YYYY-MM') = :mes";
            $params['mes'] = $mes;
        }

        $whereSql = implode(' AND ', $where);
        $sql = "SELECT
                r.id,
                r.data::text AS data,
                r.valor_centavos,
                r.forma_pagamento,
                r.status,
                r.cliente_id,
                r.cobrador_id,
                r.conta_receber_id,
                r.observacao,
                c.nome  AS cliente_nome,
                cb.nome AS cobrador_nome
            FROM public.cob_recebimentos_campo r
            JOIN public.clientes  c  ON c.id  = r.cliente_id  AND c.empresa_id  = r.empresa_id
            JOIN public.cobradores cb ON cb.id = r.cobrador_id AND cb.empresa_id = r.empresa_id
            WHERE {$whereSql}
            ORDER BY r.data DESC, r.created_at DESC
            LIMIT :limit OFFSET :offset";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function obter(string $empresaId, string $id): ?array
    {
        $sql = "SELECT
                r.id,
                r.empresa_id,
                r.conta_receber_id,
                r.cobranca_pendente_id,
                r.cliente_id,
                r.cobrador_id,
                r.data::text AS data,
                (r.valor_centavos::numeric / 100) AS valor,
                r.valor_centavos,
                r.forma_pagamento,
                r.status,
                r.observacao,
                c.nome  AS cliente_nome,
                cb.nome AS cobrador_nome
            FROM public.cob_recebimentos_campo r
            JOIN public.clientes  c  ON c.id  = r.cliente_id  AND c.empresa_id  = r.empresa_id
            JOIN public.cobradores cb ON cb.id = r.cobrador_id AND cb.empresa_id = r.empresa_id
            WHERE r.id = :id AND r.empresa_id = :empresa_id
            LIMIT 1";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute(['id' => $id, 'empresa_id' => $empresaId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    public function criar(string $empresaId, array $body, ?string $createdBy): array
    {
        $payload = $this->normalizarPayload($empresaId, $body);
        $this->validarReferencias($empresaId, $payload);

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'INSERT INTO public.cob_recebimentos_campo (
                    empresa_id, conta_receber_id, cobranca_pendente_id, cliente_id, cobrador_id,
                    data, valor_centavos, forma_pagamento, status, observacao, created_by
                ) VALUES (
                    :empresa_id, :conta_receber_id, :cobranca_pendente_id, :cliente_id, :cobrador_id,
                    :data, :valor_centavos, :forma_pagamento, :status, :observacao, :created_by
                ) RETURNING id'
            );
            $stmt->execute([
                'empresa_id'           => $empresaId,
                'conta_receber_id'     => $payload['conta_receber_id'],
                'cobranca_pendente_id' => $payload['cobranca_pendente_id'],
                'cliente_id'           => $payload['cliente_id'],
                'cobrador_id'          => $payload['cobrador_id'],
                'data'                 => $payload['data'],
                'valor_centavos'       => $payload['valor_centavos'],
                'forma_pagamento'      => $payload['forma_pagamento'],
                'status'               => $payload['status'],
                'observacao'           => $payload['observacao'],
                'created_by'           => $createdBy,
            ]);

            $id = (string) $stmt->fetchColumn();

            if ($payload['status'] === 'confirmado') {
                $this->marcarPendenciaCobrada($empresaId, $payload);
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $row = $this->obter($empresaId, $id);
        if ($row === null) {
            throw new RuntimeException('Recebimento criado mas não encontrado.');
        }
        return $row;
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    public function atualizar(string $empresaId, string $id, array $body): array
    {
        $atual = $this->obter($empresaId, $id);
        if ($atual === null) {
            throw new RuntimeException('Recebimento não encontrado.');
        }

        $payload = $this->normalizarPayload($empresaId, array_merge($atual, $body));
        $this->validarReferencias($empresaId, $payload);

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'UPDATE public.cob_recebimentos_campo SET
                    conta_receber_id = :conta_receber_id,
                    cliente_id       = :cliente_id,
                    cobrador_id      = :cobrador_id,
                    data             = :data,
                    valor_centavos   = :valor_centavos,
                    forma_pagamento  = :forma_pagamento,
                    status           = :status,
                    observacao       = :observacao,
                    updated_at       = now()
                WHERE id = :id AND empresa_id = :empresa_id'
            );
            $stmt->execute([
                'id'               => $id,
                'empresa_id'       => $empresaId,
                'conta_receber_id' => $payload['conta_receber_id'],
                'cliente_id'       => $payload['cliente_id'],
                'cobrador_id'      => $payload['cobrador_id'],
                'data'             => $payload['data'],
                'valor_centavos'   => $payload['valor_centavos'],
                'forma_pagamento'  => $payload['forma_pagamento'],
                'status'           => $payload['status'],
                'observacao'       => $payload['observacao'],
            ]);

            if ($payload['status'] === 'confirmado') {
                $this->marcarPendenciaCobrada($empresaId, $payload);
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $row = $this->obter($empresaId, $id);
        if ($row === null) {
            throw new RuntimeException('Recebimento atualizado mas não encontrado.');
        }
        return $row;
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    private function normalizarPayload(string $empresaId, array $body): array
    {
        $valorCentavosBody = isset($body['valor_centavos']) ? (int) $body['valor_centavos'] : 0;
        $valorCentavos     = $valorCentavosBody > 0
            ? $valorCentavosBody
            : (int) round((float) ($body['valor'] ?? 0) * 100);

        if ($valorCentavos <= 0) {
            throw new RuntimeException('Valor deve ser maior que zero.');
        }

        $forma = strtolower(trim((string) ($body['forma_pagamento'] ?? 'dinheiro')));
        if (!in_array($forma, ['dinheiro', 'pix', 'cartao', 'boleto', 'transferencia'], true)) {
            throw new RuntimeException('Forma de pagamento inválida.');
        }

        $status = strtolower(trim((string) ($body['status'] ?? 'pendente_conferencia')));
        if (!in_array($status, ['confirmado', 'pendente_conferencia'], true)) {
            throw new RuntimeException('Status inválido.');
        }

        $data = trim((string) ($body['data'] ?? date('Y-m-d')));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $data)) {
            throw new RuntimeException('Data inválida.');
        }

        $contaReceberId    = trim((string) ($body['conta_receber_id'] ?? ''));
        $cobrancaPendenteId = trim((string) ($body['cobranca_pendente_id'] ?? ''));

        return [
            'empresa_id'           => $empresaId,
            'conta_receber_id'     => $contaReceberId !== '' ? $contaReceberId : null,
            'cobranca_pendente_id' => $cobrancaPendenteId !== '' ? $cobrancaPendenteId : null,
            'cliente_id'           => trim((string) ($body['cliente_id'] ?? '')),
            'cobrador_id'          => trim((string) ($body['cobrador_id'] ?? '')),
            'data'                 => $data,
            'valor_centavos'       => $valorCentavos,
            'forma_pagamento'      => $forma,
            'status'               => $status,
            'observacao'           => trim((string) ($body['observacao'] ?? '')) ?: null,
        ];
    }

    /**
     * Valida cliente + cobrador numa única query e conta_receber em outra (se informada).
     * Reduz 2–3 round-trips para 1–2.
     *
     * @param array<string, mixed> $payload
     */
    private function validarReferencias(string $empresaId, array $payload): void
    {
        if ($payload['cliente_id'] === '' || $payload['cobrador_id'] === '') {
            throw new RuntimeException('Cliente e cobrador são obrigatórios.');
        }

        // Verifica cliente + cobrador num único SELECT
        $stmt = $this->pdo->prepare(
            'SELECT
                (SELECT 1 FROM public.clientes  WHERE id = :cliente_id  AND empresa_id = :e1 LIMIT 1) AS ok_cliente,
                (SELECT 1 FROM public.cobradores WHERE id = :cobrador_id AND empresa_id = :e2 LIMIT 1) AS ok_cobrador'
        );
        $stmt->execute([
            'cliente_id'  => $payload['cliente_id'],
            'cobrador_id' => $payload['cobrador_id'],
            'e1'          => $empresaId,
            'e2'          => $empresaId,
        ]);
        $chk = $stmt->fetch();

        if (!$chk || !$chk['ok_cliente']) {
            throw new RuntimeException('Cliente não pertence a esta empresa.');
        }
        if (!$chk['ok_cobrador']) {
            throw new RuntimeException('Cobrador não pertence a esta empresa.');
        }

        if ($payload['conta_receber_id']) {
            $chk2 = $this->pdo->prepare(
                'SELECT 1 FROM public.fin_contas_receber
                  WHERE id = :id AND empresa_id = :empresa_id AND deleted_at IS NULL LIMIT 1'
            );
            $chk2->execute(['id' => $payload['conta_receber_id'], 'empresa_id' => $empresaId]);
            if (!$chk2->fetch()) {
                throw new RuntimeException('Título a receber não pertence a esta empresa.');
            }
        }
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function marcarPendenciaCobrada(string $empresaId, array $payload): void
    {
        if ($payload['cobranca_pendente_id']) {
            $stmt = $this->pdo->prepare(
                "UPDATE public.cob_cobrancas_pendentes
                    SET status = 'cobrado', updated_at = now()
                  WHERE id = :id AND empresa_id = :empresa_id"
            );
            $stmt->execute(['id' => $payload['cobranca_pendente_id'], 'empresa_id' => $empresaId]);
            return;
        }

        if ($payload['conta_receber_id']) {
            $stmt = $this->pdo->prepare(
                "UPDATE public.cob_cobrancas_pendentes
                    SET status = 'cobrado', updated_at = now()
                  WHERE conta_receber_id = :cr_id AND empresa_id = :empresa_id"
            );
            $stmt->execute(['cr_id' => $payload['conta_receber_id'], 'empresa_id' => $empresaId]);
        }
    }
}
