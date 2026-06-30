import { supabase } from './supabase';

/** Formato padrão de título a pagar (somente dígitos após o prefixo). */
export function formatarCodigoContaPagar(n: number): string {
  if (!Number.isFinite(n) || n < 1) return 'CP-000001';
  return `CP-${String(n).padStart(6, '0')}`;
}

/**
 * Próximo código de conta a pagar na unidade (CP-000001, …).
 * Preferência: RPC atômico; fallback local se indisponível.
 */
export async function gerarProximoCodigoContaPagar(empresaId: string): Promise<string> {
  const emp = (empresaId || '').trim();
  if (!emp) return formatarCodigoContaPagar(1);

  try {
    const { data, error } = await supabase.rpc('fn_proximo_codigo_conta_pagar', {
      p_empresa_id: emp,
    });
    if (!error && data) {
      const codigo = String(data).trim();
      if (codigo) return codigo;
    }
  } catch {
    /* fallback */
  }

  const { data: rows } = await supabase
    .from('fin_contas_pagar')
    .select('codigo')
    .eq('empresa_id', emp)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);

  let maxNum = 0;
  for (const row of rows || []) {
    const cod = String((row as { codigo?: string }).codigo || '');
    if (!/^CP-\d{6}$/i.test(cod)) continue;
    const numero = parseInt(cod.replace(/\D/g, ''), 10);
    if (!Number.isNaN(numero)) maxNum = Math.max(maxNum, numero);
  }

  for (let n = maxNum + 1; n < maxNum + 5000; n++) {
    const codigo = formatarCodigoContaPagar(n);
    const { data: exists } = await supabase
      .from('fin_contas_pagar')
      .select('id')
      .eq('empresa_id', emp)
      .eq('codigo', codigo)
      .maybeSingle();
    if (!exists) return codigo;
  }

  return formatarCodigoContaPagar((Date.now() % 1_000_000) + 1);
}

/** Busca por código: aceita "12", "000012" ou "CP-000012". */
export function contaPagarCodigoMatch(termo: string, codigo?: string | null): boolean {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  const c = String(codigo || '').toLowerCase();
  if (c.includes(t)) return true;
  const digitosTermo = t.replace(/\D/g, '');
  if (!digitosTermo) return false;
  const digitosCodigo = c.replace(/\D/g, '');
  return digitosCodigo.includes(digitosTermo) || digitosCodigo.endsWith(digitosTermo);
}
