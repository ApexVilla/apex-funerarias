-- Fênix de Aparecida: CNPJ matriz e chave PIX (tipo CNPJ) na conta principal.

UPDATE public.empresas
SET cnpj = '03617822000295'
WHERE id = '04d81f24-6712-4929-a329-b01d369fe8cb'
   OR lower(nome) LIKE '%aparecida%';

UPDATE public.fin_contas_bancarias
SET
  pix_chave = '03617822000295',
  pix_tipo = 'cnpj'
WHERE empresa_id = '04d81f24-6712-4929-a329-b01d369fe8cb'
  AND principal = true;
