<?php
/**
 * src/Application/Actions/Financeiro/ImprimirCaixaAction.php
 *
 * Rota: GET /financeiro/caixa/{id}/imprimir
 *
 * Busca os dados do caixa no banco, monta o payload e
 * chama o microserviço Python para gerar o PDF.
 */

declare(strict_types=1);

namespace App\Application\Actions\Financeiro;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use PDO;

class ImprimirCaixaAction
{
    private PDO    $db;
    private string $pdfServiceUrl;

    public function __construct(PDO $db, string $pdfServiceUrl = 'http://127.0.0.1:5050')
    {
        $this->db            = $db;
        $this->pdfServiceUrl = $pdfServiceUrl;
    }

    public function __invoke(Request $request, Response $response, array $args): Response
    {
        $caixaId  = (int) $args['id'];
        $filialId = (int) ($request->getAttribute('filial_id') ?? 0); // vindo do JWT/middleware

        /* ── 1. Cabeçalho do caixa ─────────────────────────── */
        $caixa = $this->db->prepare("
            SELECT c.*, ct.nome AS conta_nome, f.nome AS filial_nome
            FROM   caixas c
            JOIN   contas_tesouraria ct ON ct.id = c.conta_id
            JOIN   filiais f            ON f.id  = c.filial_id
            WHERE  c.id = :id AND c.filial_id = :filial
        ");
        $caixa->execute([':id' => $caixaId, ':filial' => $filialId]);
        $cab = $caixa->fetch(PDO::FETCH_ASSOC);

        if (!$cab) {
            $response->getBody()->write(json_encode(['erro' => 'Caixa não encontrado']));
            return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
        }

        /* ── 2. Lançamentos ────────────────────────────────── */
        $stmt = $this->db->prepare("
            SELECT
                TO_CHAR(data_hora, 'DD/MM/YYYY HH24:MI:SS') AS data,
                forma_pagamento                              AS forma,
                tipo,
                CASE WHEN tipo = 'ENTRADA' THEN valor ELSE NULL END AS entrada,
                CASE WHEN tipo = 'SAIDA'   THEN valor ELSE NULL END AS saida,
                historico,
                usuario
            FROM   lancamentos_caixa
            WHERE  caixa_id = :id
            ORDER  BY data_hora
        ");
        $stmt->execute([':id' => $caixaId]);
        $lancamentos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Converte strings numéricas para float (PDO retorna string por padrão)
        $lancamentos = array_map(function ($l) {
            $l['entrada'] = $l['entrada'] !== null ? (float) $l['entrada'] : null;
            $l['saida']   = $l['saida']   !== null ? (float) $l['saida']   : null;
            return $l;
        }, $lancamentos);

        /* ── 3. Totais por forma ───────────────────────────── */
        $stmt2 = $this->db->prepare("
            SELECT
                forma_pagamento                            AS forma,
                SUM(CASE WHEN tipo='ENTRADA' THEN valor ELSE 0 END) AS entradas,
                SUM(CASE WHEN tipo='SAIDA'   THEN valor ELSE 0 END) AS saidas,
                SUM(CASE WHEN tipo='ENTRADA' THEN valor
                         WHEN tipo='SAIDA'   THEN -valor ELSE 0 END) AS liquido
            FROM   lancamentos_caixa
            WHERE  caixa_id = :id
            GROUP  BY forma_pagamento
            ORDER  BY forma_pagamento
        ");
        $stmt2->execute([':id' => $caixaId]);
        $totaisForma = $stmt2->fetchAll(PDO::FETCH_ASSOC);

        $totaisForma = array_map(fn($t) => [
            'forma'    => $t['forma'],
            'entradas' => (float) $t['entradas'],
            'saidas'   => (float) $t['saidas'] ?: null,
            'liquido'  => (float) $t['liquido'],
        ], $totaisForma);

        // Linha de TOTAL GERAL
        $totaisForma[] = [
            'forma'    => 'TOTAL GERAL',
            'entradas' => (float) $cab['total_entrada'],
            'saidas'   => (float) $cab['total_saida'],
            'liquido'  => (float) $cab['saldo_final'],
        ];

        /* ── 4. Payload para o microserviço Python ──────────── */
        $payload = [
            'conta'        => strtoupper($cab['conta_nome'] . ' — ' . ($cab['banco'] ?? '')),
            'filial'       => $cab['filial_nome'],
            'data_caixa'   => date('d/m/Y', strtotime($cab['data_caixa'])),
            'status'       => strtoupper($cab['status']),
            'impresso_em'  => date('d/m/Y, H:i:s'),
            'saldo_ant'    => (float) $cab['saldo_anterior'],
            'total_ent'    => (float) $cab['total_entrada'],
            'total_sai'    => (float) $cab['total_saida'],
            'saldo_fin'    => (float) $cab['saldo_final'],
            'lancamentos'  => $lancamentos,
            'totais_forma' => $totaisForma,
        ];

        /* ── 5. Chama o microserviço ─────────────────────────── */
        $ch = curl_init("{$this->pdfServiceUrl}/pdf/caixa");
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
        ]);
        $pdfBytes  = curl_exec($ch);
        $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !$pdfBytes) {
            $response->getBody()->write(json_encode(['erro' => 'Falha ao gerar PDF']));
            return $response->withStatus(502)->withHeader('Content-Type', 'application/json');
        }

        /* ── 6. Devolve o PDF ao browser ─────────────────────── */
        $nomeArquivo = "caixa_{$caixaId}_{$cab['filial_nome']}.pdf";

        $response->getBody()->write($pdfBytes);
        return $response
            ->withStatus(200)
            ->withHeader('Content-Type',        'application/pdf')
            ->withHeader('Content-Disposition', "inline; filename=\"{$nomeArquivo}\"")
            ->withHeader('Content-Length',      (string) strlen($pdfBytes));
    }
}
