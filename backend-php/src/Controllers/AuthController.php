<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\JsonResponse;

/**
 * AuthController — endpoint legado /auth/login.
 *
 * NOTA DE SEGURANÇA: A autenticação primária do sistema é feita pelo Supabase Auth no
 * frontend (React). Este endpoint PHP NÃO é utilizado por nenhuma rota protegida atual.
 * Ele é mantido apenas para compatibilidade com integrações externas e está desabilitado
 * por padrão — retorna 501 para evitar exposição de credenciais.
 *
 * Para reabilitar, remova o bloco de retorno antecipado e implemente validação JWT
 * real usando o secret do Supabase (https://supabase.com/docs/guides/auth/server-side).
 */
final class AuthController
{
    public static function login(): void
    {
        // Endpoint desabilitado — autenticação via Supabase Auth no frontend.
        // Remova este bloco APENAS após implementar validação JWT server-side.
        JsonResponse::fail(
            ['Autenticacao via API PHP desabilitada. Use o Supabase Auth.'],
            501
        );
    }
}
