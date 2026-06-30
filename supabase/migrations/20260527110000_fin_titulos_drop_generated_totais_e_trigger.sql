-- Colunas GENERATED em valor_*_centavos fazem o Postgres rejeitar qualquer valor no INSERT
-- ("cannot insert a non-default value"). Remove a expressão gerada (mantém tipo/dados),
-- define default e passa a recalcular totais por trigger (mesma fórmula do app).

ALTER TABLE public.fin_contas_pagar
  ALTER COLUMN valor_aberto_centavos DROP EXPRESSION IF EXISTS;
ALTER TABLE public.fin_contas_pagar
  ALTER COLUMN valor_total_centavos DROP EXPRESSION IF EXISTS;

ALTER TABLE public.fin_contas_receber
  ALTER COLUMN valor_aberto_centavos DROP EXPRESSION IF EXISTS;
ALTER TABLE public.fin_contas_receber
  ALTER COLUMN valor_total_centavos DROP EXPRESSION IF EXISTS;

ALTER TABLE public.fin_contas_pagar
  ALTER COLUMN valor_total_centavos SET DEFAULT 0,
  ALTER COLUMN valor_aberto_centavos SET DEFAULT 0;

ALTER TABLE public.fin_contas_receber
  ALTER COLUMN valor_total_centavos SET DEFAULT 0,
  ALTER COLUMN valor_aberto_centavos SET DEFAULT 0;

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

NOTIFY pgrst, 'reload schema';
