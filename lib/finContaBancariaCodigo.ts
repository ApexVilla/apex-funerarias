import { supabase } from './supabase';

/** Próximo código interno CB-#### por empresa (evita colisão por count). */
export async function proximoCodigoContaBancaria(empresaId: string): Promise<string> {
  const eid = empresaId.trim();
  if (!eid) throw new Error('Empresa não informada para gerar código da conta.');

  const { data, error } = await supabase.rpc('fn_proximo_codigo_conta_bancaria', {
    p_empresa_id: eid,
  });
  if (!error && data) return String(data);

  const { data: rows, error: qErr } = await supabase
    .from('fin_contas_bancarias')
    .select('codigo')
    .eq('empresa_id', eid)
    .ilike('codigo', 'CB-%');

  if (qErr) throw qErr;

  let max = 0;
  for (const row of rows || []) {
    const m = String(row.codigo || '').match(/^CB-(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `CB-${String(max + 1).padStart(4, '0')}`;
}
