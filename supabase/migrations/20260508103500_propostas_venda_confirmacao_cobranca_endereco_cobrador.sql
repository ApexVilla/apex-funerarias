alter table public.propostas_venda
  add column if not exists cobranca_confirmada boolean not null default false,
  add column if not exists cobrador_endereco_mesmo_residencial boolean,
  add column if not exists cobrador_endereco_entrega text,
  add column if not exists cobrador_endereco_cep text,
  add column if not exists cobrador_endereco_cidade text,
  add column if not exists cobrador_endereco_uf text;
