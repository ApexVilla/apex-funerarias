-- Altera a segurança da função para SECURITY DEFINER para evitar erros 403 (Forbidden)
-- ao executá-la com a role autenticada sem permissões diretas de escrita/exclusão nas tabelas.

ALTER FUNCTION public.fn_cob_carteira_upsert_pendencias_de_titulos(uuid) SECURITY DEFINER;
