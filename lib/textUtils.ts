/**
 * Utilitários de texto centralizados.
 *
 * Elimina duplicação de funções `.normalize('NFD')` espalhadas pelo projeto.
 * Importar daqui garante comportamento consistente em todas as buscas.
 */

/**
 * Remove acentos, converte para minúsculas e trima o texto.
 * Usado em todas as buscas textuais do front-end.
 */
export function normalizeSearchText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/** Vogais/consoantes com variantes acentuadas comuns em português. */
const ACENTOS_BUSCA_PT: Record<string, string[]> = {
  a: ['a', 'á', 'à', 'â', 'ã'],
  e: ['e', 'é', 'ê'],
  i: ['i', 'í'],
  o: ['o', 'ó', 'ô', 'õ'],
  u: ['u', 'ú'],
  c: ['c', 'ç'],
};

/**
 * Gera variantes do termo com acentuação para ILIKE no Postgres
 * (ex.: "jose" → "josé", "jóse"…), limitado para não estourar o filtro `.or()`.
 */
export function variantesBuscaAcento(termo: string, max = 16): string[] {
  const base = termo.trim().replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!base) return [];

  const lower = base.toLowerCase();
  const out = new Set<string>([base, lower]);
  const norm = normalizeSearchText(base);
  if (norm) out.add(norm);

  const chars = [...lower];
  const slots: { i: number; alts: string[] }[] = [];
  chars.forEach((ch, i) => {
    const alts = ACENTOS_BUSCA_PT[ch];
    if (alts) slots.push({ i, alts });
  });

  for (const { i, alts } of slots) {
    for (const alt of alts) {
      if (out.size >= max) break;
      const next = [...chars];
      next[i] = alt;
      out.add(next.join(''));
    }
  }

  if (out.size < max && slots.length > 0 && slots.length <= 5) {
    const cartesian = (pos: number, cur: string[]): void => {
      if (out.size >= max) return;
      if (pos >= slots.length) {
        out.add(cur.join(''));
        return;
      }
      const { i, alts } = slots[pos];
      for (const alt of alts) {
        const next = [...cur];
        next[i] = alt;
        cartesian(pos + 1, next);
      }
    };
    cartesian(0, chars);
  }

  return [...out].slice(0, max);
}

/**
 * Extrai apenas dígitos de uma string.
 * Útil para normalizar CPF, CNPJ, telefone antes de buscar.
 */
export function extractDigits(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Formata dígitos de CPF com máscara (000.000.000-00).
 * Retorna string vazia se não tiver exatamente 11 dígitos.
 */
export function maskCpf(digits: string): string {
  if (digits.length !== 11) return '';
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Stopwords ignoradas nas buscas tokenizadas do financeiro. */
export const SEARCH_STOPWORDS = new Set([
  'fornecedor',
  'fornecedores',
  'cliente',
  'clientes',
  'conta',
  'contas',
  'receber',
  'pagar',
  'parcela',
  'parcelas',
]);
