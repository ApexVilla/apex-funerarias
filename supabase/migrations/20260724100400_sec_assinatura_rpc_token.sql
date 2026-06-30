-- Hardening de seguranca (Fase 1.5)
-- A policy cad_update_anon_sign permitia que QUALQUER cliente com a anon key
-- desse UPDATE em QUALQUER contrato pendente/visualizado nao expirado, sem
-- conhecer o token (USING so checava status/expira_em). Isso permitia
-- adulterar/assinar contratos de terceiros.
--
-- Substituicao: o fluxo anonimo de assinatura passa por RPCs SECURITY DEFINER
-- que validam o TOKEN internamente e so afetam a linha correspondente. A policy
-- anonima de UPDATE e removida; o role anon nao escreve mais direto na tabela.
--
-- ROLLBACK: recriar a policy cad_update_anon_sign e DROP das 3 funcoes.

-- 1) Marca contrato como visualizado (primeiro acesso pelo link) -------------
CREATE OR REPLACE FUNCTION public.marcar_contrato_visualizado(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contratos_assinaturas_digitais
     SET status = 'visualizado', updated_at = now()
   WHERE token = p_token
     AND status = 'pendente'
     AND (expira_em IS NULL OR expira_em > now());
END;
$$;

-- 2) Registra o aceite dos termos -------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_aceite_termos_contrato(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contratos_assinaturas_digitais
     SET aceite_termos_em = now(), updated_at = now()
   WHERE token = p_token
     AND status IN ('pendente', 'visualizado')
     AND (expira_em IS NULL OR expira_em > now());
END;
$$;

-- 3) Assina o contrato (validacao completa por token) -----------------------
CREATE OR REPLACE FUNCTION public.assinar_contrato_por_token(
  p_token text,
  p_assinatura_imagem_url text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_dispositivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.contratos_assinaturas_digitais;
  v_ip inet;
BEGIN
  SELECT * INTO v_row
    FROM public.contratos_assinaturas_digitais
   WHERE token = p_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato nao encontrado para este link.';
  END IF;
  IF v_row.status = 'assinado' THEN
    RAISE EXCEPTION 'Este contrato ja foi assinado.';
  END IF;
  IF v_row.status = 'cancelado' THEN
    RAISE EXCEPTION 'Esta solicitacao foi cancelada.';
  END IF;
  IF v_row.expira_em IS NOT NULL AND v_row.expira_em <= now() THEN
    RAISE EXCEPTION 'Este link de assinatura expirou.';
  END IF;

  BEGIN
    v_ip := nullif(p_ip, '')::inet;
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  UPDATE public.contratos_assinaturas_digitais
     SET status = 'assinado',
         assinatura_imagem_url = p_assinatura_imagem_url,
         assinado_em = now(),
         ip_assinatura = v_ip,
         user_agent = p_user_agent,
         dispositivo = p_dispositivo,
         updated_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'id', v_row.id);
END;
$$;

-- Permissoes: fluxo publico de assinatura ------------------------------------
REVOKE EXECUTE ON FUNCTION public.marcar_contrato_visualizado(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registrar_aceite_termos_contrato(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assinar_contrato_por_token(text, text, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.marcar_contrato_visualizado(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_aceite_termos_contrato(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinar_contrato_por_token(text, text, text, text, text) TO anon, authenticated;

-- Remove a policy anonima insegura ------------------------------------------
DROP POLICY IF EXISTS cad_update_anon_sign ON public.contratos_assinaturas_digitais;
