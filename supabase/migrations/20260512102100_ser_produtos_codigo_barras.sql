ALTER TABLE public.ser_produtos ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_ser_produtos_codigo_barras ON public.ser_produtos(codigo_barras);
