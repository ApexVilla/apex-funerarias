-- Grupo econômico (Fênix), saldo de estoque por depósito, transferências entre depósitos,
-- extensão de RLS em users para admin_sistema ver/editar usuários do mesmo grupo.

-- ── 1) Grupo de empresas ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empresa_grupos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT empresa_grupos_slug_unique UNIQUE (slug)
);

ALTER TABLE public.empresas
    ADD COLUMN IF NOT EXISTS grupo_empresa_id UUID REFERENCES public.empresa_grupos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_empresas_grupo ON public.empresas (grupo_empresa_id);

INSERT INTO public.empresa_grupos (id, nome, slug)
SELECT 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a001'::uuid, 'Grupo Fênix', 'fenix'
WHERE NOT EXISTS (SELECT 1 FROM public.empresa_grupos eg WHERE eg.slug = 'fenix');

UPDATE public.empresas e
SET grupo_empresa_id = (SELECT eg.id FROM public.empresa_grupos eg WHERE eg.slug = 'fenix' LIMIT 1)
WHERE e.grupo_empresa_id IS NULL
  AND (
      e.nome ILIKE '%aparecida%'
      OR e.nome ILIKE '%catalão%'
      OR e.nome ILIKE '%catalao%'
      OR e.nome ILIKE '%ipameri%'
      OR COALESCE(e.razao_social, '') ILIKE '%aparecida%'
      OR COALESCE(e.razao_social, '') ILIKE '%catalão%'
      OR COALESCE(e.razao_social, '') ILIKE '%catalao%'
      OR COALESCE(e.razao_social, '') ILIKE '%ipameri%'
  );

-- ── 2) RPC: empresas visíveis (própria + mesmo grupo se admin_sistema) ─────
CREATE OR REPLACE FUNCTION public.fn_empresas_do_meu_grupo()
RETURNS TABLE (id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT e.id,
           COALESCE(NULLIF(trim(e.nome), ''), NULLIF(trim(e.razao_social), ''), 'Empresa')::text AS nome
    FROM public.empresas e
    CROSS JOIN public.users u
    WHERE u.id = auth.uid()
      AND (
          e.id = u.empresa_id
          OR (
              lower(nullif(trim(public.current_user_role()), '')) = 'admin_sistema'
              AND e.grupo_empresa_id IS NOT NULL
              AND e.grupo_empresa_id = (
                  SELECT e2.grupo_empresa_id
                  FROM public.empresas e2
                  WHERE e2.id = u.empresa_id
                  LIMIT 1
              )
          )
      )
    ORDER BY nome;
$$;

REVOKE ALL ON FUNCTION public.fn_empresas_do_meu_grupo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_empresas_do_meu_grupo() TO authenticated;

-- ── 3) Saldo físico por depósito ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estoque_saldo_deposito (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.ser_produtos(id) ON DELETE CASCADE,
    deposito_id UUID NOT NULL REFERENCES public.estoque_depositos(id) ON DELETE CASCADE,
    quantidade NUMERIC(12, 3) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT estoque_saldo_deposito_prod_dep_unique UNIQUE (produto_id, deposito_id),
    CONSTRAINT estoque_saldo_deposito_qtd_nonneg CHECK (quantidade >= 0)
);

CREATE INDEX IF NOT EXISTS idx_estoque_saldo_dep_empresa ON public.estoque_saldo_deposito (empresa_id);
CREATE INDEX IF NOT EXISTS idx_estoque_saldo_dep_deposito ON public.estoque_saldo_deposito (deposito_id);
CREATE INDEX IF NOT EXISTS idx_estoque_saldo_dep_produto ON public.estoque_saldo_deposito (produto_id);

ALTER TABLE public.estoque_saldo_deposito ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estoque_saldo_deposito_empresa_policy ON public.estoque_saldo_deposito;
CREATE POLICY estoque_saldo_deposito_empresa_policy ON public.estoque_saldo_deposito
    FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()))
    WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()));

