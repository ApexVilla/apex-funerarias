-- RLS de filiais / estoque_depositos: evita subconsulta direta em public.users na policy
-- (interage mal com RLS de users e pode esvaziar a lista para admin_empresa).
-- Usa current_empresa_id(), alinhado ao restante do multitenant.

DROP POLICY IF EXISTS filiais_empresa_policy ON public.filiais;
CREATE POLICY filiais_empresa_policy ON public.filiais
    FOR ALL
    TO authenticated
    USING (empresa_id = public.current_empresa_id())
    WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS estoque_depositos_empresa_policy ON public.estoque_depositos;
CREATE POLICY estoque_depositos_empresa_policy ON public.estoque_depositos
    FOR ALL
    TO authenticated
    USING (empresa_id = public.current_empresa_id())
    WITH CHECK (empresa_id = public.current_empresa_id());
