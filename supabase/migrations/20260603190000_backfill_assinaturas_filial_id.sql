-- Contratos gerados via proposta ficaram sem filial_id e somem na lista com filial selecionada.

UPDATE public.assinaturas a
SET filial_id = f.id,
    updated_at = now()
FROM public.clientes c,
     public.filiais f
WHERE a.cliente_id = c.id
  AND f.empresa_id = a.empresa_id
  AND a.filial_id IS NULL
  AND a.deleted_at IS NULL
  AND lower(trim(c.endereco_cidade)) = lower(trim(f.nome));

-- Fallback: demais contratos sem filial recebem a primeira filial não-matriz da empresa.
UPDATE public.assinaturas a
SET filial_id = sub.filial_id,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (a2.id)
    a2.id AS assinatura_id,
    f.id AS filial_id
  FROM public.assinaturas a2
  JOIN public.filiais f ON f.empresa_id = a2.empresa_id
  WHERE a2.filial_id IS NULL
    AND a2.deleted_at IS NULL
  ORDER BY a2.id, CASE WHEN f.nome ILIKE '%matriz%' THEN 1 ELSE 0 END, f.nome
) sub
WHERE a.id = sub.assinatura_id
  AND a.filial_id IS NULL;
