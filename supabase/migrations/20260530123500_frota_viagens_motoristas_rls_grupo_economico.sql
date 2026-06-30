-- frota_viagens / frota_motoristas: alinhar ao multitenant por grupo econômico (função já usada pelo estoque).
--
-- Contexto do app:
-- • O usuário pode trocar filial no header (empresaIdEfetivo), mas auth.current_empresa_id() no banco é sempre
--   o users.empresa_id do cadastro — então WITH CHECK empresa_id = current_empresa_id() quebra INSERT de viagens.
-- • Com "todas as unidades", as queries fazem .in('empresa_id', ids do grupo): RLS só com empresa cadastral ocultava
--   linhas das outras unidades (ex.: motoristas de Catalão).
--
-- As novas políticas são permissivas; se já existiam outras permissivas típicas, o OR garante pelo menos estas regras.
-- Gestores que enxergam o grupo continuam usando public.rls_empresa_ou_do_mesmo_grupo (mesma linha dos demais módulos).

ALTER TABLE IF EXISTS public.frota_viagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.frota_motoristas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS frota_viagens_rls_grupo_select ON public.frota_viagens;
DROP POLICY IF EXISTS frota_viagens_rls_grupo_insert ON public.frota_viagens;
DROP POLICY IF EXISTS frota_viagens_rls_grupo_update ON public.frota_viagens;
DROP POLICY IF EXISTS frota_viagens_rls_grupo_delete ON public.frota_viagens;

CREATE POLICY frota_viagens_rls_grupo_select ON public.frota_viagens
  FOR SELECT TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

CREATE POLICY frota_viagens_rls_grupo_insert ON public.frota_viagens
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

CREATE POLICY frota_viagens_rls_grupo_update ON public.frota_viagens
  FOR UPDATE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

CREATE POLICY frota_viagens_rls_grupo_delete ON public.frota_viagens
  FOR DELETE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS frota_motoristas_rls_grupo_select ON public.frota_motoristas;
DROP POLICY IF EXISTS frota_motoristas_rls_grupo_insert ON public.frota_motoristas;
DROP POLICY IF EXISTS frota_motoristas_rls_grupo_update ON public.frota_motoristas;
DROP POLICY IF EXISTS frota_motoristas_rls_grupo_delete ON public.frota_motoristas;

CREATE POLICY frota_motoristas_rls_grupo_select ON public.frota_motoristas
  FOR SELECT TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

CREATE POLICY frota_motoristas_rls_grupo_insert ON public.frota_motoristas
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

CREATE POLICY frota_motoristas_rls_grupo_update ON public.frota_motoristas
  FOR UPDATE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

CREATE POLICY frota_motoristas_rls_grupo_delete ON public.frota_motoristas
  FOR DELETE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
