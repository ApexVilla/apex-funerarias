-- Ajuste manual da folha de ponto pelo gestor/administrador

ALTER TABLE public.ponto_registros
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'app'
    CHECK (origem IN ('app', 'ajuste_manual')),
  ADD COLUMN IF NOT EXISTS ajustado_por uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS motivo_ajuste text;

COMMENT ON COLUMN public.ponto_registros.origem IS 'app = registro pelo colaborador; ajuste_manual = lançado/alterado pelo gestor';
COMMENT ON COLUMN public.ponto_registros.ajustado_por IS 'Usuário gestor que fez o ajuste manual';
COMMENT ON COLUMN public.ponto_registros.motivo_ajuste IS 'Motivo informado no ajuste (mesmo valor em todas as batidas do dia, se aplicável)';

-- Inserção: colaborador no próprio ponto OU gestor inserindo ajuste manual na empresa
DROP POLICY IF EXISTS insert_ponto_registros ON public.ponto_registros;
CREATE POLICY insert_ponto_registros ON public.ponto_registros
FOR INSERT
TO authenticated
WITH CHECK (
  (
    user_id = auth.uid()
    AND origem = 'app'
  )
  OR (
    empresa_id = public.current_empresa_id()
    AND origem = 'ajuste_manual'
    AND public.current_user_role() IN (
      'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
      'gerente', 'supervisao', 'gestor', 'diretoria'
    )
  )
);

-- Exclusão do dia (para substituir ajuste manual)
DROP POLICY IF EXISTS delete_ponto_registros ON public.ponto_registros;
CREATE POLICY delete_ponto_registros ON public.ponto_registros
FOR DELETE
TO authenticated
USING (
  empresa_id = public.current_empresa_id()
  AND public.current_user_role() IN (
    'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
    'gerente', 'supervisao', 'gestor', 'diretoria'
  )
);
