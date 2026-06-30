-- Campos complementares para coleta operacional no atendimento funerário

ALTER TABLE IF EXISTS public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS local_velorio text;

ALTER TABLE IF EXISTS public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS local_sepultamento text;

ALTER TABLE IF EXISTS public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS religiao_falecido text;

ALTER TABLE IF EXISTS public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS data_falecido date;

ALTER TABLE IF EXISTS public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS data_nascimento_falecido date;

ALTER TABLE IF EXISTS public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS onde_corpo_se_encontra text;

ALTER TABLE IF EXISTS public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS motivo_morte text;

ALTER TABLE IF EXISTS public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS medico_nome_crm text;

ALTER TABLE IF EXISTS public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS declaracao_obito_certidao text;
