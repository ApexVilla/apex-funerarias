<?php

declare(strict_types=1);

use App\Support\Database;
use App\Support\Env;

require_once __DIR__ . '/../src/Support/Env.php';
require_once __DIR__ . '/../src/Support/Database.php';

Env::load(__DIR__ . '/../.env');

$confirm = in_array('--confirm', $argv, true);
$wipeModules = in_array('--wipe-modules', $argv, true);

$allowedCodes = ['FENIX-APARECIDA', 'FENIX-CATALAO', 'FENIX-IPAMERI'];
$moduleTables = [
    'public.cob_cobranca_acoes',
    'public.cob_cobrancas_pendentes',
    'public.frota_abastecimentos',
    'public.frota_manutencoes',
    'public.frota_viagens',
    'public.frota_gastos',
    'public.frota_motoristas',
    'public.frota_veiculos',
];

echo "== Cleanup Producao ==\n";
echo $confirm ? "MODO: EXECUCAO REAL\n" : "MODO: DRY-RUN (sem alterar dados)\n";
echo $wipeModules ? "LIMPEZA EXTRA: modulo cobranca/frota sera zerado nas empresas reais\n" : "LIMPEZA EXTRA: desativada\n";

$pdo = Database::pdo();
$pdo->beginTransaction();

try {
    $in = implode("','", $allowedCodes);
    $sqlAllowed = "select id, codigo, nome from public.empresas where codigo in ('$in')";
    $allowedRows = $pdo->query($sqlAllowed)->fetchAll(PDO::FETCH_ASSOC);

    if (count($allowedRows) !== count($allowedCodes)) {
        throw new RuntimeException('Nem todas as empresas permitidas foram encontradas. Abortando.');
    }

    $allowedIds = array_map(static fn(array $row) => $row['id'], $allowedRows);
    $allowedIdsSql = "'" . implode("','", $allowedIds) . "'";

    echo "\nEmpresas permitidas:\n";
    foreach ($allowedRows as $row) {
        echo "- {$row['codigo']} ({$row['id']})\n";
    }

    foreach ($moduleTables as $table) {
        $countSql = "select count(*)::int as total from $table where empresa_id not in ($allowedIdsSql)";
        $total = (int) ($pdo->query($countSql)->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);
        echo "\n$table -> registros fora das empresas reais: $total";

        if ($confirm && $total > 0) {
            $delSql = "delete from $table where empresa_id not in ($allowedIdsSql)";
            $pdo->exec($delSql);
            echo " | removidos";
        }
    }

    if ($wipeModules) {
        echo "\n\nLimpando dados operacionais dos modulos novos nas empresas reais...\n";
        foreach ($moduleTables as $table) {
            $countSql = "select count(*)::int as total from $table where empresa_id in ($allowedIdsSql)";
            $total = (int) ($pdo->query($countSql)->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);
            echo "$table -> registros em empresas reais: $total";

            if ($confirm && $total > 0) {
                $delSql = "delete from $table where empresa_id in ($allowedIdsSql)";
                $pdo->exec($delSql);
                echo " | removidos";
            }
            echo "\n";
        }
    }

    if ($confirm) {
        $pdo->commit();
        echo "\n\nConcluido com sucesso.\n";
    } else {
        $pdo->rollBack();
        echo "\n\nDry-run concluido. Nenhuma alteracao aplicada.\n";
        echo "Use --confirm para executar de verdade.\n";
    }
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "\nERRO: " . $exception->getMessage() . "\n");
    exit(1);
}
