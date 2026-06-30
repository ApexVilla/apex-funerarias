<?php

declare(strict_types=1);

use App\Controllers\AuthController;
use App\Controllers\CobrancaController;
use App\Controllers\CobradoresController;
use App\Controllers\CaixaController;
use App\Controllers\DashboardController;
use App\Controllers\FrotaController;
use App\Support\ApiAuth;
use App\Support\ApiContext;
use App\Support\Env;
use App\Support\JsonResponse;
use App\Support\RateLimiter;

spl_autoload_register(static function (string $class): void {
    $prefix = 'App\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $relative = substr($class, strlen($prefix));
    $path = __DIR__ . '/../src/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($path)) {
        require_once $path;
    }
});

Env::load(__DIR__ . '/../.env');

$appDebug = in_array(
    strtolower(trim((string) Env::get('APP_DEBUG', 'false'))),
    ['1', 'true', 'yes', 'on'],
    true
);

// Trava de seguranca: APP_SKIP_AUTH so pode existir em ambiente de
// desenvolvimento (APP_DEBUG=true). Em producao, abortar imediatamente
// para nunca servir requisicoes sem autenticacao.
if (ApiAuth::skipAuth() && !$appDebug) {
    JsonResponse::fail(['Configuracao insegura: APP_SKIP_AUTH ativo em producao.'], 500);
    exit;
}

// Headers de segurança HTTP
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-XSS-Protection: 0'); // Desativado — CSP é preferível

// CORS: sem default permissivo. Se ALLOWED_ORIGIN nao estiver configurado,
// nenhum header CORS e emitido (requisicoes same-origin continuam funcionando).
$allowedOrigin = trim((string) Env::get('ALLOWED_ORIGIN', ''));
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$corsOrigin = ($allowedOrigin === '*')
    ? '*'
    : (($allowedOrigin !== '' && $requestOrigin === $allowedOrigin) ? $allowedOrigin : '');

if ($corsOrigin !== '') {
    header("Access-Control-Allow-Origin: {$corsOrigin}");
    if ($corsOrigin !== '*') {
        header('Vary: Origin');
    }
}
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Empresa-Id');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

$publicRoutes = [
    'GET /health' => true,
    'POST /auth/login' => true,
];

try {
    $routeKey = $method . ' ' . $uri;
    $isPublic = isset($publicRoutes[$routeKey]);

    // Rate limit de login por IP (defesa contra brute-force de credenciais).
    if ($method === 'POST' && $uri === '/auth/login') {
        $loginMax = (int) Env::get('RATE_LIMIT_LOGIN_MAX', '20');
        if (!RateLimiter::allow('login:' . RateLimiter::clientIp(), $loginMax, 60)) {
            JsonResponse::fail(['Muitas tentativas de login. Tente novamente em instantes.'], 429);
            exit;
        }
    }

    if (!$isPublic) {
        $authUser = ApiAuth::requireUser();
        $empresaId = ApiContext::requireEmpresaId();
        ApiAuth::assertEmpresaAccess($authUser['id'], $empresaId);

        // Rate limit de escrita por IP+usuario (defesa em profundidade contra abuso).
        if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $writeMax = (int) Env::get('RATE_LIMIT_WRITE_MAX', '120');
            $rlKey = 'write:' . RateLimiter::clientIp() . ':' . ($authUser['id'] ?? 'anon');
            if (!RateLimiter::allow($rlKey, $writeMax, 60)) {
                JsonResponse::fail(['Limite de requisicoes excedido. Aguarde alguns segundos.'], 429);
                exit;
            }
        }
    }

    if ($method === 'GET' && $uri === '/health') {
        JsonResponse::ok(['ok' => true, 'service' => 'backend-php']);
        exit;
    }

    if ($method === 'POST' && $uri === '/auth/login') {
        AuthController::login();
        exit;
    }

    if (preg_match('/^\/financeiro\/caixa\/([a-f0-9-]+)\/imprimir$/i', $uri, $matches)) {
        if ($method === 'GET') {
            CaixaController::imprimir($matches[1]);
            exit;
        }
    }

    if ($method === 'GET' && $uri === '/dashboard/resumo') {
        DashboardController::resumo();
        exit;
    }

    if ($method === 'GET' && $uri === '/cobranca/pendentes') {
        CobrancaController::pendentes();
        exit;
    }

    if ($method === 'POST' && $uri === '/cobranca/acoes') {
        CobrancaController::criarAcao();
        exit;
    }

    if ($method === 'POST' && $uri === '/cobranca/carteira/atribuir') {
        CobrancaController::atribuirCarteira();
        exit;
    }

    if ($method === 'POST' && $uri === '/cobranca/recebimentos') {
        CobrancaController::criarRecebimento();
        exit;
    }

    if (preg_match('/^\/cobranca\/recebimentos\/([a-f0-9-]+)$/i', $uri, $matches)) {
        if ($method === 'GET') {
            CobrancaController::detalheRecebimento($matches[1]);
            exit;
        }
        if ($method === 'PUT') {
            CobrancaController::atualizarRecebimento($matches[1]);
            exit;
        }
    }

    if ($method === 'GET' && $uri === '/cobradores/lista') {
        CobradoresController::lista();
        exit;
    }

    if ($method === 'GET' && $uri === '/cobradores/recebimentos') {
        CobradoresController::recebimentos();
        exit;
    }

    if ($method === 'GET' && $uri === '/frota/veiculos') {
        FrotaController::veiculos();
        exit;
    }

    if ($method === 'GET' && $uri === '/frota/motoristas') {
        FrotaController::motoristas();
        exit;
    }

    if ($method === 'GET' && $uri === '/frota/abastecimentos') {
        FrotaController::abastecimentos();
        exit;
    }

    if ($method === 'GET' && $uri === '/frota/manutencoes') {
        FrotaController::manutencoes();
        exit;
    }

    if ($method === 'GET' && $uri === '/frota/viagens') {
        FrotaController::viagens();
        exit;
    }

    if ($method === 'POST' && $uri === '/frota/viagens') {
        FrotaController::salvarViagem();
        exit;
    }

    if (preg_match('/^\/frota\/viagens\/([a-f0-9-]+)$/i', $uri, $matches)) {
        if ($method === 'GET') {
            FrotaController::detalhesViagem($matches[1]);
            exit;
        }
        if ($method === 'PUT') {
            FrotaController::salvarViagem($matches[1]);
            exit;
        }
    }

    if ($method === 'GET' && $uri === '/frota/gastos') {
        FrotaController::gastos();
        exit;
    }

    JsonResponse::fail(['Rota nao encontrada.'], 404);
} catch (Throwable $exception) {
    // Sempre registra o erro real no log do servidor (com stack trace),
    // mas so expoe a mensagem ao cliente em modo debug.
    error_log(sprintf(
        '[backend-php] %s: %s em %s:%d',
        get_class($exception),
        $exception->getMessage(),
        $exception->getFile(),
        $exception->getLine()
    ));
    JsonResponse::fail(
        [$appDebug ? ('Erro interno: ' . $exception->getMessage()) : 'Erro interno no servidor.'],
        500
    );
}
