/** Valores aceitos por `assinaturas.status` (CHECK no Postgres). */
export type AssinaturaStatusDb = 'ativo' | 'suspenso' | 'cancelado' | 'inadimplente';

const STATUS_MAP: Record<string, AssinaturaStatusDb> = {
  ativo: 'ativo',
  ativa: 'ativo',
  suspenso: 'suspenso',
  suspensa: 'suspenso',
  cancelado: 'cancelado',
  cancelada: 'cancelado',
  inadimplente: 'inadimplente',
};

const FORMAS_VALIDAS = new Set([
  'cartao_credito',
  'debito_auto',
  'boleto',
  'pix',
  'dinheiro',
  'transferencia',
  'cobrador',
  'escritorio',
]);

/** Normaliza status legado (ex.: cancelada → cancelado) para gravar em `assinaturas`. */
export function normalizarStatusAssinatura(
  status?: string | null,
  fallback: AssinaturaStatusDb = 'ativo',
): AssinaturaStatusDb {
  const key = String(status || '')
    .toLowerCase()
    .trim();
  return STATUS_MAP[key] || fallback;
}

export function assinaturaEstaCancelada(status?: string | null): boolean {
  const s = String(status || '').toLowerCase().trim();
  return s === 'cancelado' || s === 'cancelada';
}

/** Normaliza forma de pagamento do contrato para o CHECK de `assinaturas`. */
export function normalizarFormaPagamentoAssinatura(
  forma?: string | null,
  fallback = 'boleto',
): string {
  const key = String(forma || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!key) return fallback;
  if (key === 'debito_automatico' || key === 'debito automatico') return 'debito_auto';
  if (FORMAS_VALIDAS.has(key)) return key;
  return fallback;
}
