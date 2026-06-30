-- Filiais típicas da rede Fênix por empresa (nome contém "fenix"/"fênix").
-- Idempotente: não duplica se já existir filial com o mesmo nome na empresa.

INSERT INTO public.filiais (empresa_id, nome, ativo)
SELECT e.id,
       v.nome,
       true
FROM public.empresas e
CROSS JOIN (
  VALUES
    ('Catalão'),
    ('Ipameri'),
    ('Aparecida de Goiânia')
) AS v(nome)
WHERE (
  COALESCE(NULLIF(trim(e.nome), ''), NULLIF(trim(e.razao_social), '')) ILIKE '%fenix%'
  OR COALESCE(NULLIF(trim(e.nome), ''), NULLIF(trim(e.razao_social), '')) ILIKE '%fênix%'
)
AND NOT EXISTS (
  SELECT 1
  FROM public.filiais f
  WHERE f.empresa_id = e.id
    AND lower(trim(f.nome)) = lower(trim(v.nome))
);
