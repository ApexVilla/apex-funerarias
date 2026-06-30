import { supabase } from './supabase';

/** Formato: 001, 002, … 999, 1000 (mínimo 3 dígitos). */
export function formatarCodigoClienteInterno(n: number): string {
  if (!Number.isFinite(n) || n < 1) return '001';
  return n < 1000 ? String(n).padStart(3, '0') : String(n);
}

/**
 * Próximo código interno numérico por empresa (001, 002, …).
 * Preferência: RPC atômico no banco; fallback local se indisponível.
 */
export async function gerarCodigoClienteInterno(empresaId: string): Promise<string> {
  const emp = (empresaId || '').trim();
  if (!emp) return formatarCodigoClienteInterno(1);

  try {
    const { data, error } = await supabase.rpc('fn_proximo_codigo_cliente', { p_empresa_id: emp });
    if (!error && data) {
      const codigo = String(data).trim();
      if (codigo) return codigo;
    }
  } catch {
    /* fallback abaixo */
  }

  const { data: rows } = await supabase
    .from('clientes')
    .select('codigo')
    .eq('empresa_id', emp)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);

  let maxNum = 0;
  for (const row of rows || []) {
    const raw = String((row as { codigo?: string }).codigo || '').trim();
    if (/^\d+$/.test(raw)) {
      maxNum = Math.max(maxNum, parseInt(raw, 10));
    }
  }

  for (let n = maxNum + 1; n < maxNum + 5000; n++) {
    const codigo = formatarCodigoClienteInterno(n);
    const { data: exists } = await supabase
      .from('clientes')
      .select('id')
      .eq('empresa_id', emp)
      .eq('codigo', codigo)
      .maybeSingle();
    if (!exists) return codigo;
  }

  return formatarCodigoClienteInterno(Date.now() % 100000);
}
