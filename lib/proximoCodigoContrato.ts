import { supabase } from './supabase';

/** Formato padrão de número de contrato. */
export function formatarCodigoContrato(n: number): string {
  if (!Number.isFinite(n) || n < 1) return 'CTR-000001';
  return `CTR-${String(n).padStart(6, '0')}`;
}

/**
 * Próximo código de contrato na unidade (CTR-000001, …).
 * Preferência: RPC atômico; fallback local se indisponível.
 */
export async function gerarProximoCodigoContrato(empresaId: string): Promise<string> {
  const emp = (empresaId || '').trim();
  if (!emp) return formatarCodigoContrato(1);

  try {
    const { data, error } = await supabase.rpc('fn_proximo_codigo_contrato', {
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
    .from('assinaturas')
    .select('codigo')
    .eq('empresa_id', emp)
    .order('created_at', { ascending: false })
    .limit(500);

  let maxNum = 0;
  for (const row of rows || []) {
    const digits = String((row as { codigo?: string }).codigo || '').replace(/\D/g, '');
    const numero = parseInt(digits, 10);
    if (!Number.isNaN(numero)) maxNum = Math.max(maxNum, numero);
  }

  for (let n = maxNum + 1; n < maxNum + 5000; n++) {
    const codigo = formatarCodigoContrato(n);
    const { data: exists } = await supabase
      .from('assinaturas')
      .select('id')
      .eq('empresa_id', emp)
      .eq('codigo', codigo)
      .maybeSingle();
    if (!exists) return codigo;
  }

  return formatarCodigoContrato(Date.now() % 1_000_000);
}
