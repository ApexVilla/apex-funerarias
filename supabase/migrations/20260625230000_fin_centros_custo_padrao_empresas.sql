-- Centros de custo padrão por empresa (mesma estrutura da Empresa Padrão).

CREATE OR REPLACE FUNCTION public.fin_garantir_centros_custo_padrao(p_empresa_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_inserted integer := 0;
BEGIN
    IF p_empresa_id IS NULL THEN
        RETURN 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM empresas e WHERE e.id = p_empresa_id) THEN
        RETURN 0;
    END IF;

    WITH padrao AS (
        SELECT *
          FROM (VALUES
            ('CC-001', 'Administrativo',           'administrativo'),
            ('CC-002', 'Comercial/Vendas',         'comercial'),
            ('CC-003', 'Operacional/Serviços',     'operacional'),
            ('CC-004', 'Marketing',                'marketing'),
            ('CC-005', 'Tecnologia',               'ti'),
            ('CC-006', 'Financeiro',               'financeiro'),
            ('CC-007', 'Recursos Humanos',         'rh'),
            ('CC-008', 'Diretoria',                'diretoria')
          ) AS t(codigo, nome, tipo)
    ),
    novos AS (
        INSERT INTO fin_centros_custo (empresa_id, codigo, nome, tipo, ativo)
        SELECT p_empresa_id, p.codigo, p.nome, p.tipo, true
          FROM padrao p
         WHERE NOT EXISTS (
             SELECT 1
               FROM fin_centros_custo cc
              WHERE cc.empresa_id = p_empresa_id
                AND cc.codigo = p.codigo
         )
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_inserted FROM novos;

    RETURN COALESCE(v_inserted, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.fin_garantir_centros_custo_padrao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_garantir_centros_custo_padrao(uuid) TO authenticated;

COMMENT ON FUNCTION public.fin_garantir_centros_custo_padrao(uuid) IS
  'Idempotente: cria os 8 centros de custo padrão (CC-001…CC-008) na empresa se ainda não existirem.';

-- Backfill: todas as empresas do grupo.
DO $backfill$
DECLARE
    r RECORD;
    n integer;
    total integer := 0;
BEGIN
    FOR r IN SELECT id FROM empresas ORDER BY nome
    LOOP
        n := public.fin_garantir_centros_custo_padrao(r.id);
        total := total + COALESCE(n, 0);
    END LOOP;
    RAISE NOTICE 'fin_garantir_centros_custo_padrao backfill: % centro(s) criado(s)', total;
END;
$backfill$;

NOTIFY pgrst, 'reload schema';
