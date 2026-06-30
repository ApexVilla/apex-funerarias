-- Cadastra departamentos padrão nas unidades Fênix que ainda não possuem (Catalão, Ipameri, etc.)

INSERT INTO public.departamentos (empresa_id, codigo, nome, ativo)
SELECT e.id, t.codigo, t.nome, true
FROM public.empresas e
CROSS JOIN (
  VALUES
    ('ATE', 'Atendimento'),
    ('COM', 'Comercial'),
    ('DIR', 'Diretoria'),
    ('FIN', 'Financeiro'),
    ('OPE', 'Operacional')
) AS t(codigo, nome)
WHERE e.nome ILIKE 'Fenix de %'
  AND NOT EXISTS (
    SELECT 1
    FROM public.departamentos d
    WHERE d.empresa_id = e.id
      AND d.nome = t.nome
      AND d.deleted_at IS NULL
  );
