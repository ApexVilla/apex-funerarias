-- Fênix de Ipameri: CNPJ da filial (03.617.822/0003-76) e telefone.

UPDATE public.empresas
SET
  cnpj = '03617822000376',
  telefone = COALESCE(NULLIF(trim(telefone), ''), '6434913702')
WHERE id = 'a1c5a3c4-39d9-4191-ad5c-244d827eb52e'
   OR lower(nome) LIKE '%ipameri%';
