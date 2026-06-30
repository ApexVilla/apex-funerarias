-- Sessões retroativas de sincronização devem ficar abertas até conferência física.
-- Reabre as que foram criadas fechadas sem saldo informado.

UPDATE fin_caixa_sessoes
   SET status = 'aberto',
       data_fechamento = NULL,
       usuario_fechamento_id = NULL,
       observacoes_fechamento = NULL
 WHERE status = 'fechado'
   AND saldo_informado_centavos IS NULL
   AND (
       COALESCE(observacoes_abertura, '') ILIKE '%Sessão retroativa%'
       OR COALESCE(observacoes_fechamento, '') ILIKE '%Sessão retroativa%'
   );
