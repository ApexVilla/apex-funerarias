-- Plano "Catálão Padrão" (R$ 53,00/mês) — unidade Fenix de Catalão.
-- Benefícios conforme contrato (Cláusula 4ª): atendimento funeral, intermediação e empréstimo de equipamentos.

DO $$
DECLARE
  v_catalao uuid := 'a3c5a058-f8c5-40e8-a55f-0fefe866848d';
  v_catalogo uuid := '00000000-0000-0000-0000-000000000001';
  v_plano_id uuid;
  v_codigo text;
  v_benef record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = v_catalao) THEN
    RAISE NOTICE 'Empresa Catalão não encontrada; migração ignorada.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.planos
    WHERE empresa_id = v_catalao
      AND deleted_at IS NULL
      AND lower(trim(nome)) IN ('catálão padrão', 'catalao padrao', 'catalão padrão')
  ) THEN
    RAISE NOTICE 'Plano Catálão Padrão já existe em Catalão.';
    RETURN;
  END IF;

  -- Benefícios novos no catálogo compartilhado (cria só se o nome ainda não existir)
  INSERT INTO public.beneficios (empresa_id, nome, descricao, tipo, ativo)
  SELECT v_catalogo, v.nome, v.descricao, 'funerario', true
  FROM (VALUES
    ('Higienização simples do corpo', 'Higienização simples do corpo (Cláusula 4ª, item 1)'),
    ('Sala de velório', 'Sala de velório para cerimônia'),
    ('Véu para velório', '1 véu para velório'),
    ('Kit Lanche (contrato padrão)', '1 kg café, 2 kg açúcar, 5 pacotes biscoitos, 1 L leite, 1 L suco, 100 g chá, 100 copos café, 100 copos água'),
    ('Livro de presença', 'Livro de presença no velório'),
    ('Anúncios em rádio FM', '5 anúncios em rádio FM'),
    ('Translado GO + 120 km após fronteira', 'Translado para todo o estado de Goiás + 120 km após a fronteira'),
    ('Indução de benefícios por intermediação', 'Descontos em convênios médicos, odontológicos e bem-estar (Cláusula 4ª, item 2)'),
    ('Empréstimo de equipamentos', 'Cadeira de rodas, muletas, andador, cadeira para banho — 3 meses renováveis (Cláusula 4ª, item 3)')
  ) AS v(nome, descricao)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.beneficios b
    WHERE b.empresa_id = v_catalogo AND lower(trim(b.nome)) = lower(trim(v.nome))
  );

  v_codigo := upper('PLN-' || substr(md5(v_catalao::text || 'CATALAOPADRAO'), 1, 8));
  WHILE EXISTS (SELECT 1 FROM public.planos z WHERE z.codigo = v_codigo) LOOP
    v_codigo := upper('PLN-' || substr(md5(v_catalao::text || random()::text || clock_timestamp()::text), 1, 8));
  END LOOP;

  INSERT INTO public.planos (
    codigo,
    nome,
    descricao,
    descricao_completa,
    categoria,
    status,
    valor_mensal_centavos,
    taxa_adesao_centavos,
    numero_max_beneficiarios,
    carencia_dias,
    beneficios,
    servicos_inclusos,
    empresa_id,
    kms_franquia_transporte
  )
  VALUES (
    v_codigo,
    'Catálão Padrão',
    'Plano funerário padrão Catálão — assistência conforme contrato (R$ 53,00/mês).',
    'PLANO CATÁLÃO PADRÃO' || chr(10) || chr(10)
      || 'Adesão: R$ 150,00 | Mensal: R$ 53,00' || chr(10) || chr(10)
      || '1. ATENDIMENTO FUNERAL (Cláusula 4ª, item 1)' || chr(10)
      || '- Urna mortuária padrão FÉNIX (envernizada, interior forrado)' || chr(10)
      || '- Higienização simples do corpo' || chr(10)
      || '- Sala de velório' || chr(10)
      || '- Flores naturais para ornamentação da urna' || chr(10)
      || '- Veículo especial para remoção' || chr(10)
      || '- Veículo especial para sepultamento' || chr(10)
      || '- 1 véu e 2 velas' || chr(10)
      || '- Kit lanche (café, açúcar, biscoitos, leite, suco, chá, copos)' || chr(10)
      || '- Livro de presença' || chr(10)
      || '- Cessão e montagem de paramentos (banner, cavaletes, castiçais, luminosos) conforme credo religioso' || chr(10)
      || '- 5 anúncios em rádio FM' || chr(10)
      || '- Translado: todo o estado de Goiás + 120 km após a fronteira' || chr(10) || chr(10)
      || '2. INDUÇÃO DE BENEFÍCIOS POR INTERMEDIAÇÃO (Cláusula 4ª, item 2)' || chr(10)
      || '- Convênios médicos, odontológicos e bem-estar (a administradora não responde por litígios)' || chr(10) || chr(10)
      || '3. EMPRÉSTIMO DE EQUIPAMENTOS (Cláusula 4ª, item 3)' || chr(10)
      || '- Cadeira de rodas, muletas, andador, cadeira para banho (associado em dia, comprovação)' || chr(10)
      || '- Empréstimo 3 meses, renovável por mais 3' || chr(10) || chr(10)
      || 'REGRAS:' || chr(10)
      || '- Carência: 90 dias para benefícios funerários (Cláusula 6ª)' || chr(10)
      || '- Durante a carência: 50% de desconto nos serviços fúnebres' || chr(10)
      || '- Inadimplência superior a 90 dias: perda dos benefícios (Cláusula 12ª)' || chr(10)
      || '- Reembolso fora da área de cobertura: até R$ 1.317,00 (Cláusula 9ª)' || chr(10) || chr(10)
      || 'NÃO INCLUSOS (Cláusula 20ª): urnas de luxo, vestuário, formolização, embalsamamento, reconstituição, cova ou carneiro.',
    'familiar',
    'ativo',
    5300,
    15000,
    6,
    90,
    '[
      {"nome":"Urna (Caixão)","incluido":true},
      {"nome":"Higienização simples do corpo","incluido":true},
      {"nome":"Sala de velório","incluido":true},
      {"nome":"Flores ornamentais","incluido":true},
      {"nome":"Remoção do corpo","incluido":true},
      {"nome":"Sepultamento","incluido":true},
      {"nome":"Véu para velório","incluido":true},
      {"nome":"Velas para velório","incluido":true},
      {"nome":"Kit Lanche (contrato padrão)","incluido":true},
      {"nome":"Livro de presença","incluido":true},
      {"nome":"Castiçais, Suporte, Paramentos","incluido":true},
      {"nome":"Anúncios em rádio FM","incluido":true},
      {"nome":"Translado GO + 120 km após fronteira","incluido":true},
      {"nome":"Indução de benefícios por intermediação","incluido":true},
      {"nome":"Empréstimo de equipamentos","incluido":true}
    ]'::jsonb,
    '[]'::jsonb,
    v_catalao,
    NULL
  )
  RETURNING id INTO v_plano_id;

  -- Vínculos normalizados planos_beneficios (catálogo + matriz Aparecida)
  FOR v_benef IN
    SELECT DISTINCT ON (lower(trim(b.nome))) b.id, b.nome,
      CASE lower(trim(b.nome))
        WHEN 'véu para velório' THEN 1
        WHEN 'velas para velório' THEN 2
        WHEN 'anúncios em rádio fm' THEN 5
        ELSE 1
      END AS qtd
    FROM public.beneficios b
    WHERE b.ativo = true
      AND b.empresa_id IN (v_catalogo, '04d81f24-6712-4929-a329-b01d369fe8cb')
      AND lower(trim(b.nome)) IN (
        lower('Urna (Caixão)'),
        lower('Higienização simples do corpo'),
        lower('Sala de velório'),
        lower('Flores ornamentais'),
        lower('Remoção do corpo'),
        lower('Sepultamento'),
        lower('Véu para velório'),
        lower('Velas para velório'),
        lower('Kit Lanche (contrato padrão)'),
        lower('Livro de presença'),
        lower('Castiçais, Suporte, Paramentos'),
        lower('Anúncios em rádio FM'),
        lower('Translado GO + 120 km após fronteira'),
        lower('Indução de benefícios por intermediação'),
        lower('Empréstimo de equipamentos')
      )
    ORDER BY lower(trim(b.nome)), (b.empresa_id = v_catalogo) DESC
  LOOP
    INSERT INTO public.planos_beneficios (empresa_id, plano_id, beneficio_id, quantidade, observacao)
    VALUES (
      v_catalao,
      v_plano_id,
      v_benef.id,
      v_benef.qtd,
      CASE
        WHEN lower(trim(v_benef.nome)) = lower('Urna (Caixão)')
          THEN 'Urna mortuária padrão FÉNIX — envernizada, interior forrado'
        WHEN lower(trim(v_benef.nome)) = lower('Velas para velório')
          THEN '2 velas'
        WHEN lower(trim(v_benef.nome)) = lower('Anúncios em rádio FM')
          THEN '5 anúncios'
        ELSE NULL
      END
    );
  END LOOP;

  -- Visibilidade apenas na unidade Catalão
  INSERT INTO public.planos_empresas (plano_id, empresa_id)
  VALUES (v_plano_id, v_catalao)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Plano Catálão Padrão criado: % (codigo %)', v_plano_id, v_codigo;
END;
$$;
