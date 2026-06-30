-- Consulta status da carteira sem JOIN exposto ao RLS do cliente + reload schema PostgREST.

CREATE OR REPLACE FUNCTION public.fn_cob_carteira_status_cliente(
  p_empresa_id uuid,
  p_cliente_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF NOT public.auth_usuario_pode_operar_empresa(p_empresa_id) THEN
    RETURN jsonb_build_object('erro', 'Sem permissão para consultar esta unidade.');
  END IF;

  SELECT cp.cobrador_id, cp.canal_cobranca, c.nome AS cobrador_nome
  INTO r
  FROM public.cob_cobrancas_pendentes cp
  LEFT JOIN public.cobradores c ON c.id = cp.cobrador_id
  WHERE cp.empresa_id = p_empresa_id
    AND cp.cliente_id = p_cliente_id
    AND cp.status IN ('pendente', 'em_andamento', 'promessa')
  ORDER BY
    CASE WHEN cp.canal_cobranca = 'escritorio' THEN 0
         WHEN cp.cobrador_id IS NOT NULL THEN 1
         ELSE 2 END
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'escritorio', false,
      'cobrador_id', NULL,
      'cobrador_nome', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'escritorio', r.canal_cobranca = 'escritorio',
    'cobrador_id', r.cobrador_id,
    'cobrador_nome', r.cobrador_nome
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_cob_carteira_status_cliente(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
