-- Paula (atendente): Baixa de parcelas + tesouraria do próprio caixa.

UPDATE public.users
SET
  permissoes = jsonb_set(
    jsonb_set(
      COALESCE(permissoes, '{}'::jsonb),
      '{fin_baixa_parcelas}',
      '{"liberado": true, "view": true, "baixar": true}'::jsonb,
      true
    ),
    '{fin_tesouraria}',
    COALESCE(permissoes->'fin_tesouraria', '{}'::jsonb)
      || jsonb_build_object(
        'liberado', true,
        'view', true,
        'abrir_caixa', true,
        'fechar_caixa', true,
        'create', true,
        'ver_todos_caixas', false
      ),
    true
  ),
  updated_at = now()
WHERE id = '349534f4-17b6-469b-83a8-079e11908439'
   OR lower(trim(email)) = 'paula@fenixfuneraria.com';
