<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;
use RuntimeException;

final class CobrancaRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    private static function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }

    /**
     * @param array<string, mixed> $filters
     * @return array{rows:array<int, array<string,mixed>>,total:int}
     */
    public function pendentes(string $empresaId, array $filters, int $limit, int $offset): array
    {
        $params = ['empresa_id' => $empresaId];
        $where  = ['cp.empresa_id = :empresa_id'];

        if (!empty($filters['status'])) {
            $where[]          = 'cp.status = :status';
            $params['status'] = (string) $filters['status'];
        }

        if (!empty($filters['prioridade'])) {
            $where[]              = 'cp.prioridade = :prioridade';
            $params['prioridade'] = (string) $filters['prioridade'];
        }

        if (!empty($filters['search'])) {
            $where[]          = '(c.nome ilike :search or c.cpf ilike :search or fr.codigo ilike :search)';
            $params['search'] = '%' . self::escapeLike((string) $filters['search']) . '%';
        }

        $whereSql = implode(' and ', $where);

        // count(*) OVER() obtém o total na mesma passagem — elimina a query COUNT separada
        $sql = "select
                cp.id,
                cp.conta_receber_id,
                cp.status,
                cp.prioridade,
                cp.tentativas,
                cp.data_vencimento,
                cp.dias_atraso,
                cp.valor_centavos,
                cp.ultima_visita,
                cp.observacao,
                cp.updated_at,
                c.id  as cliente_id,
                c.nome as cliente_nome,
                c.cpf  as cliente_cpf,
                c.telefone_principal as cliente_telefone,
                coalesce(
                    nullif(trim(both from coalesce(c.endereco_cob_logradouro, '')), ''),
                    nullif(trim(both from coalesce(c.endereco_logradouro, '')), '')
                ) as cliente_logradouro,
                coalesce(
                    nullif(trim(both from coalesce(c.endereco_cob_bairro, '')), ''),
                    nullif(trim(both from coalesce(c.endereco_bairro, '')), '')
                ) as cliente_bairro,
                fr.codigo as parcela_codigo,
                u.nome    as cobrador_nome,
                count(*) over() as _total
            from public.cob_cobrancas_pendentes cp
            left join public.clientes c on c.id = cp.cliente_id
            left join public.fin_contas_receber fr on fr.id = cp.conta_receber_id
            left join public.users u on u.id = cp.cobrador_id
            where $whereSql
            order by cp.dias_atraso desc, cp.updated_at desc
            limit :limit offset :offset";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $rows  = $stmt->fetchAll();
        $total = isset($rows[0]['_total']) ? (int) $rows[0]['_total'] : 0;

        foreach ($rows as &$row) {
            unset($row['_total']);
        }
        unset($row);

        return ['rows' => $rows, 'total' => $total];
    }

    /**
     * @param array<string,mixed> $payload
     */
    public function criarAcao(string $empresaId, array $payload): void
    {
        $this->validarReferenciasAcao($empresaId, $payload);

        $sql = 'insert into public.cob_cobranca_acoes
            (empresa_id, cobranca_pendente_id, conta_receber_id, cliente_id, user_id, tipo, observacao, promessa_data, promessa_valor_centavos)
            values
            (:empresa_id, :cobranca_pendente_id, :conta_receber_id, :cliente_id, :user_id, :tipo, :observacao, :promessa_data, :promessa_valor_centavos)';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            'empresa_id'              => $empresaId,
            'cobranca_pendente_id'    => $payload['cobranca_pendente_id'] ?? null,
            'conta_receber_id'        => $payload['conta_receber_id'] ?? null,
            'cliente_id'              => $payload['cliente_id'] ?? null,
            'user_id'                 => $payload['user_id'] ?? null,
            'tipo'                    => $payload['tipo'] ?? null,
            'observacao'              => $payload['observacao'] ?? null,
            'promessa_data'           => $payload['promessa_data'] ?? null,
            'promessa_valor_centavos' => $payload['promessa_valor_centavos'] ?? null,
        ]);
    }

    /**
     * Garante que as FKs informadas pertencem à empresa do request (evita IDOR:
     * registrar ação de cobrança referenciando títulos/clientes de outro tenant).
     *
     * @param array<string, mixed> $payload
     */
    private function validarReferenciasAcao(string $empresaId, array $payload): void
    {
        $clienteId  = $payload['cliente_id'] ?? null;
        $pendenteId = $payload['cobranca_pendente_id'] ?? null;
        $contaId    = $payload['conta_receber_id'] ?? null;

        if ($clienteId !== null && $clienteId !== '') {
            $stmt = $this->pdo->prepare(
                'SELECT 1 FROM public.clientes WHERE id = :id AND empresa_id = :empresa_id LIMIT 1'
            );
            $stmt->execute(['id' => $clienteId, 'empresa_id' => $empresaId]);
            if (!$stmt->fetch()) {
                throw new RuntimeException('Cliente não pertence a esta empresa.');
            }
        }

        if ($pendenteId !== null && $pendenteId !== '') {
            $stmt = $this->pdo->prepare(
                'SELECT 1 FROM public.cob_cobrancas_pendentes WHERE id = :id AND empresa_id = :empresa_id LIMIT 1'
            );
            $stmt->execute(['id' => $pendenteId, 'empresa_id' => $empresaId]);
            if (!$stmt->fetch()) {
                throw new RuntimeException('Cobrança pendente não pertence a esta empresa.');
            }
        }

        if ($contaId !== null && $contaId !== '') {
            $stmt = $this->pdo->prepare(
                'SELECT 1 FROM public.fin_contas_receber
                  WHERE id = :id AND empresa_id = :empresa_id AND deleted_at IS NULL LIMIT 1'
            );
            $stmt->execute(['id' => $contaId, 'empresa_id' => $empresaId]);
            if (!$stmt->fetch()) {
                throw new RuntimeException('Título a receber não pertence a esta empresa.');
            }
        }
    }

    /**
     * Atribui cobrador às cobranças pendentes dos clientes informados.
     * Não altera contratos/assinaturas — apenas carteira de cobrança de campo.
     *
     * @param array<int,string> $clienteIds
     */
    public function atribuirCarteiraClientes(string $empresaId, ?string $cobradorId, array $clienteIds): int
    {
        if (count($clienteIds) === 0) {
            return 0;
        }

        if ($cobradorId !== null) {
            $chk = $this->pdo->prepare(
                'SELECT 1 FROM public.cobradores WHERE id = :id AND empresa_id = :empresa_id LIMIT 1'
            );
            $chk->execute(['id' => $cobradorId, 'empresa_id' => $empresaId]);
            if (!$chk->fetch()) {
                throw new RuntimeException('Cobrador não pertence a esta empresa.');
            }
        }

        $placeholders = [];
        $params       = ['empresa_id' => $empresaId, 'cobrador_id' => $cobradorId];

        foreach ($clienteIds as $index => $clienteId) {
            $key              = 'cliente_' . $index;
            $placeholders[]   = ':' . $key;
            $params[$key]     = $clienteId;
        }

        $sql = 'update public.cob_cobrancas_pendentes
            set cobrador_id = :cobrador_id,
                updated_at  = now()
            where empresa_id = :empresa_id
              and cliente_id in (' . implode(', ', $placeholders) . ')
              and status <> \'cobrado\'';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->rowCount();
    }
}
