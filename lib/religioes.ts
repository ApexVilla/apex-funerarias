export type ReligiaoOpcao = {
  value: string;
  label: string;
};

export const RELIGIOES: ReligiaoOpcao[] = [
  { value: 'catolica', label: 'Católica' },
  { value: 'evangelica', label: 'Evangélica' },
  { value: 'espirita', label: 'Espírita' },
  { value: 'umbanda', label: 'Umbanda' },
  { value: 'candomble', label: 'Candomblé' },
  { value: 'adventista', label: 'Adventista' },
  { value: 'batista', label: 'Batista' },
  { value: 'presbiteriana', label: 'Presbiteriana' },
  { value: 'luterana', label: 'Luterana' },
  { value: 'metodista', label: 'Metodista' },
  { value: 'assembleia_de_deus', label: 'Assembleia de Deus' },
  { value: 'testemunha_de_jeova', label: 'Testemunha de Jeová' },
  { value: 'mormon', label: 'Mórmon' },
  { value: 'judaica', label: 'Judaica' },
  { value: 'islamica', label: 'Islâmica' },
  { value: 'budista', label: 'Budista' },
  { value: 'hinduista', label: 'Hinduísta' },
  { value: 'sem_religiao', label: 'Sem religião' },
  { value: 'ateu', label: 'Ateu(ia)' },
  { value: 'agnostico', label: 'Agnóstico(a)' },
  { value: 'outra', label: 'Outra' },
];

export function normalizarBuscaReligiao(valor: string): string {
  return (valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const MAP_LABEL_POR_VALUE = new Map(RELIGIOES.map((r) => [r.value.toLowerCase(), r.label]));

export function labelReligiao(val?: string | null): string {
  if (!val) return '';
  const key = String(val).trim().toLowerCase();
  return MAP_LABEL_POR_VALUE.get(key) ?? String(val).trim();
}

export function textoExibicaoReligiao(valorSalvo?: string | null): string {
  if (!valorSalvo?.trim()) return '';
  const trimmed = valorSalvo.trim();
  const porCodigo = MAP_LABEL_POR_VALUE.get(trimmed.toLowerCase());
  if (porCodigo) return porCodigo;
  const exata = RELIGIOES.find((r) => r.label.toLowerCase() === trimmed.toLowerCase());
  if (exata) return exata.label;
  return trimmed;
}
