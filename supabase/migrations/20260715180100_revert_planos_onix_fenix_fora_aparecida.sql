-- Reverte alterações da migração 20260715180000 que afetaram Catalão/Ipameri por engano.
-- Escopo correto: apenas Fenix de Aparecida (04d81f24-6712-4929-a329-b01d369fe8cb).

DO $$
DECLARE
  v_catalao uuid := 'a3c5a058-f8c5-40e8-a55f-0fefe866848d';
  v_ipameri uuid;

  v_benef_fenix_antigo jsonb := '[
    {"nome":"Remoção do corpo","incluido":true},
    {"nome":"Urna (Caixão)","incluido":true},
    {"nome":"Cortejo","incluido":true},
    {"nome":"Tule Nylon","incluido":true},
    {"nome":"Velas para velório","incluido":true},
    {"nome":"Flores ornamentais","incluido":true},
    {"nome":"Sala de velório (Aparecida/Goiânia)","incluido":true},
    {"nome":"Castiçais, Suporte, Paramentos","incluido":true},
    {"nome":"Invol","incluido":true},
    {"nome":"Translado até 280 KM","incluido":true},
    {"nome":"Clínicas e Dentistas Conveniados","incluido":true}
  ]'::jsonb;

  v_benef_onix_antigo jsonb := '[
    {"nome":"Remoção do corpo","incluido":true},
    {"nome":"Urna (Caixão)","incluido":true},
    {"nome":"Cortejo","incluido":true},
    {"nome":"Tule Nylon","incluido":true},
    {"nome":"Velas para velório","incluido":true},
    {"nome":"Flores ornamentais","incluido":true},
    {"nome":"Sala de velório (Aparecida/Goiânia)","incluido":true},
    {"nome":"Castiçais, Suporte, Paramentos","incluido":true},
    {"nome":"Invol","incluido":true},
    {"nome":"Translado todo estado de Goiás e Brasília","incluido":true},
    {"nome":"Preparação do corpo (Tanatopraxia/Embalsamamento)","incluido":true},
    {"nome":"Terno masculino/Roupa feminina","incluido":true},
    {"nome":"Coroa de Flores","incluido":true},
    {"nome":"Clínicas e Dentistas Conveniados","incluido":true}
  ]'::jsonb;
BEGIN
  SELECT id INTO v_ipameri
  FROM public.empresas
  WHERE lower(trim(nome)) LIKE '%ipameri%'
  LIMIT 1;

  -- Benefícios: restaurar Catalão e Ipameri (Aparecida permanece com a lista nova)
  UPDATE public.planos
  SET beneficios = v_benef_fenix_antigo, updated_at = now()
  WHERE deleted_at IS NULL
    AND empresa_id IN (v_catalao, v_ipameri)
    AND lower(trim(nome)) IN ('plano fênix', 'plano fenix');

  UPDATE public.planos
  SET beneficios = v_benef_onix_antigo, updated_at = now()
  WHERE deleted_at IS NULL
    AND empresa_id IN (v_catalao, v_ipameri)
    AND lower(trim(nome)) IN ('plano ônix', 'plano onix');

  -- Produtos de Catalão alterados indevidamente pela migração anterior
  UPDATE public.ser_produtos
  SET nome = 'Ônix M51 1.90 x 64', updated_at = now()
  WHERE id = '3b08a932-d314-4d25-93ad-fb7278e9be89'
    AND empresa_id = v_catalao;

  UPDATE public.ser_produtos
  SET nome = 'M05T 190 x 64 (plano)', preco_centavos = 345917, updated_at = now()
  WHERE id = 'c4c4f421-88e9-468a-b1b3-fde56e313d9b'
    AND empresa_id = v_catalao;

  UPDATE public.ser_produtos
  SET preco_centavos = 0, updated_at = now()
  WHERE id IN (
    'ad85f387-7568-4687-84d6-7b8c00a148b0',
    '5c30671a-12db-43fa-a754-8527207256e0',
    '5e7832c9-bd65-4d5b-8c3a-71d91d7087f5',
    'b5ea3112-4e45-4f42-ab29-38b62ad31f90'
  )
  AND empresa_id = v_catalao;
END;
$$;
