-- Filtro opcional por departamento (ligações: assinaturas.vendedor_id → users.departamento_id;
-- clientes.vendedor_id / criado_por_user_id → users.departamento_id).

DROP FUNCTION IF EXISTS public.rel_contratos(uuid, date, date);
DROP FUNCTION IF EXISTS public.fn_relatorio_clientes(uuid);

CREATE OR REPLACE FUNCTION public.rel_contratos(
  p_empresa_id uuid,
  p_periodo_inicio date DEFAULT (date_trunc('month', CURRENT_DATE::timestamp with time zone))::date,
  p_periodo_fim date DEFAULT ((date_trunc('month', CURRENT_DATE::timestamp with time zone) + '1 mon -1 days'::interval))::date,
  p_departamento_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_contratos_ativos BIGINT;
  v_cancelados_periodo INTEGER;
  v_novos_periodo INTEGER;
  v_mrr_atual_centavos BIGINT;
  v_churn_rate NUMERIC;
BEGIN
  SELECT count(*)
  INTO v_contratos_ativos
  FROM assinaturas a
  WHERE a.empresa_id = p_empresa_id
    AND a.status = 'ativa'
    AND (
      p_departamento_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = a.vendedor_id
          AND u.empresa_id = p_empresa_id
          AND u.departamento_id = p_departamento_id
      )
    );

  SELECT COALESCE(SUM(a.valor_mensal_centavos), 0)
  INTO v_mrr_atual_centavos
  FROM assinaturas a
  WHERE a.empresa_id = p_empresa_id
    AND a.status = 'ativa'
    AND (
      p_departamento_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = a.vendedor_id
          AND u.empresa_id = p_empresa_id
          AND u.departamento_id = p_departamento_id
      )
    );

  SELECT count(*)
  INTO v_cancelados_periodo
  FROM assinaturas a
  WHERE a.empresa_id = p_empresa_id
    AND a.status = 'cancelada'
    AND a.data_cancelamento BETWEEN p_periodo_inicio AND p_periodo_fim
    AND (
      p_departamento_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = a.vendedor_id
          AND u.empresa_id = p_empresa_id
          AND u.departamento_id = p_departamento_id
      )
    );

  SELECT count(*)
  INTO v_novos_periodo
  FROM assinaturas a
  WHERE a.empresa_id = p_empresa_id
    AND a.created_at >= p_periodo_inicio
    AND a.created_at <= p_periodo_fim
    AND (
      p_departamento_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = a.vendedor_id
          AND u.empresa_id = p_empresa_id
          AND u.departamento_id = p_departamento_id
      )
    );

  v_churn_rate := CASE WHEN v_contratos_ativos + v_cancelados_periodo > 0
    THEN ROUND(v_cancelados_periodo::NUMERIC / (v_contratos_ativos + v_cancelados_periodo) * 100, 2)
    ELSE 0 END;

  v_result := jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_periodo_inicio, 'fim', p_periodo_fim),
    'departamento_id', p_departamento_id,
    'contratos_ativos', v_contratos_ativos,
    'mrr_anual_centavos', v_mrr_atual_centavos * 12,
    'mrr_atual_centavos', v_mrr_atual_centavos,
    'novos_periodo', v_novos_periodo,
    'cancelados_periodo', v_cancelados_periodo,
    'churn_rate', v_churn_rate,
    'net_growth', v_novos_periodo - v_cancelados_periodo,
    'gerado_em', now()
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_relatorio_clientes(
  p_empresa_id uuid,
  p_departamento_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_clientes', COUNT(*),
    'ativos', COUNT(*) FILTER (WHERE c.status = 'ativo'),
    'inativos', COUNT(*) FILTER (WHERE c.status = 'inativo'),
    'prospects', COUNT(*) FILTER (WHERE c.status = 'prospect'),
    'leads', COUNT(*) FILTER (WHERE c.status = 'lead'),
    'cancelados', COUNT(*) FILTER (WHERE c.status = 'cancelado'),
    'bloqueados', COUNT(*) FILTER (WHERE c.bloqueado = true),
    'vips', COUNT(*) FILTER (WHERE c.cliente_vip = true),
    'por_segmento', json_build_object(
      'A', COUNT(*) FILTER (WHERE c.segmento = 'A'),
      'B', COUNT(*) FILTER (WHERE c.segmento = 'B'),
      'C', COUNT(*) FILTER (WHERE c.segmento = 'C'),
      'D', COUNT(*) FILTER (WHERE c.segmento = 'D')
    ),
    'por_nivel', json_build_object(
      'bronze', COUNT(*) FILTER (WHERE c.nivel_relacionamento = 'bronze'),
      'prata', COUNT(*) FILTER (WHERE c.nivel_relacionamento = 'prata'),
      'ouro', COUNT(*) FILTER (WHERE c.nivel_relacionamento = 'ouro'),
      'diamante', COUNT(*) FILTER (WHERE c.nivel_relacionamento = 'diamante')
    ),
    'por_origem', json_build_object(
      'site', COUNT(*) FILTER (WHERE c.origem_canal = 'site'),
      'indicacao', COUNT(*) FILTER (WHERE c.origem_canal = 'indicacao'),
      'telemarketing', COUNT(*) FILTER (WHERE c.origem_canal = 'telemarketing'),
      'presencial', COUNT(*) FILTER (WHERE c.origem_canal = 'presencial')
    ),
    'aniversariantes_mes', COUNT(*) FILTER (
      WHERE EXTRACT(MONTH FROM c.data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE)
    ),
    'cadastrados_mes', COUNT(*) FILTER (
      WHERE c.created_at >= date_trunc('month', CURRENT_DATE)
    ),
    'departamento_id', p_departamento_id
  )
  INTO v_result
  FROM clientes c
  WHERE c.empresa_id = p_empresa_id
    AND c.deleted_at IS NULL
    AND (
      p_departamento_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM users u
        WHERE u.empresa_id = p_empresa_id
          AND u.departamento_id = p_departamento_id
          AND (u.id = c.vendedor_id OR u.id = c.criado_por_user_id)
      )
    );

  RETURN v_result;
