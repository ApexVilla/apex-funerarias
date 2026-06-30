-- Origem 'afd' para batidas importadas do relógio de ponto (não são ajuste manual)

ALTER TABLE public.ponto_registros
  DROP CONSTRAINT IF EXISTS ponto_registros_origem_check;

ALTER TABLE public.ponto_registros
  ADD CONSTRAINT ponto_registros_origem_check
  CHECK (origem IN ('app', 'ajuste_manual', 'afd'));

COMMENT ON COLUMN public.ponto_registros.origem IS
  'app = registro pelo colaborador; ajuste_manual = lançado/alterado pelo gestor; afd = importado do relógio de ponto';

-- Registros já importados via AFD (marcados como ajuste_manual por engano)
UPDATE public.ponto_registros
SET origem = 'afd'
WHERE origem = 'ajuste_manual'
  AND (
    observacao ILIKE '[AFD]%'
    OR observacao ILIKE 'Importado de relógio de ponto%'
  );

-- RH/gestores podem inserir importação AFD na empresa
DROP POLICY IF EXISTS insert_ponto_registros ON public.ponto_registros;
CREATE POLICY insert_ponto_registros ON public.ponto_registros
FOR INSERT
TO authenticated
WITH CHECK (
  (
    user_id = auth.uid()
    AND origem = 'app'
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  )
  OR (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND origem IN ('ajuste_manual', 'afd')
    AND public.current_user_role() IN (
      'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
      'gerente', 'supervisao', 'gestor', 'diretoria', 'rh'
    )
  )
);
