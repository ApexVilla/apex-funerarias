-- CTR-000487 / Lucia Eugenia V. de Farias: data_contratacao digitada como 2026 em vez de 2008.
UPDATE public.assinaturas
SET
  data_contratacao = DATE '2008-03-17',
  updated_at = now()
WHERE id = 'e3edb34a-9b72-47f3-9729-ce6f90e9918c'
  AND codigo = 'CTR-000487'
  AND data_contratacao = DATE '2026-03-17';