END;
$function$;

-- Catálogo: selects de departamento para COM_* e CLI_* (empresa da view já filtra linhas).
UPDATE public.rel_configuracao AS r
SET parametros = m.parametros::jsonb
FROM (
  VALUES
    ('COM_DEP_01', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"},{"name":"p_departamento_id","type":"uuid","label":"Departamento","optional":true,"pickFrom":{"table":"departamentos","value":"id","label":"nome"}}]'),
    ('COM_DEP_02', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"},{"name":"p_departamento_id","type":"uuid","label":"Departamento","optional":true,"pickFrom":{"table":"departamentos","value":"id","label":"nome"}}]'),
    ('COM_DEP_03', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"},{"name":"p_departamento_id","type":"uuid","label":"Departamento","optional":true,"pickFrom":{"table":"departamentos","value":"id","label":"nome"}}]'),
    ('COM_DEP_04', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"},{"name":"p_departamento_id","type":"uuid","label":"Departamento","optional":true,"pickFrom":{"table":"departamentos","value":"id","label":"nome"}}]'),
    ('COM_DEP_05', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"},{"name":"p_departamento_id","type":"uuid","label":"Departamento","optional":true,"pickFrom":{"table":"departamentos","value":"id","label":"nome"}}]'),
    ('CLI_DEP_01', '[{"name":"p_departamento_id","type":"uuid","label":"Departamento","optional":true,"pickFrom":{"table":"departamentos","value":"id","label":"nome"}}]'),
    ('CLI_DEP_02', '[{"name":"p_departamento_id","type":"uuid","label":"Departamento","optional":true,"pickFrom":{"table":"departamentos","value":"id","label":"nome"}}]'),
    ('CLI_DEP_03', '[{"name":"p_departamento_id","type":"uuid","label":"Departamento","optional":true,"pickFrom":{"table":"departamentos","value":"id","label":"nome"}}]'),
    ('CLI_DEP_04', '[{"name":"p_departamento_id","type":"uuid","label":"Departamento","optional":true,"pickFrom":{"table":"departamentos","value":"id","label":"nome"}}]'),
    ('CLI_DEP_05', '[{"name":"p_departamento_id","type":"uuid","label":"Departamento","optional":true,"pickFrom":{"table":"departamentos","value":"id","label":"nome"}}]')
) AS m(codigo, parametros)
WHERE r.codigo = m.codigo;
