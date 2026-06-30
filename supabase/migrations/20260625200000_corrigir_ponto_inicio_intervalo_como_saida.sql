-- Corrige importação AFD antiga: 2 batidas no dia viravam entrada + inicio_intervalo
-- em vez de entrada + saída (ex.: Lucas Mirada e demais agentes/atendentes Aparecida).

UPDATE public.ponto_registros pr
SET tipo = 'saida'
WHERE pr.tipo = 'inicio_intervalo'
  AND EXISTS (
    SELECT 1
    FROM public.ponto_registros e
    WHERE e.user_id = pr.user_id
      AND e.tipo = 'entrada'
      AND e.timestamp < pr.timestamp
      AND (e.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
        = (pr.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.ponto_registros f
    WHERE f.user_id = pr.user_id
      AND f.tipo = 'fim_intervalo'
      AND (f.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
        = (pr.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.ponto_registros s
    WHERE s.user_id = pr.user_id
      AND s.tipo = 'saida'
      AND (s.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
        = (pr.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
  )
  AND (
    SELECT COUNT(*)::int
    FROM public.ponto_registros d
    WHERE d.user_id = pr.user_id
      AND (d.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
        = (pr.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
  ) = 2;
