import { supabase } from './supabase';

/** Formato exibido: 0001, 0002, …; a partir de 10000 o código ganha dígitos extras (10000). */
function formatarCodigoNumerico(n: number): string {
  return n < 10000 ? String(n).padStart(4, '0') : String(n);
}

/**
 * Código interno único por empresa (0001, 0002, …).
 * Evita colisão checando existência antes de devolver.
 */
export async function gerarCodigoProdutoInterno(empresaId: string): Promise<string> {
  const tentarApartirDe = async (inicio: number): Promise<string | null> => {
    let n = inicio;
    for (let i = 0; i < 5000; i++) {
      const codigo = formatarCodigoNumerico(n);
      const { data: exists } = await supabase
        .from('ser_produtos')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('codigo', codigo)
        .maybeSingle();
      if (!exists) return codigo;
      n += 1;
    }
    return null;
  };

  const { count, error: countErr } = await supabase
    .from('ser_produtos')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);

  if (countErr) {
    const achado = await tentarApartirDe(1);
    if (achado) return achado;
    return formatarCodigoNumerico(Date.now() % 1000000);
  }

  let n = (count ?? 0) + 1;
  const achado = await tentarApartirDe(n);
  if (achado) return achado;

  return formatarCodigoNumerico(Date.now() % 1000000);
}
