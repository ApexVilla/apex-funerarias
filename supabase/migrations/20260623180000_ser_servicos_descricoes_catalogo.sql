-- Descrições breves para serviços sem descrição (catálogo e PDF).

UPDATE public.ser_servicos SET descricao = 'Documentação e formalização do óbito', updated_at = now()
WHERE descricao IS NULL AND lower(trim(nome)) = 'formalização';

UPDATE public.ser_servicos SET descricao = 'Retirada do corpo no local do óbito', updated_at = now()
WHERE descricao IS NULL AND lower(trim(nome)) = 'remoção';

UPDATE public.ser_servicos SET descricao = 'Deslocamento cerimonial até cemitério ou crematório', updated_at = now()
WHERE descricao IS NULL AND lower(trim(nome)) = 'cortejo';

UPDATE public.ser_servicos SET descricao = 'Uso da sala de velório sem cortejo', updated_at = now()
WHERE descricao IS NULL AND lower(trim(nome)) LIKE 'sala de velório sem%';

UPDATE public.ser_servicos SET descricao = 'Sala de velório com cortejo até o sepultamento', updated_at = now()
WHERE descricao IS NULL AND lower(trim(nome)) LIKE 'sala de velório com%';

UPDATE public.ser_servicos SET descricao = 'Conservação e preparação do corpo — particular', updated_at = now()
WHERE descricao IS NULL AND lower(trim(nome)) = 'tanatopraxia particular';

UPDATE public.ser_servicos SET descricao = 'Procedimento de embalsamamento do corpo', updated_at = now()
WHERE descricao IS NULL AND lower(trim(nome)) = 'embalsamamento';

UPDATE public.ser_servicos SET descricao = 'Vela para ornamentação do velório', updated_at = now()
WHERE descricao IS NULL AND lower(trim(nome)) = 'vela';

UPDATE public.ser_servicos SET descricao = 'Paramentos e adornos para o velório — particular', updated_at = now()
WHERE descricao IS NULL AND lower(trim(nome)) = 'paramentação particular';

UPDATE public.ser_servicos SET descricao = 'Invólucro padrão para o corpo', updated_at = now()
WHERE descricao IS NULL AND lower(trim(nome)) = 'invólucro';

UPDATE public.ser_servicos SET descricao = 'Vestimenta masculina simples para apresentação', updated_at = now()
WHERE descricao IS NULL AND lower(trim(nome)) = 'terno masculino simples';

UPDATE public.ser_servicos SET descricao = 'Vestimenta feminina para apresentação do corpo', updated_at = now()
WHERE descricao IS NULL AND lower(trim(nome)) = 'vestimenta feminina';

UPDATE public.ser_servicos SET descricao = 'Valor por quilômetro — associado/plano', updated_at = now()
WHERE (descricao IS NULL OR descricao NOT ILIKE '%quilômetro%')
  AND lower(trim(nome)) = 'translado associado';

UPDATE public.ser_servicos SET descricao = 'Valor por quilômetro — particular', updated_at = now()
WHERE (descricao IS NULL OR descricao NOT ILIKE '%quilômetro%')
  AND lower(trim(nome)) = 'translado particular';
