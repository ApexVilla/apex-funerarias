<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;
use RuntimeException;

final class FrotaRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    private static function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }

    /**
     * Lista paginada de qualquer recurso da frota.
     * Usa count(*) OVER() para obter total sem query separada.
     *
     * @return array{rows:array<int, array<string,mixed>>,total:int}
     */
    public function list(string $sqlFrom, string $empresaId, array $filters, int $limit, int $offset): array
    {
        $params = ['empresa_id' => $empresaId];
        $where  = ['base.empresa_id = :empresa_id'];

        if (!empty($filters['status'])) {
            $where[]          = 'base.status = :status';
            $params['status'] = (string) $filters['status'];
        }

        if (!empty($filters['search'])) {
            $where[]          = '(coalesce(base.codigo, \'\') ilike :search or coalesce(base.descricao, \'\') ilike :search or coalesce(base.placa, \'\') ilike :search or coalesce(base.nome, \'\') ilike :search)';
            $params['search'] = '%' . self::escapeLike((string) $filters['search']) . '%';
        }

        $whereSql = implode(' and ', $where);

        $sql = "select base.*, count(*) over() as _total
                from ($sqlFrom) base
                where $whereSql
                order by coalesce(base.updated_at, base.created_at) desc
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

    public function fromVeiculos(): string
    {
        return "select
            v.id, v.empresa_id, v.placa, v.modelo, v.marca, v.ano, v.tipo, v.status,
            v.cor, v.combustivel, v.km_atual, v.km_ultima_revisao, v.km_proxima_revisao,
            v.vencimento_crlv, v.vencimento_seguro, v.observacao, v.created_at, v.updated_at,
            null::text as codigo, null::text as descricao, null::text as nome
          from public.frota_veiculos v";
    }

    public function fromMotoristas(): string
    {
        return "select
            m.id, m.empresa_id, m.nome, m.cpf, m.telefone, m.status, m.categoria_cnh,
            m.numero_cnh, m.vencimento_cnh, m.data_admissao, m.total_viagens, m.km_total,
            v.placa as veiculo_placa, m.created_at, m.updated_at,
            null::text as codigo, null::text as descricao, null::text as placa
          from public.frota_motoristas m
          left join public.frota_veiculos v on v.id = m.veiculo_padrao_id";
    }

    public function fromAbastecimentos(): string
    {
        return "select
            a.id, a.empresa_id, a.data_abastecimento, a.km_atual, a.km_anterior, a.litros,
            a.valor_litro, a.valor_total, a.combustivel, a.posto, a.nota_fiscal, a.observacao,
            v.placa, v.modelo, m.nome as motorista_nome, a.created_at, a.created_at as updated_at,
            null::text as codigo, coalesce(a.observacao, a.posto) as descricao, null::text as status, null::text as nome
          from public.frota_abastecimentos a
          join public.frota_veiculos v on v.id = a.veiculo_id
          left join public.frota_motoristas m on m.id = a.motorista_id";
    }

    public function fromManutencoes(): string
    {
        return "select
            m.id, m.empresa_id, m.tipo, m.status, m.descricao, m.oficina, m.data_entrada, m.data_previsao,
            m.data_conclusao, m.km_entrada, m.valor_estimado, m.valor_final, m.responsavel, m.itens,
            v.placa, v.modelo, mo.nome as motorista_nome, m.created_at, m.updated_at, null::text as codigo, null::text as nome
          from public.frota_manutencoes m
          join public.frota_veiculos v on v.id = m.veiculo_id
          left join public.frota_motoristas mo on mo.id = m.motorista_id";
    }

    public function fromViagens(): string
    {
        return "select
            vg.id, vg.empresa_id, vg.codigo, vg.tipo, vg.status, vg.origem, vg.destino, vg.data_saida,
            vg.hora_saida, vg.data_retorno, vg.hora_retorno, vg.km_saida, vg.km_retorno, vg.passageiros,
            vg.observacao as descricao, vg.paradas, vg.atendimento_id,
            v.placa, v.modelo, m.nome as motorista_nome,
            atd.codigo as atendimento_codigo,
            vg.created_at, vg.updated_at, null::text as nome
          from public.frota_viagens vg
          join public.frota_veiculos v on v.id = vg.veiculo_id
          left join public.frota_motoristas m on m.id = vg.motorista_id
          left join public.ser_atendimentos atd on atd.id = vg.atendimento_id";
    }

    public function getViagem(string $id, string $empresaId): ?array
    {
        $sqlFrom = $this->fromViagens();
        $sql     = "select * from ($sqlFrom) base where base.id = :id and base.empresa_id = :empresa_id limit 1";
        $stmt    = $this->pdo->prepare($sql);
        $stmt->execute(['id' => $id, 'empresa_id' => $empresaId]);
        return $stmt->fetch() ?: null;
    }

    public function fromGastos(): string
    {
        return "select
            g.id, g.empresa_id, g.categoria as tipo, g.descricao, g.valor, g.data_gasto, g.km_registro, g.nota_fiscal,
            v.placa, v.modelo, m.nome as motorista_nome, g.created_at, g.updated_at,
            null::text as codigo, null::text as status, null::text as nome
          from public.frota_gastos g
          left join public.frota_veiculos v on v.id = g.veiculo_id
          left join public.frota_motoristas m on m.id = g.motorista_id";
    }

    private function validarVeiculo(string $empresaId, string $veiculoId): void
    {
        $stmt = $this->pdo->prepare(
            'SELECT 1 FROM public.frota_veiculos WHERE id = :id AND empresa_id = :empresa_id LIMIT 1'
        );
        $stmt->execute(['id' => $veiculoId, 'empresa_id' => $empresaId]);
        if (!$stmt->fetch()) {
            throw new RuntimeException('Veículo não pertence a esta empresa.');
        }
    }

    /**
     * Valida FKs opcionais da viagem (motorista, atendimento) contra a empresa
     * do request, evitando IDOR ao referenciar registros de outro tenant.
     *
     * @param array<string, mixed> $data
     */
    private function validarReferenciasViagem(string $empresaId, array $data): void
    {
        $motoristaId = trim((string) ($data['motorista_id'] ?? ''));
        if ($motoristaId !== '') {
            $stmt = $this->pdo->prepare(
                'SELECT 1 FROM public.frota_motoristas WHERE id = :id AND empresa_id = :empresa_id LIMIT 1'
            );
            $stmt->execute(['id' => $motoristaId, 'empresa_id' => $empresaId]);
            if (!$stmt->fetch()) {
                throw new RuntimeException('Motorista não pertence a esta empresa.');
            }
        }

        $atendimentoId = trim((string) ($data['atendimento_id'] ?? ''));
        if ($atendimentoId !== '') {
            $stmt = $this->pdo->prepare(
                'SELECT 1 FROM public.ser_atendimentos WHERE id = :id AND empresa_id = :empresa_id LIMIT 1'
            );
            $stmt->execute(['id' => $atendimentoId, 'empresa_id' => $empresaId]);
            if (!$stmt->fetch()) {
                throw new RuntimeException('Atendimento não pertence a esta empresa.');
            }
        }
    }

    public function createViagem(string $empresaId, array $data): string
    {
        $veiculoId = trim((string) ($data['veiculo_id'] ?? ''));
        if ($veiculoId === '') {
            throw new RuntimeException('veiculo_id é obrigatório.');
        }
        $this->validarVeiculo($empresaId, $veiculoId);
        $this->validarReferenciasViagem($empresaId, $data);

        $sql = "insert into public.frota_viagens (
            empresa_id, codigo, veiculo_id, motorista_id, tipo, status,
            origem, destino, data_saida, hora_saida, data_retorno, hora_retorno,
            km_saida, km_retorno, passageiros, observacao, paradas, atendimento_id
        ) values (
            :empresa_id, :codigo, :veiculo_id, :motorista_id, :tipo, :status,
            :origem, :destino, :data_saida, :hora_saida, :data_retorno, :hora_retorno,
            :km_saida, :km_retorno, :passageiros, :observacao, :paradas, :atendimento_id
        ) returning id";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            'empresa_id'     => $empresaId,
            'codigo'         => $data['codigo'] ?? ('VG-' . strtoupper(substr(uniqid(), -6))),
            'veiculo_id'     => $veiculoId,
            'motorista_id'   => $data['motorista_id'] ?? null,
            'tipo'           => $data['tipo'] ?? 'servico',
            'status'         => $data['status'] ?? 'agendada',
            'origem'         => $data['origem'] ?? null,
            'destino'        => $data['destino'] ?? null,
            'data_saida'     => $data['data_saida'] ?? null,
            'hora_saida'     => $data['hora_saida'] ?? null,
            'data_retorno'   => $data['data_retorno'] ?? null,
            'hora_retorno'   => $data['hora_retorno'] ?? null,
            'km_saida'       => $data['km_saida'] ?? 0,
            'km_retorno'     => $data['km_retorno'] ?? null,
            'passageiros'    => $data['passageiros'] ?? 0,
            'observacao'     => $data['observacao'] ?? null,
            'paradas'        => json_encode($data['paradas'] ?? []),
            'atendimento_id' => $data['atendimento_id'] ?? null,
        ]);

        return (string) $stmt->fetchColumn();
    }

    public function updateViagem(string $id, string $empresaId, array $data): void
    {
        $existing = $this->getViagem($id, $empresaId);
        if (!$existing) {
            throw new RuntimeException('Viagem não encontrada.');
        }

        $merged    = array_merge($existing, $data);
        $veiculoId = trim((string) ($merged['veiculo_id'] ?? ''));

        if ($veiculoId === '') {
            throw new RuntimeException('veiculo_id é obrigatório.');
        }

        if ($veiculoId !== trim((string) ($existing['veiculo_id'] ?? ''))) {
            $this->validarVeiculo($empresaId, $veiculoId);
        }
        $this->validarReferenciasViagem($empresaId, $merged);

        $observacao = $merged['observacao'] ?? ($merged['descricao'] ?? null);

        $sql = "update public.frota_viagens set
            veiculo_id     = :veiculo_id,
            motorista_id   = :motorista_id,
            tipo           = :tipo,
            status         = :status,
            origem         = :origem,
            destino        = :destino,
            data_saida     = :data_saida,
            hora_saida     = :hora_saida,
            data_retorno   = :data_retorno,
            hora_retorno   = :hora_retorno,
            km_saida       = :km_saida,
            km_retorno     = :km_retorno,
            passageiros    = :passageiros,
            observacao     = :observacao,
            paradas        = :paradas,
            atendimento_id = :atendimento_id,
            updated_at     = now()
        where id = :id and empresa_id = :empresa_id";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            'id'             => $id,
            'empresa_id'     => $empresaId,
            'veiculo_id'     => $veiculoId,
            'motorista_id'   => $merged['motorista_id'] ?? null,
            'tipo'           => $merged['tipo'] ?? 'servico',
            'status'         => $merged['status'] ?? 'agendada',
            'origem'         => $merged['origem'] ?? null,
            'destino'        => $merged['destino'] ?? null,
            'data_saida'     => $merged['data_saida'] ?? null,
            'hora_saida'     => $merged['hora_saida'] ?? null,
            'data_retorno'   => $merged['data_retorno'] ?? null,
            'hora_retorno'   => $merged['hora_retorno'] ?? null,
            'km_saida'       => $merged['km_saida'] ?? 0,
            'km_retorno'     => $merged['km_retorno'] ?? null,
            'passageiros'    => $merged['passageiros'] ?? 0,
            'observacao'     => $observacao,
            'paradas'        => json_encode($merged['paradas'] ?? []),
            'atendimento_id' => $merged['atendimento_id'] ?? null,
        ]);
    }
}
