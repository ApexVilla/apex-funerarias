/** Siglas válidas de UF (Brasil). */
export const UF_SIGLAS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

export type UfSigla = (typeof UF_SIGLAS)[number];

const UF_SET = new Set<string>(UF_SIGLAS);

/** Nome do estado (sem acento, maiúsculas) → sigla. */
const UF_NOME_PARA_SIGLA: Record<string, UfSigla> = {
  ACRE: 'AC',
  ALAGOAS: 'AL',
  AMAZONAS: 'AM',
  AMAPA: 'AP',
  BAHIA: 'BA',
  CEARA: 'CE',
  'DISTRITO FEDERAL': 'DF',
  'ESPIRITO SANTO': 'ES',
  GOIAS: 'GO',
  MARANHAO: 'MA',
  'MINAS GERAIS': 'MG',
  'MATO GROSSO DO SUL': 'MS',
  'MATO GROSSO': 'MT',
  PARA: 'PA',
  PARAIBA: 'PB',
  PERNAMBUCO: 'PE',
  PIAUI: 'PI',
  PARANA: 'PR',
  'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN',
  RONDONIA: 'RO',
  RORAIMA: 'RR',
  'RIO GRANDE DO SUL': 'RS',
  'SANTA CATARINA': 'SC',
  SERGIPE: 'SE',
  'SAO PAULO': 'SP',
  TOCANTINS: 'TO',
};

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Converte entrada livre (sigla, nome, ViaCEP) para sigla de 2 letras ou vazio. */
export function normalizarUfBrasil(raw: string | null | undefined): string {
  const t = semAcento((raw ?? '').trim().toUpperCase());
  if (!t) return '';
  if (t.length === 2 && UF_SET.has(t)) return t;
  const porNome = UF_NOME_PARA_SIGLA[t] ?? UF_NOME_PARA_SIGLA[semAcento(t)];
  if (porNome) return porNome;
  if (t.length === 2) return t;
  return '';
}

export function ufBrasilValida(raw: string | null | undefined): boolean {
  const uf = normalizarUfBrasil(raw);
  return uf.length === 2 && UF_SET.has(uf);
}

/** Valor seguro para `<select>`: sigla válida ou vazio. */
export function resolverUfParaSelect(raw: string | null | undefined): string {
  const uf = normalizarUfBrasil(raw);
  return ufBrasilValida(uf) ? uf : '';
}
