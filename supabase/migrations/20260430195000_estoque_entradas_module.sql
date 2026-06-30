-- Módulo de Entradas de Estoque (compras/recebimentos)

CREATE TABLE IF NOT EXISTS public.estoque_entradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero_documento text NOT NULL,
  fornecedor_nome text,
  data_entrada date NOT NULL DEFAULT current_date,
  valor_total_centavos integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmada')),
  observacoes text,
  processado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.estoque_entrada_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada_id uuid NOT NULL REFERENCES public.estoque_entradas(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.ser_produtos(id) ON DELETE RESTRICT,
  quantidade numeric(12,3) NOT NULL CHECK (quantidade > 0),
  valor_unitario_centavos integer NOT NULL CHECK (valor_unitario_centavos >= 0),
  subtotal_centavos integer NOT NULL CHECK (subtotal_centavos >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estoque_entradas_empresa ON public.estoque_entradas (empresa_id, data_entrada DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_entrada_itens_entrada ON public.estoque_entrada_itens (entrada_id);
CREATE INDEX IF NOT EXISTS idx_estoque_entrada_itens_produto ON public.estoque_entrada_itens (produto_id);

ALTER TABLE IF EXISTS public.ser_produtos
  ADD COLUMN IF NOT EXISTS ultima_entrada_em timestamptz;

ALTER TABLE IF EXISTS public.ser_produtos
  ADD COLUMN IF NOT EXISTS ultima_entrada_valor_centavos integer;