-- Depósito legado por empresa (saldo sem depósito definido no produto)
INSERT INTO public.estoque_depositos (empresa_id, nome, tipo, ativo)
SELECT e.id,
       'Depósito geral (legado)',
       'central',
       true
FROM public.empresas e
WHERE NOT EXISTS (
    SELECT 1
    FROM public.estoque_depositos d
    WHERE d.empresa_id = e.id
      AND d.nome = 'Depósito geral (legado)'
);

-- Backfill: um saldo por produto (origem = deposito do produto ou depósito geral legado)
INSERT INTO public.estoque_saldo_deposito (empresa_id, produto_id, deposito_id, quantidade)
SELECT p.empresa_id,
       p.id,
       COALESCE(
           p.deposito_id,
           (
               SELECT d.id
               FROM public.estoque_depositos d
               WHERE d.empresa_id = p.empresa_id
                 AND d.nome = 'Depósito geral (legado)'
               LIMIT 1
           )
       ),
       GREATEST(COALESCE(p.estoque_atual, 0), 0)::numeric(12, 3)
FROM public.ser_produtos p
WHERE NOT EXISTS (
    SELECT 1 FROM public.estoque_saldo_deposito s WHERE s.produto_id = p.id
);

CREATE OR REPLACE FUNCTION public.sync_ser_produtos_estoque_total_from_saldos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pid uuid;
BEGIN
    v_pid := COALESCE(NEW.produto_id, OLD.produto_id);
    IF v_pid IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    UPDATE public.ser_produtos p
    SET estoque_atual = (
        SELECT COALESCE(SUM(s.quantidade), 0)::numeric
        FROM public.estoque_saldo_deposito s
        WHERE s.produto_id = p.id
    ),
    updated_at = now()
    WHERE p.id = v_pid;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_produto_total_on_saldo ON public.estoque_saldo_deposito;
CREATE TRIGGER trg_sync_produto_total_on_saldo
    AFTER INSERT OR UPDATE OR DELETE ON public.estoque_saldo_deposito
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_ser_produtos_estoque_total_from_saldos();

-- ── 4) Transferências entre depósitos (mesma empresa) ────────────────────────
CREATE TABLE IF NOT EXISTS public.estoque_transferencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    deposito_origem_id UUID NOT NULL REFERENCES public.estoque_depositos(id) ON DELETE RESTRICT,
    deposito_destino_id UUID NOT NULL REFERENCES public.estoque_depositos(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'efetivada', 'cancelada')),
    observacao TEXT,
    usuario_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT estoque_transferencias_dep_dist CHECK (deposito_origem_id <> deposito_destino_id)
);

CREATE TABLE IF NOT EXISTS public.estoque_transferencia_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transferencia_id UUID NOT NULL REFERENCES public.estoque_transferencias(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.ser_produtos(id) ON DELETE RESTRICT,
    quantidade NUMERIC(12, 3) NOT NULL CHECK (quantidade > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estoque_transferencias_empresa ON public.estoque_transferencias (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_transferencia_itens_tr ON public.estoque_transferencia_itens (transferencia_id);

ALTER TABLE public.estoque_transferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_transferencia_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estoque_transferencias_empresa_policy ON public.estoque_transferencias;
CREATE POLICY estoque_transferencias_empresa_policy ON public.estoque_transferencias
    FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()))
    WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS estoque_transferencia_itens_policy ON public.estoque_transferencia_itens;
CREATE POLICY estoque_transferencia_itens_policy ON public.estoque_transferencia_itens
    FOR ALL
    USING (
        transferencia_id IN (
            SELECT id FROM public.estoque_transferencias
            WHERE empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid())
        )
    )
    WITH CHECK (
        transferencia_id IN (
            SELECT id FROM public.estoque_transferencias
            WHERE empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid())
        )
    );

ALTER TABLE public.estoque_movimentacoes
    ADD COLUMN IF NOT EXISTS deposito_origem_id UUID REFERENCES public.estoque_depositos(id) ON DELETE SET NULL;

