-- Contratos da Fênix de Catalão sem filial: vincula à filial "Catalão" da mesma empresa.
UPDATE public.assinaturas a
SET filial_id = f.id
FROM public.filiais f
WHERE a.empresa_id = f.empresa_id
  AND a.filial_id IS NULL
  AND a.deleted_at IS NULL
  AND f.ativo = true
  AND lower(trim(f.nome)) = 'catalão'
  AND a.empresa_id = 'a3c5a058-f8c5-40e8-a55f-0fefe866848d';
