-- Criação da tabela de Salas de Velório
CREATE TABLE IF NOT EXISTS public.ser_salas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    capacidade INTEGER NOT NULL DEFAULT 50,
    status VARCHAR(50) NOT NULL DEFAULT 'disponivel', -- 'disponivel', 'manutencao'
    localizacao VARCHAR(255),
    observacoes TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criação da tabela de Reservas de Salas
CREATE TABLE IF NOT EXISTS public.ser_salas_reservas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sala_id UUID NOT NULL REFERENCES public.ser_salas(id) ON DELETE CASCADE,
    atendimento_id UUID REFERENCES public.ser_atendimentos(id) ON DELETE SET NULL,
    falecido_nome VARCHAR(255),
    responsavel_nome VARCHAR(255),
    data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    data_fim TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'agendada', -- 'agendada', 'em_andamento', 'concluida', 'cancelada'
    observacoes TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE public.ser_salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ser_salas_reservas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir tudo para usuários autenticados em ser_salas" ON public.ser_salas;
CREATE POLICY "Permitir tudo para usuários autenticados em ser_salas" 
    ON public.ser_salas FOR ALL 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir tudo para usuários autenticados em ser_salas_reservas" ON public.ser_salas_reservas;
CREATE POLICY "Permitir tudo para usuários autenticados em ser_salas_reservas" 
    ON public.ser_salas_reservas FOR ALL 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Dados iniciais (seeds) para algumas salas
INSERT INTO public.ser_salas (nome, capacidade, localizacao)
VALUES 
  ('Capela A - Rubi', 100, 'Térreo'),
  ('Capela B - Esmeralda', 80, 'Térreo'),
  ('Capela C - Diamante', 150, '1º Andar'),
  ('Sala de Preparação 1', 0, 'Subsolo')
ON CONFLICT DO NOTHING;
