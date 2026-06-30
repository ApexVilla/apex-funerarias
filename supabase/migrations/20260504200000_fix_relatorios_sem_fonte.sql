-- Relatórios cadastrados sem fonte ou query SQL vazia: usa placeholder para execução no app

update public.rel_configuracao
set
  tipo_fonte = 'function',
  fonte_nome = 'fn_relatorio_placeholder'
where ativo = true
  and (
    (tipo_fonte = 'query' and (query_sql is null or btrim(query_sql) = ''))
    or (fonte_nome is null or btrim(fonte_nome) = '')
  );
