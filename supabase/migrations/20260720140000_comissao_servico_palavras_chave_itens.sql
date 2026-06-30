-- Reforça palavras-chave para detectar itens reais do catálogo nas OS

UPDATE public.comissao_operacional_servico SET palavras_chave = ARRAY[
  'tanato', 'tanatopraxia', 'embalsam', 'embalsamamento'
], updated_at = now() WHERE codigo = 'tanato';

UPDATE public.comissao_operacional_servico SET palavras_chave = ARRAY[
  'sala de vel', 'sala vel', 'velorio', 'velório', 'sala de velorio'
], updated_at = now() WHERE codigo = 'sala';

UPDATE public.comissao_operacional_servico SET palavras_chave = ARRAY[
  'cortejo', 'cemiterio', 'cemitério'
], updated_at = now() WHERE codigo = 'cortejo';

UPDATE public.comissao_operacional_servico SET palavras_chave = ARRAY[
  'remocao', 'remoção', 'retirada', 'busca', 'remover', 'hospital'
], updated_at = now() WHERE codigo = 'retirada';

UPDATE public.comissao_operacional_servico SET palavras_chave = ARRAY[
  'terno', 'roupa', 'vestimenta', 'vestir', 'feminina'
], updated_at = now() WHERE codigo = 'roupa';