ALTER TABLE public.estoque_movimentacoes
    ADD COLUMN IF NOT EXISTS deposito_destino_id UUID REFERENCES public.estoque_depositos(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.fn_efetivar_transferencia_estoque(p_transferencia_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t RECORD;
    it RECORD;
    v_saldo_origem numeric(12, 3);
    v_total_antes numeric(12, 3);
    v_total_depois numeric(12, 3);
    v_onome text;
    v_dnome text;
BEGIN
    SELECT tr.* INTO t
    FROM public.estoque_transferencias tr
    WHERE tr.id = p_transferencia_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transferência não encontrada';
    END IF;

    IF t.status <> 'rascunho' THEN
        RAISE EXCEPTION 'Transferência já processada ou cancelada';
    END IF;

    IF t.empresa_id <> (SELECT u.empresa_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1) THEN
        RAISE EXCEPTION 'Sem permissão para esta empresa';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.estoque_depositos d
        WHERE d.id = t.deposito_origem_id AND d.empresa_id = t.empresa_id
    ) OR NOT EXISTS (
        SELECT 1 FROM public.estoque_depositos d
        WHERE d.id = t.deposito_destino_id AND d.empresa_id = t.empresa_id
    ) THEN
        RAISE EXCEPTION 'Depósitos inválidos para a empresa da transferência';
    END IF;

    IF t.deposito_origem_id = t.deposito_destino_id THEN
        RAISE EXCEPTION 'Depósitos de origem e destino devem ser diferentes';
    END IF;

    SELECT nome INTO v_onome FROM public.estoque_depositos WHERE id = t.deposito_origem_id;
    SELECT nome INTO v_dnome FROM public.estoque_depositos WHERE id = t.deposito_destino_id;

    FOR it IN
        SELECT ti.*
        FROM public.estoque_transferencia_itens ti
        WHERE ti.transferencia_id = t.id
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.ser_produtos p
            WHERE p.id = it.produto_id AND p.empresa_id = t.empresa_id
        ) THEN
            RAISE EXCEPTION 'Produto não pertence à empresa da transferência';
        END IF;

        SELECT COALESCE(s.quantidade, 0)
        INTO v_saldo_origem
        FROM public.estoque_saldo_deposito s
        WHERE s.produto_id = it.produto_id
          AND s.deposito_id = t.deposito_origem_id
        FOR UPDATE;

        IF COALESCE(v_saldo_origem, 0) < it.quantidade THEN
            RAISE EXCEPTION 'Saldo insuficiente no depósito de origem para um dos produtos';
        END IF;

        SELECT COALESCE(SUM(s.quantidade), 0)
        INTO v_total_antes
        FROM public.estoque_saldo_deposito s
        WHERE s.produto_id = it.produto_id;

        UPDATE public.estoque_saldo_deposito s
        SET quantidade = s.quantidade - it.quantidade,
            updated_at = now()
        WHERE s.produto_id = it.produto_id
          AND s.deposito_id = t.deposito_origem_id;

        INSERT INTO public.estoque_saldo_deposito (empresa_id, produto_id, deposito_id, quantidade)
        VALUES (t.empresa_id, it.produto_id, t.deposito_destino_id, it.quantidade)
        ON CONFLICT (produto_id, deposito_id) DO UPDATE
        SET quantidade = public.estoque_saldo_deposito.quantidade + EXCLUDED.quantidade,
            updated_at = now();

        SELECT COALESCE(SUM(s.quantidade), 0)
        INTO v_total_depois
        FROM public.estoque_saldo_deposito s
        WHERE s.produto_id = it.produto_id;

        INSERT INTO public.estoque_movimentacoes (
            empresa_id,
            produto_id,
            tipo,
            quantidade,
            estoque_anterior,
            estoque_posterior,
            motivo,
            referencia_tipo,
            referencia_id,
            usuario_id,
            deposito_origem_id,
            deposito_destino_id
        )
        VALUES (
            t.empresa_id,
            it.produto_id,
            'transferencia',
            it.quantidade,
            v_total_antes,
            v_total_depois,
            format(
                'Transferência entre depósitos: %s → %s',
                COALESCE(v_onome, '?'),
                COALESCE(v_dnome, '?')
            ),
            'transferencia',
            t.id,
            auth.uid(),
            t.deposito_origem_id,
            t.deposito_destino_id
        );
    END LOOP;

    UPDATE public.estoque_transferencias
    SET status = 'efetivada',
        updated_at = now()
    WHERE id = t.id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_efetivar_transferencia_estoque(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_efetivar_transferencia_estoque(uuid) TO authenticated;

-- ── 5) RLS users: admin_sistema vê/edita usuários do mesmo grupo econômico ───
DROP POLICY IF EXISTS users_select_same_empresa ON public.users;
CREATE POLICY users_select_same_empresa
ON public.users
FOR SELECT
TO authenticated
USING (
    id = auth.uid()
    OR empresa_id = public.current_empresa_id()
    OR (
        lower(nullif(trim(public.current_user_role()), '')) = 'admin_sistema'
        AND EXISTS (
            SELECT 1
            FROM public.users me
            INNER JOIN public.empresas em ON em.id = me.empresa_id
            INNER JOIN public.empresas ex ON ex.id = users.empresa_id
            WHERE me.id = auth.uid()
              AND em.grupo_empresa_id IS NOT NULL
              AND em.grupo_empresa_id = ex.grupo_empresa_id
        )
    )
);

