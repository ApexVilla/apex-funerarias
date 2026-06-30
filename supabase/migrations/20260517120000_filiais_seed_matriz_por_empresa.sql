-- Empresas sem nenhuma filial recebem uma filial padrão "Matriz".
-- Evita lista vazia no seletor do cabeçalho e mensagem "Cadastre filiais..." para quem já opera só com frota/estoque antigo.

INSERT INTO public.filiais (empresa_id, nome, ativo)
SELECT e.id, 'Matriz', true
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM public.filiais f WHERE f.empresa_id = e.id
);
