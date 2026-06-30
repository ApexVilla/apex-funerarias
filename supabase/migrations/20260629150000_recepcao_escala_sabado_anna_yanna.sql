-- Recepção sábado alternado: Anna Cristina e Yanna.
-- Meta 4h no sábado de plantão (jornada normal, não hora extra integral).
-- Âncoras inferidas dos registros de ponto (semanas opostas).

UPDATE users
SET
  permissoes = jsonb_set(
    COALESCE(permissoes, '{}'::jsonb),
    '{ponto_config}',
    '{
      "regime": "padrao_8h",
      "carga_horaria_minutos": 480,
      "escala_sabado_alternado": true,
      "meta_sabado_minutos": 240,
      "data_inicio_escala_sabado": "2026-05-02",
      "pode_editar_proprio_ponto": false
    }'::jsonb,
    true
  ),
  updated_at = now()
WHERE lower(trim(email)) = 'yanna@fenixfuneraria.com';

UPDATE users
SET
  permissoes = jsonb_set(
    COALESCE(permissoes, '{}'::jsonb),
    '{ponto_config}',
    '{
      "regime": "padrao_8h",
      "carga_horaria_minutos": 480,
      "escala_sabado_alternado": true,
      "meta_sabado_minutos": 240,
      "data_inicio_escala_sabado": "2026-05-09",
      "pode_editar_proprio_ponto": false
    }'::jsonb,
    true
  ),
  updated_at = now()
WHERE lower(trim(email)) = 'anna@fenixfuneraria.com';
