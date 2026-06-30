-- Yanna (atendente): módulo Financeiro (hub) + Baixa de Parcelas + baixa pelo perfil do cliente.

UPDATE public.users
SET
  permissoes = jsonb_set(
    COALESCE(permissoes, '{}'::jsonb),
    '{fin_baixa_parcelas}',
    '{"liberado": true, "view": true, "baixar": true}'::jsonb,
    true
  ),
  updated_at = now()
WHERE id = '2321bb17-34b6-4dd2-a197-8ba0f15d7a0c'
   OR lower(trim(email)) = 'yanna@fenixfuneraria.com';
