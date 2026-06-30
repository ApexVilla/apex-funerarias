-- Departamentos operacionais da baixa de estoque em todas as unidades Fênix
-- (Clínica, Almoxarifado, Velório, Atendimento)

INSERT INTO public.departamentos (empresa_id, codigo, nome, ativo)
SELECT e.id, t.codigo, t.nome, true
FROM public.empresas e
CROSS JOIN (
  VALUES
    ('ALM', 'Almoxarifado'),
    ('ATE', 'Atendimento'),
    ('CLI', 'Clínica'),
    ('VEL', 'Velório')
) AS t(codigo, nome)
WHERE e.nome ILIKE 'Fenix de %'
  AND NOT EXISTS (
    SELECT 1
    FROM public.departamentos d
    WHERE d.empresa_id = e.id
      AND lower(trim(d.nome)) = lower(trim(t.nome))
      AND d.deleted_at IS NULL
  );
