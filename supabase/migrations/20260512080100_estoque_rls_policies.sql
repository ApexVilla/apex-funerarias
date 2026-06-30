-- RLS policies para tabelas de estoque que ainda não possuem

-- estoque_entradas
ALTER TABLE public.estoque_entradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por empresa - Entradas Estoque" ON public.estoque_entradas
    FOR ALL USING (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()));

-- estoque_entrada_itens (acesso via entrada_id -> empresa_id)
ALTER TABLE public.estoque_entrada_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por empresa - Entrada Itens" ON public.estoque_entrada_itens
    FOR ALL USING (entrada_id IN (
        SELECT id FROM public.estoque_entradas
        WHERE empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid())
    ));

-- estoque_kits
ALTER TABLE public.estoque_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por empresa - Kits Estoque" ON public.estoque_kits
    FOR ALL USING (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()));

-- estoque_kit_itens (acesso via kit_id -> empresa_id)
ALTER TABLE public.estoque_kit_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por empresa - Kit Itens" ON public.estoque_kit_itens
    FOR ALL USING (kit_id IN (
        SELECT id FROM public.estoque_kits
        WHERE empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid())
    ));

-- fornecedores
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por empresa - Fornecedores" ON public.fornecedores
    FOR ALL USING (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()));

-- ser_produtos
ALTER TABLE public.ser_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por empresa - Produtos" ON public.ser_produtos
    FOR ALL USING (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()));
