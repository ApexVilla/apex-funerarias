-- Vendedor/cobrador: intervalo no dia sem entrada vira entrada (marcação ~08h).
UPDATE public.ponto_registros pr
SET tipo = 'entrada'
WHERE pr.tipo IN ('inicio_intervalo', 'fim_intervalo')
  AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = pr.user_id
      AND lower(u.role) IN ('vendedor', 'cobrador')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.ponto_registros e
    WHERE e.user_id = pr.user_id
      AND e.tipo = 'entrada'
      AND (e.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
        = (pr.timestamp AT TIME ZONE 'America/Sao_Paulo')::date
  );

-- Vendedor/cobrador: 2ª batida do dia (intervalo) vira saída quando já há entrada.
UPDATE public.ponto_registros pr
SET tipo = 'saida'
WHERE pr.tipo IN ('inicio_intervalo', 'fim_intervalo')
  AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = pr.user_id
      AND lower(u.role) IN ('vendedor', 'cobrador')
  )
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
