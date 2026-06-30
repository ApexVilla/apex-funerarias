-- Corpus Christi 2026 — filial Catalão (Fênix de Catalão).
INSERT INTO public.ponto_feriados (empresa_id, filial_id, data, nome)
VALUES (
  'a3c5a058-f8c5-40e8-a55f-0fefe866848d',
  '55b17d41-6735-4f5b-9822-717ac17f281e',
  '2026-06-04',
  'Corpus Christi'
)
ON CONFLICT (filial_id, data) DO UPDATE SET nome = EXCLUDED.nome;
