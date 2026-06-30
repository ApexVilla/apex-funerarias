<?php

declare(strict_types=1);

namespace App\Support;

final class ApiAuth
{
    /** @var array{id:string,email?:string}|null */
    private static ?array $cachedUser = null;

    /** @var array<string, true> cache de permissão por "userId|empresaId" no request atual */
    private static array $accessCache = [];

    public static function skipAuth(): bool
    {
        $flag = strtolower(trim((string) Env::get('APP_SKIP_AUTH', 'false')));
        return in_array($flag, ['1', 'true', 'yes', 'on'], true);
    }

    /**
     * @return array{id:string,email?:string}
     */
    public static function requireUser(): array
    {
        if (self::$cachedUser !== null) {
            return self::$cachedUser;
        }

        if (self::skipAuth()) {
            self::$cachedUser = ['id' => 'dev-skip-auth', 'email' => 'dev@local'];
            return self::$cachedUser;
        }

        $authHeader = Request::header('Authorization') ?? '';
        if (!str_starts_with(strtolower($authHeader), 'bearer ')) {
            JsonResponse::fail(['Sessão ausente. Faça login no sistema e tente novamente.'], 401);
            exit;
        }

        $token = trim(substr($authHeader, 7));
        if ($token === '') {
            JsonResponse::fail(['Token de autenticação inválido.'], 401);
            exit;
        }

        $supabaseUrl = rtrim((string) Env::get('SUPABASE_URL', ''), '/');
        $anonKey     = (string) Env::get('SUPABASE_ANON_KEY', '');
        if ($supabaseUrl === '' || $anonKey === '') {
            JsonResponse::fail(['Configure SUPABASE_URL e SUPABASE_ANON_KEY no .env do backend-php.'], 503);
            exit;
        }

        $response = self::httpGet($supabaseUrl . '/auth/v1/user', [
            'Authorization: Bearer ' . $token,
            'apikey: ' . $anonKey,
        ]);

        if ($response['status'] === 401 || $response['status'] === 403) {
            JsonResponse::fail(['Sessão expirada ou inválida. Entre novamente no sistema.'], 401);
            exit;
        }

        if ($response['status'] < 200 || $response['status'] >= 300) {
            JsonResponse::fail(['Não foi possível validar a sessão com o Supabase.'], 503);
            exit;
        }

        $body = json_decode($response['body'], true);
        if (!is_array($body) || empty($body['id'])) {
            JsonResponse::fail(['Resposta de autenticação inválida.'], 503);
            exit;
        }

        self::$cachedUser = [
            'id'    => (string) $body['id'],
            'email' => isset($body['email']) ? (string) $body['email'] : null,
        ];

        return self::$cachedUser;
    }

    /**
     * Valida que o usuário tem acesso à empresa.
     * Resultado é cacheado no escopo do request — só consulta o banco uma vez por par (user, empresa).
     */
    public static function assertEmpresaAccess(string $authUserId, string $empresaId): void
    {
        if (self::skipAuth()) {
            return;
        }

        $cacheKey = $authUserId . '|' . $empresaId;
        if (isset(self::$accessCache[$cacheKey])) {
            return;
        }

        $pdo  = Database::pdo();
        $stmt = $pdo->prepare(
            'SELECT u.empresa_id, u.permissoes
               FROM public.users u
              WHERE u.id = :uid
                AND u.ativo IS NOT DISTINCT FROM true
              LIMIT 1'
        );
        $stmt->execute(['uid' => $authUserId]);
        $row = $stmt->fetch();

        if (!$row) {
            JsonResponse::fail(['Usuário sem perfil no sistema.'], 403);
            exit;
        }

        $empresaCadastro = (string) ($row['empresa_id'] ?? '');
        if ($empresaCadastro === $empresaId) {
            self::$accessCache[$cacheKey] = true;
            return;
        }

        $perm = $row['permissoes'] ?? null;
        if (is_string($perm)) {
            $perm = json_decode($perm, true);
        }
        if (is_array($perm)) {
            $ctx = $perm['empresas_contexto'] ?? null;
            if (is_array($ctx) && !empty($ctx[$empresaId])) {
                self::$accessCache[$cacheKey] = true;
                return;
            }
        }

        $grp = $pdo->prepare(
            'SELECT me.role
               FROM public.users me
               INNER JOIN public.empresas em ON em.id = me.empresa_id
               INNER JOIN public.empresas ex ON ex.id = :eid
              WHERE me.id = :uid
                AND em.grupo_empresa_id IS NOT NULL
                AND em.grupo_empresa_id = ex.grupo_empresa_id
              LIMIT 1'
        );
        $grp->execute(['uid' => $authUserId, 'eid' => $empresaId]);
        $grpRow = $grp->fetch();

        if ($grpRow) {
            $role = strtolower((string) ($grpRow['role'] ?? ''));
            if (in_array($role, ['admin_sistema', 'admin_empresa', 'admin', 'diretoria', 'supervisao', 'gerente', 'financeiro'], true)) {
                self::$accessCache[$cacheKey] = true;
                return;
            }
        }

        JsonResponse::fail(['Sem permissão para operar nesta empresa.'], 403);
        exit;
    }

    /**
     * @param array<int,string> $headers
     * @return array{status:int,body:string}
     */
    private static function httpGet(string $url, array $headers): array
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER     => $headers,
                CURLOPT_TIMEOUT        => 10,
                CURLOPT_CONNECTTIMEOUT => 5,
            ]);
            $body   = (string) curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            return ['status' => $status, 'body' => $body];
        }

        $ctx  = stream_context_create([
            'http' => [
                'method'        => 'GET',
                'header'        => implode("\r\n", $headers),
                'timeout'       => 10,
                'ignore_errors' => true,
            ],
        ]);
        $body   = (string) @file_get_contents($url, false, $ctx);
        $status = 0;
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
            $status = (int) $m[1];
        }
        return ['status' => $status, 'body' => $body];
    }
}
