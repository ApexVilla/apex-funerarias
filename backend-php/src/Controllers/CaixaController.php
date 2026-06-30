<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\ApiContext;
use App\Support\Database;
use App\Support\Env;
use App\Support\JsonResponse;
use PDO;
use Throwable;

final class CaixaController
{
    public static function imprimir(string $id): void
    {
        $empresaId = ApiContext::empresaId();
        if (!$empresaId) {
            JsonResponse::fail(['Informe empresa_id no header X-Empresa-Id.'], 422);
            return;
        }

        try {
            $pdo = Database::pdo();

            // 1. Cabeçalho do caixa (PDO::FETCH_ASSOC é o default da conexão)
            $stmtCab = $pdo->prepare(
                "SELECT s.*, cb.nome AS conta_nome, cb.banco_nome AS banco, e.nome AS filial_nome
                   FROM public.fin_caixa_sessoes s
                   JOIN public.fin_contas_bancarias cb ON cb.id = s.conta_bancaria_id
                   JOIN public.empresas e              ON e.id  = s.empresa_id
                  WHERE s.id = :id AND s.empresa_id = :empresa_id
                  LIMIT 1"
            );
            $stmtCab->execute(['id' => $id, 'empresa_id' => $empresaId]);
            $cab = $stmtCab->fetch();

            if (!$cab) {
                JsonResponse::fail(['Sessão de caixa não encontrada.'], 404);
                return;
            }

            // 2. Lançamentos — buscamos movimentos e totais por forma em query única com GROUP ROLLUP
            //    Para simplicidade, mantemos 2 queries mas removemos FETCH_ASSOC redundante
            $stmtMov = $pdo->prepare(
                "SELECT
                    to_char(m.created_at, 'DD/MM/YYYY HH24:MI:SS') AS data,
                    m.forma_pagamento                               AS forma,
                    m.tipo,
                    m.valor_centavos,
                    m.descricao                                     AS historico,
                    coalesce(u.nome, 'Sistema')                     AS usuario
                 FROM public.fin_caixa_movimentos m
                 LEFT JOIN public.users u ON u.id = m.usuario_id
                 WHERE m.sessao_id = :id
                 ORDER BY m.created_at ASC"
            );
            $stmtMov->execute(['id' => $id]);
            $movimentos = $stmtMov->fetchAll();

            $saldoAnterior = (float) $cab['saldo_abertura_centavos'] / 100.0;
            $totalEntrada  = 0.0;
            $totalSaida    = 0.0;
            $lancamentos   = [];

            foreach ($movimentos as $r) {
                $valor     = (float) $r['valor_centavos'] / 100.0;
                $isEntrada = in_array(strtolower(trim($r['tipo'])), ['entrada', 'suprimento'], true);

                if ($isEntrada) {
                    $totalEntrada += $valor;
                    $lancamentos[] = ['data' => $r['data'], 'forma' => self::normalizarForma($r['forma'] ?? ''), 'tipo' => 'ENTRADA', 'entrada' => $valor, 'saida' => null, 'historico' => $r['historico'] ?? '', 'usuario' => $r['usuario']];
                } else {
                    $totalSaida   += $valor;
                    $lancamentos[] = ['data' => $r['data'], 'forma' => self::normalizarForma($r['forma'] ?? ''), 'tipo' => 'SAIDA', 'entrada' => null, 'saida' => $valor, 'historico' => $r['historico'] ?? '', 'usuario' => $r['usuario']];
                }
            }

            $saldoFinal = $saldoAnterior + $totalEntrada - $totalSaida;

            // 3. Totais por forma de pagamento
            $stmtTot = $pdo->prepare(
                "SELECT
                    forma_pagamento AS forma,
                    sum(CASE WHEN tipo IN ('entrada', 'suprimento') THEN valor_centavos ELSE 0 END) AS entradas_centavos,
                    sum(CASE WHEN tipo IN ('saida', 'sangria')      THEN valor_centavos ELSE 0 END) AS saidas_centavos
                 FROM public.fin_caixa_movimentos
                 WHERE sessao_id = :id
                 GROUP BY forma_pagamento
                 ORDER BY forma_pagamento"
            );
            $stmtTot->execute(['id' => $id]);
            $totaisRows = $stmtTot->fetchAll();

            $totaisForma = [];
            foreach ($totaisRows as $t) {
                $ents = (float) $t['entradas_centavos'] / 100.0;
                $sais = (float) $t['saidas_centavos']   / 100.0;
                $totaisForma[] = [
                    'forma'    => self::normalizarForma($t['forma'] ?? ''),
                    'entradas' => $ents,
                    'saidas'   => $sais ?: null,
                    'liquido'  => $ents - $sais,
                ];
            }

            $totaisForma[] = [
                'forma'    => 'TOTAL GERAL',
                'entradas' => $totalEntrada,
                'saidas'   => $totalSaida ?: null,
                'liquido'  => $saldoFinal,
            ];

            // 4. Payload para o microserviço PDF (Python)
            $dataAbertura = strtotime((string) ($cab['data_abertura'] ?? ''));
            $payload = [
                'conta'        => strtoupper($cab['conta_nome'] . ($cab['banco'] ? ' — ' . $cab['banco'] : '')),
                'filial'       => $cab['filial_nome'] ?? '',
                'data_caixa'   => $dataAbertura ? date('d/m/Y', $dataAbertura) : '',
                'status'       => strtoupper($cab['status'] ?? 'ABERTO'),
                'impresso_em'  => date('d/m/Y, H:i:s'),
                'saldo_ant'    => $saldoAnterior,
                'total_ent'    => $totalEntrada,
                'total_sai'    => $totalSaida,
                'saldo_fin'    => $saldoFinal,
                'lancamentos'  => $lancamentos,
                'totais_forma' => $totaisForma,
            ];

            // 5. Envia para o microserviço Python
            $pdfServiceUrl = rtrim((string) Env::get('PDF_SERVICE_URL', 'http://127.0.0.1:5050'), '/');
            $ch = curl_init("{$pdfServiceUrl}/pdf/caixa");
            curl_setopt_array($ch, [
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
                CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 30,
                CURLOPT_CONNECTTIMEOUT => 5,
            ]);
            $pdfBytes = curl_exec($ch);
            $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200 || !is_string($pdfBytes) || $pdfBytes === '') {
                JsonResponse::fail(['Falha ao gerar o PDF com o serviço de relatórios.'], 502);
                return;
            }

            // 6. Devolve o PDF gerado
            $filial   = preg_replace('/[^a-zA-Z0-9_-]/', '_', (string) ($cab['filial_nome'] ?? 'caixa'));
            $dateSuffix = $dataAbertura ? date('Ymd_His', $dataAbertura) : date('Ymd_His');
            $nomeArquivo = "caixa_{$dateSuffix}_{$filial}.pdf";

            header('Content-Type: application/pdf');
            header("Content-Disposition: inline; filename=\"{$nomeArquivo}\"");
            header('Content-Length: ' . strlen($pdfBytes));
            echo $pdfBytes;
            exit;

        } catch (Throwable $e) {
            error_log('[CaixaController::imprimir] ' . $e->getMessage());
            $debug  = strtolower(trim((string) Env::get('APP_DEBUG', 'false')));
            $expose = in_array($debug, ['1', 'true', 'yes', 'on'], true);
            JsonResponse::fail([
                $expose ? 'Erro no CaixaController: ' . $e->getMessage() : 'Erro interno ao gerar relatório do caixa.'
            ], 500);
        }
    }

    private static function normalizarForma(string $forma): string
    {
        return match (strtolower(trim($forma))) {
            'especie', 'dinheiro' => 'DINHEIRO',
            'pix'                 => 'PIX',
            'cartao_credito'      => 'CARTÃO DE CRÉDITO',
            'cartao_debito'       => 'CARTÃO DE DÉBITO',
            'boleto'              => 'BOLETO',
            'transferencia'       => 'TRANSFERÊNCIA',
            default               => strtoupper($forma),
        };
    }
}