DROP POLICY IF EXISTS users_update_same_empresa_admin ON public.users;
CREATE POLICY users_update_same_empresa_admin
ON public.users
FOR UPDATE
TO authenticated
USING (
    id = auth.uid()
    OR (
        empresa_id = public.current_empresa_id()
        AND lower(nullif(trim(public.current_user_role()), '')) = ANY (ARRAY[
            'admin',
            'admin_empresa',
            'admin_sistema',
            'gerente',
            'diretoria',
            'supervisao',
            'gestor',
            'super_admin'
        ]::text[])
    )
    OR (
        lower(nullif(trim(public.current_user_role()), '')) = 'admin_sistema'
        AND EXISTS (
            SELECT 1
            FROM public.users me
            INNER JOIN public.empresas em ON em.id = me.empresa_id
            INNER JOIN public.empresas ex ON ex.id = users.empresa_id
            WHERE me.id = auth.uid()
              AND em.grupo_empresa_id IS NOT NULL
              AND em.grupo_empresa_id = ex.grupo_empresa_id
        )
    )
)
WITH CHECK (
    id = auth.uid()
    OR (
        empresa_id = public.current_empresa_id()
        AND lower(nullif(trim(public.current_user_role()), '')) = ANY (ARRAY[
            'admin',
            'admin_empresa',
            'admin_sistema',
            'gerente',
            'diretoria',
            'supervisao',
            'gestor',
            'super_admin'
        ]::text[])
    )
    OR (
        lower(nullif(trim(public.current_user_role()), '')) = 'admin_sistema'
        AND EXISTS (
            SELECT 1
            FROM public.users me
            INNER JOIN public.empresas em ON em.id = me.empresa_id
            INNER JOIN public.empresas ex ON ex.id = users.empresa_id
            WHERE me.id = auth.uid()
              AND em.grupo_empresa_id IS NOT NULL
              AND em.grupo_empresa_id = ex.grupo_empresa_id
        )
        AND users.empresa_id IN (
            SELECT ex2.id
            FROM public.users me2
            INNER JOIN public.empresas em2 ON em2.id = me2.empresa_id
            INNER JOIN public.empresas ex2 ON ex2.grupo_empresa_id = em2.grupo_empresa_id
            WHERE me2.id = auth.uid()
              AND em2.grupo_empresa_id IS NOT NULL
        )
    )
);
