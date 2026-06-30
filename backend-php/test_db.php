<?php

declare(strict_types=1);

require_once __DIR__ . '/src/Support/Env.php';
require_once __DIR__ . '/src/Support/Database.php';

use App\Support\Env;
use App\Support\Database;

Env::load(__DIR__ . '/.env');

try {
    echo "Iniciando conexão...\n";
    $pdo = Database::pdo();
    echo "Conexão estabelecida com sucesso!\n";
    
    // Fazer uma query simples
    $stmt = $pdo->query("SELECT NOW()");
    $time = $stmt->fetchColumn();
    echo "Hora do banco de dados: " . $time . "\n";
} catch (\Throwable $e) {
    echo "Erro na conexão:\n";
    echo $e->getMessage() . "\n";
}
