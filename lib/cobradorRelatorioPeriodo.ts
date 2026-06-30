import { formatarCodigoCrExibicao } from './finCodigoCrExibicao';

/** Tipos e totais dos relatórios de período do cobrador (sintético / analítico). */

export type TipoRelatorioCobradorPeriodo = 'sintetico' | 'analitico';

export type ItemRelatorioCobradorPeriodo = {
  data: string;
  cliente_id?: string;
  cliente_codigo?: string;
  cliente_nome: string;
  contrato_codigo?: string;
  parcela_codigo?: string;
  parcela_numero?: number;
  total_parcelas?: number;
  /** Parcelas quitadas neste recebimento (padrão 1). */
  qtd_parcelas?: number;
  forma_pagamento: string;
  valor_centavos: number;
  status?: string;
};

export type ResumoSinteticoCobrador = {
  totalPixCentavos: number;
  totalCartaoCentavos: number;
  totalDinheiroCentavos: number;
  totalOutrosCentavos: number;
  qtdClientes: number;
  qtdRecebimentos: number;
  totalCentavos: number;
};

function normForma(forma: string): string {
  return String(forma || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

export function formaEhPix(forma: string): boolean {
  return normForma(forma) === 'pix';
}

export function formaEhCartao(forma: string): boolean {
  const f = normForma(forma);
  return f === 'cartao' || f.startsWith('cartao_') || f.includes('credito') || f.includes('debito');
}

export function formaEhDinheiro(forma: string): boolean {
  const f = normForma(forma);
  return f === 'dinheiro' || f === 'especie';
}

export function calcularResumoSintetico(itens: ItemRelatorioCobradorPeriodo[]): ResumoSinteticoCobrador {
  const clientes = new Set<string>();
  let totalPixCentavos = 0;
  let totalCartaoCentavos = 0;
  let totalDinheiroCentavos = 0;
  let totalOutrosCentavos = 0;
  let totalCentavos = 0;

  for (const item of itens) {
    const v = Number(item.valor_centavos) || 0;
    totalCentavos += v;
    const chave = item.cliente_id?.trim() || item.cliente_codigo?.trim() || item.cliente_nome;
    if (chave) clientes.add(chave);

    if (formaEhPix(item.forma_pagamento)) totalPixCentavos += v;
    else if (formaEhCartao(item.forma_pagamento)) totalCartaoCentavos += v;
    else if (formaEhDinheiro(item.forma_pagamento)) totalDinheiroCentavos += v;
    else totalOutrosCentavos += v;
  }

  return {
    totalPixCentavos,
    totalCartaoCentavos,
    totalDinheiroCentavos,
    totalOutrosCentavos,
    qtdClientes: clientes.size,
    qtdRecebimentos: itens.length,
    totalCentavos,
  };
}

/** Rótulo de parcelas: "3/12" ou "1 parc." */
export function rotuloParcelasItem(item: ItemRelatorioCobradorPeriodo): string {
  const qtd = Math.max(1, Number(item.qtd_parcelas) || 1);
  const num = Number(item.parcela_numero) || 0;
  const total = Number(item.total_parcelas) || 0;
  if (num > 0 && total > 0) {
    return qtd > 1 ? `${num}-${num + qtd - 1}/${total}` : `${num}/${total}`;
  }
  if (qtd > 1) return `${qtd} parc.`;
  const cod = item.parcela_codigo?.trim();
  if (cod) return formatarCodigoCrExibicao(cod);
  return '1 parc.';
}

export function rotuloContratoItem(item: ItemRelatorioCobradorPeriodo): string {
  const c = (item.contrato_codigo || '').trim();
  if (c && c !== '-') return c;
  const cli = (item.cliente_codigo || '').trim();
  return cli || '-';
}
