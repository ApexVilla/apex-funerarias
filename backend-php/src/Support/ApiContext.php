<?php

declare(strict_types=1);

namespace App\Support;

/**
 * ApiContext — extrai e valida o contexto da requisição.
 *
 * SEGURANÇA: empresa_id é aceito APENAS via header HTTP (X-Empresa-Id).
 * Fallback via query string ou body foi removido para prevenir injeção de
 * empresa_id por usuários não autorizados.
 *
 * O header deve ser definido pelo frontend autenticado (backendApi.ts),
 * que obtém o empresaId do contexto React após login no Supabase Auth.
 */
final class ApiContext
{
    /**
     * Retorna o empresa_id somente do header X-Empresa-Id.
     * Retorna null se o header não estiver presente ou for vazio.
     */
    public static function empresaId(): ?string
    {
        $value = Request::header('X-Empresa-Id');
        if (!is_string($value) || $value === '') {
            return null;
        }

        // UUID (v4 ou gerado pelo Postgres/Supabase)
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $value)) {
            return null;
        }

        return $value;
    }

    /**
     * Retorna o empresa_id ou lança uma resposta de erro 401.
     */
    public static function requireEmpresaId(): string
    {
        $id = self::empresaId();
        if ($id === null) {
            JsonResponse::fail(['Header X-Empresa-Id ausente ou invalido.'], 401);
            exit;
        }
        return $id;
    }
}
