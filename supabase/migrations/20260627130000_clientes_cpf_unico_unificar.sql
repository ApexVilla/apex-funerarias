-- Normaliza CPF no banco, unifica duplicados e reforça unicidade.

-- Helper: só dígitos (Postgres não entende \D como JS)
CREATE OR REPLACE FUNCTION public.fn_cpf_so_digitos(p_cpf text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(COALESCE(p_cpf, ''), '[^0-9]', '', 'g'),
    ''
  );
$$;

-- 1) Função de unificação (usada no backfill e disponível no app)
CREATE OR REPLACE FUNCTION public.fn_unificar_clientes(
  p_manter_id uuid,
  p_remover_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manter RECORD;
  v_remover RECORD;
BEGIN
  IF p_manter_id IS NULL OR p_remover_id IS NULL OR p_manter_id = p_remover_id THEN
    RAISE EXCEPTION 'Informe dois clientes diferentes para unificação.';
  END IF;

  SELECT id, nome, cpf, empresa_id INTO v_manter
  FROM public.clientes WHERE id = p_manter_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente a manter não encontrado ou inativo.';
  END IF;

  SELECT id, nome, cpf, empresa_id INTO v_remover
  FROM public.clientes WHERE id = p_remover_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente a remover não encontrado ou inativo.';
  END IF;

  IF v_manter.empresa_id IS DISTINCT FROM v_remover.empresa_id THEN
    RAISE EXCEPTION 'Os clientes pertencem a empresas diferentes. Unifique apenas na mesma unidade.';
  END IF;

  UPDATE public.acionamentos SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.assinaturas SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.beneficiarios SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.clientes SET indicado_por_cliente_id = p_manter_id WHERE indicado_por_cliente_id = p_remover_id;
  UPDATE public.cob_cobranca_acoes SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.cob_cobrancas_pendentes SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.cob_recebimentos_campo SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.cob_rota_paradas SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.comunicacoes SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.contatos_emergencia SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.crm_audit_logs SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.crm_whatsapp_contatos SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.dados_medicos SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.fin_contas_receber SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.fin_contas_receber_renegociacoes SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.fin_creditos_clientes SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.mensalidades SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.nps_pesquisas SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.oportunidades SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.pagamentos SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.propostas_venda SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.ser_atendimentos SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.ser_falecidos SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.tarefas_crm SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;
  UPDATE public.timeline_clientes SET cliente_id = p_manter_id WHERE cliente_id = p_remover_id;

  UPDATE public.clientes
  SET cpf = NULL,
      deleted_at = now(),
      updated_at = now()
  WHERE id = p_remover_id;

  RETURN jsonb_build_object(
    'ok', true,
    'manter_id', p_manter_id,
    'remover_id', p_remover_id,
    'manter_nome', v_manter.nome,
    'remover_nome', v_remover.nome
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_unificar_clientes(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_unificar_clientes(uuid, uuid) TO authenticated;

-- 2) Unificar duplicados (mesmo CPF com/sem máscara)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    WITH norm AS (
      SELECT
        id,
        public.fn_cpf_so_digitos(cpf) AS cpf_norm,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY public.fn_cpf_so_digitos(cpf)
          ORDER BY created_at ASC, codigo ASC NULLS LAST
        ) AS rn
      FROM public.clientes
      WHERE deleted_at IS NULL
        AND public.fn_cpf_so_digitos(cpf) IS NOT NULL
        AND length(public.fn_cpf_so_digitos(cpf)) = 11
        AND public.fn_cpf_so_digitos(cpf) !~ '^0{11}$'
    ),
    grupos AS (
      SELECT cpf_norm FROM norm GROUP BY cpf_norm HAVING COUNT(*) > 1
    )
    SELECT
      n_manter.id AS manter_id,
      n_remover.id AS remover_id
    FROM grupos g
    JOIN norm n_manter ON n_manter.cpf_norm = g.cpf_norm AND n_manter.rn = 1
    JOIN norm n_remover ON n_remover.cpf_norm = g.cpf_norm AND n_remover.rn > 1
  LOOP
    PERFORM public.fn_unificar_clientes(r.manter_id, r.remover_id);
  END LOOP;
END;
$$;

-- 3) Padronizar CPFs restantes (libera clientes_cpf_key em soft-deleted)
UPDATE public.clientes
SET cpf = NULL
WHERE deleted_at IS NOT NULL AND cpf IS NOT NULL;

UPDATE public.clientes
SET cpf = public.fn_cpf_so_digitos(cpf)
WHERE deleted_at IS NULL
  AND cpf IS NOT NULL
  AND cpf IS DISTINCT FROM public.fn_cpf_so_digitos(cpf);

UPDATE public.clientes
SET cpf = NULL
WHERE cpf = '00000000000';

-- 4) Trigger: sempre gravar CPF só com dígitos
CREATE OR REPLACE FUNCTION public.trg_clientes_normalizar_cpf()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.cpf IS NOT NULL THEN
    NEW.cpf := public.fn_cpf_so_digitos(NEW.cpf);
    IF NEW.cpf = '00000000000' THEN
      NEW.cpf := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_normalizar_cpf ON public.clientes;
CREATE TRIGGER clientes_normalizar_cpf
  BEFORE INSERT OR UPDATE OF cpf ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_clientes_normalizar_cpf();

-- 5) Índice único parcial (ativos com CPF válido)
CREATE UNIQUE INDEX IF NOT EXISTS clientes_cpf_ativo_unique_idx
  ON public.clientes (cpf)
  WHERE deleted_at IS NULL
    AND cpf IS NOT NULL
    AND length(cpf) = 11
    AND cpf !~ '^0{11}$';

COMMENT ON INDEX public.clientes_cpf_ativo_unique_idx IS
  'Garante um único cliente ativo por CPF (11 dígitos).';

COMMENT ON FUNCTION public.fn_unificar_clientes(uuid, uuid) IS
  'Move vínculos do cliente removido para o mantido e marca o removido como excluído (soft delete).';
