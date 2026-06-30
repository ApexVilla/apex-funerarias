import { supabase } from './supabase';

/** CNPJ matriz Fênix Aparecida — chave PIX padrão (tipo CNPJ). */
export const PIX_FENIX_APARECIDA_CNPJ = '03617822000295';

export function formatarCnpjExibicao(cnpj?: string | null): string {
  const d = String(cnpj || '').replace(/\D/g, '');
  if (d.length !== 14) return String(cnpj || '').trim() || '—';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Busca chave PIX: conta principal → qualquer conta → CNPJ da empresa. */
export async function buscarChavePixEmpresa(empresaId: string): Promise<string | null> {
  const { data: contas } = await supabase
    .from('fin_contas_bancarias')
    .select('pix_chave, principal')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .not('pix_chave', 'is', null);

  const ordenadas = (contas || []).sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0));
  for (const c of ordenadas) {
    const chave = String(c.pix_chave || '').trim();
    if (chave) return chave.replace(/\D/g, '').length === 14 ? chave.replace(/\D/g, '') : chave;
  }

  const { data: emp } = await supabase.from('empresas').select('cnpj').eq('id', empresaId).maybeSingle();
  const cnpj = String(emp?.cnpj || '').replace(/\D/g, '');
  if (cnpj.length === 14) return cnpj;

  return null;
}

/**
 * Payload simplificado para QR (copia e cola estático com valor).
 * Integração EMV completa pode substituir depois.
 */
export function montarPixCopiaColaEstatico(params: {
  chavePix: string;
  valorReais: number;
  nomeBeneficiario: string;
  cidade?: string;
  identificador?: string;
}): string {
  const valor = params.valorReais.toFixed(2);
  const id = (params.identificador || 'FENIX').slice(0, 25);
  return [
    `PIX — ${params.nomeBeneficiario}`,
    `Chave: ${params.chavePix}`,
    `Valor: R$ ${valor}`,
    `Ref: ${id}`,
    params.cidade ? `Cidade: ${params.cidade}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
