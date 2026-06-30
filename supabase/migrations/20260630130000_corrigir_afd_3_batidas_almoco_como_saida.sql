-- AFD com 3 batidas: 3ª marcação ~1–3h após início do intervalo é volta do almoço, não saída.

UPDATE public.ponto_registros pr
SET tipo = 'fim_intervalo'
WHERE pr.tipo = 'saida'
  AND pr.origem = 'afd'
  AND EXISTS (
    SELECT 1
    FROM public.ponto_registros i
    WHERE i.user_id = pr.user_id
      AND i.tipo = 'inicio_intervalo'
      AND (i.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
        = (pr.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
      AND i.timestamp < pr.timestamp
      AND EXTRACT(EPOCH FROM (pr.timestamp - i.timestamp)) / 60 BETWEEN 1 AND 180
  )
  AND (
    SELECT COUNT(*)::int
    FROM public.ponto_registros d
    WHERE d.user_id = pr.user_id
      AND (d.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
        = (pr.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
  ) = 3
  AND NOT EXISTS (
    SELECT 1
    FROM public.ponto_registros f
    WHERE f.user_id = pr.user_id
      AND f.tipo = 'fim_intervalo'
      AND (f.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
        = (pr.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
  );
