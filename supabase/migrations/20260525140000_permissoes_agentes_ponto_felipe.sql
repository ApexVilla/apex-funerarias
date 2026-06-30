-- Agentes: remove Painel Executivo salvo no JSON; Felipe (atendente): libera registro de ponto.

UPDATE users
SET permissoes = jsonb_set(
  COALESCE(permissoes, '{}'::jsonb),
  '{dashboard_view}',
  '{"view": false, "liberado": false}'::jsonb,
  true
)
WHERE role IN ('agentes_funerarios', 'agente_funerario')
   OR lower(email) IN ('edson@fenixfuneraria.com', 'fernando@fenixfuneraria.com');

UPDATE users
SET permissoes = jsonb_set(
  jsonb_set(
    COALESCE(permissoes, '{}'::jsonb),
    '{ponto_registro}',
    '{"view": true, "create": true, "liberado": true}'::jsonb,
    true
  ),
  '{ponto_espelho}',
  '{"view": true, "liberado": true, "edit": false}'::jsonb,
  true
)
WHERE lower(email) = 'felipe@fenixfuneraria.com';
