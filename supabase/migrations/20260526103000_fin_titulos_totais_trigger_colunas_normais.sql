-- Ambientes com colunas normais (não GENERATED) precisam preencher totais no INSERT
-- após o app deixar de enviar valor_total_centavos / valor_aberto_centavos (incompatível com GENERATED).
-- Só cria o trigger se valor_total_centavos não for coluna gerada (ex.: produção com GENERATED ignora).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'fin_contas_pagar'
      AND a.attname = 'valor_total_centavos'
      AND NOT a.attisdropped
      AND COALESCE(a.attgenerated, '')::text = ''
  ) THEN
    CREATE OR REPLACE FUNCTION public.fin_contas_pagar_totais_bi()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
    AS $f$
    BEGIN
      NEW.valor_total_centavos :=
        COALESCE(NEW.valor_original_centavos, 0)
        + COALESCE(NEW.valor_juros_centavos, 0)
        + COALESCE(NEW.valor_multa_centavos, 0)
        - COALESCE(NEW.valor_desconto_centavos, 0);
      NEW.valor_aberto_centavos :=
        NEW.valor_total_centavos - COALESCE(NEW.valor_pago_centavos, 0);
      RETURN NEW;
    END;
    $f$;

    DROP TRIGGER IF EXISTS fin_contas_pagar_totais_bi ON public.fin_contas_pagar;
    CREATE TRIGGER fin_contas_pagar_totais_bi
      BEFORE INSERT OR UPDATE OF
        valor_original_centavos,
        valor_juros_centavos,
        valor_multa_centavos,
        valor_desconto_centavos,
        valor_pago_centavos
      ON public.fin_contas_pagar
      FOR EACH ROW
      EXECUTE FUNCTION public.fin_contas_pagar_totais_bi();
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'fin_contas_receber'
      AND a.attname = 'valor_total_centavos'
      AND NOT a.attisdropped
      AND COALESCE(a.attgenerated, '')::text = ''
  ) THEN
    CREATE OR REPLACE FUNCTION public.fin_contas_receber_totais_bi()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
    AS $f$
    BEGIN
      NEW.valor_total_centavos :=
        COALESCE(NEW.valor_original_centavos, 0)
        + COALESCE(NEW.valor_juros_centavos, 0)
        + COALESCE(NEW.valor_multa_centavos, 0)
        - COALESCE(NEW.valor_desconto_centavos, 0);
      NEW.valor_aberto_centavos :=
        NEW.valor_total_centavos - COALESCE(NEW.valor_pago_centavos, 0);
      RETURN NEW;
    END;
    $f$;

    DROP TRIGGER IF EXISTS fin_contas_receber_totais_bi ON public.fin_contas_receber;
    CREATE TRIGGER fin_contas_receber_totais_bi
      BEFORE INSERT OR UPDATE OF
        valor_original_centavos,
        valor_juros_centavos,
        valor_multa_centavos,
        valor_desconto_centavos,
        valor_pago_centavos
      ON public.fin_contas_receber
      FOR EACH ROW
      EXECUTE FUNCTION public.fin_contas_receber_totais_bi();
  END IF;
END;
$$;
