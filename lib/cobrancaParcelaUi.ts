import { formatarCodigoCrExibicao } from './finCodigoCrExibicao';
import { obterMesReferencia } from './ReciboService';

export type ParcelaRotuloInput = {
  id: string;
  parcela_numero?: number;
  total_parcelas?: number;
  parcela_codigo?: string;
  codigo?: string;
  data_vencimento?: string;
};

function ordenarParcelasParaRotulo<T extends ParcelaRotuloInput>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    const va = String(a.data_vencimento || '');
    const vb = String(b.data_vencimento || '');
    if (va !== vb) return va.localeCompare(vb);
    const na = Number(a.parcela_numero) || 0;
    const nb = Number(b.parcela_numero) || 0;
    return na - nb;
  });
}

/**
 * Rótulo da parcela na carteira do cobrador / baixa (ex.: "3/14", "45").
 * Se parcela_numero e total_parcelas no banco estiverem incorretos (várias "1/1"),
 * usa a posição entre as pendentes em ordem de vencimento.
 */
export function rotuloParcelaCobranca(
  parcela: ParcelaRotuloInput,
  pendentes: ParcelaRotuloInput[],
): string {
  const ordenadas = ordenarParcelasParaRotulo(pendentes);
  const idx = ordenadas.findIndex((p) => p.id === parcela.id) + 1;
  const total = ordenadas.length;

  const num = Math.max(0, Number(parcela.parcela_numero) || 0);
  const totalDb = Math.max(0, Number(parcela.total_parcelas) || 0);

  const nums = ordenadas.map((p) => Number(p.parcela_numero) || 0).filter((n) => n > 0);
  const numerosSequenciaisDistintos =
    nums.length === ordenadas.length && new Set(nums).size === ordenadas.length;

  if (totalDb > 1 && numerosSequenciaisDistintos && num > 0) {
    return `${num}/${totalDb}`;
  }

  if (numerosSequenciaisDistintos && num > 0 && totalDb <= 1) {
    return String(num);
  }

  if (total > 1 && idx > 0) {
    return `${idx}/${total}`;
  }

  if (num > 0 && totalDb > 1) return `${num}/${totalDb}`;
  if (num > 0) return String(num);

  const cod = String(parcela.parcela_codigo || parcela.codigo || '').trim();
  return cod && cod !== '-' ? formatarCodigoCrExibicao(cod) : '—';
}

export function mesReferenciaCurto(dataVencimento: string): string {
  const ref = obterMesReferencia(dataVencimento);
  if (!ref || ref === '—') return '—';
  const [mes, ano] = ref.split('/').map((s) => s.trim());
  if (!mes || !ano) return ref;
  return `${mes.slice(0, 3)}/${ano}`;
}

export function resolverValorMensalPlanoCentavos(input: {
  valor_mensal_assinatura?: number | null;
  valor_mensal_plano?: number | null;
  valor_titulo_centavos?: number | null;
}): number {
  const a = Number(input.valor_mensal_assinatura || 0);
  if (a > 0) return Math.round(a);
  const p = Number(input.valor_mensal_plano || 0);
  if (p > 0) return Math.round(p);
  const t = Number(input.valor_titulo_centavos || 0);
  if (t > 0) return Math.round(t);
  return 0;
}

export function parcelaPendenteCobranca(status: string): boolean {
  return status !== 'cobrado';
}

/** CPF em uma linha compacta para carteira do cobrador. */
export function cpfExibicaoCobranca(cpf?: string | null): string {
  const d = String(cpf ?? '').replace(/\D/g, '');
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  const t = String(cpf ?? '').trim();
  return t || '—';
}
