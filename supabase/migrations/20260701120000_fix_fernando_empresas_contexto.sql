-- Fernando: empresa cadastrada em Catalão, mas empresas_contexto só marcava Ipameri.
UPDATE public.users
SET
  permissoes = jsonb_set(
    COALESCE(permissoes, '{}'::jsonb),
    '{empresas_contexto}',
    jsonb_build_object(
      'a3c5a058-f8c5-40e8-a55f-0fefe866848d', true
    )
  ),
  updated_at = now()
WHERE lower(email) = 'fernando@fenixfuneraria.com'
  AND empresa_id = 'a3c5a058-f8c5-40e8-a55f-0fefe866848d';
