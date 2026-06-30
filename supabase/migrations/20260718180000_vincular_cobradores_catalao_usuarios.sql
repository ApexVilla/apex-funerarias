-- Vincula logins de cobrador (Catalão) ao cadastro em cobradores quando o nome coincide.
-- Corrige mensagem "usuário não está vinculado" quando o e-mail do login difere do cadastro.

UPDATE public.cobradores c
SET
  usuario_id = u.id,
  updated_at = now()
FROM public.users u
WHERE c.usuario_id IS NULL
  AND c.status = 'ativo'
  AND u.ativo IS TRUE
  AND u.role = 'cobrador'
  AND public.fn_normalizar_unidade_txt(c.nome) = public.fn_normalizar_unidade_txt(u.nome)
  AND (
    c.area_atuacao ILIKE '%catal%'
    OR EXISTS (
      SELECT 1
      FROM public.filiais f
      WHERE f.id = c.filial_id
        AND f.nome ILIKE '%catal%'
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.cobradores c2
    WHERE c2.usuario_id = u.id
      AND c2.id <> c.id
  );
