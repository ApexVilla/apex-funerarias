/**
 * Opções padronizadas para "Cidade / região de atuação" do cobrador.
 * Inclua aqui novas bases conforme a operação crescer.
 */
export const COBRADOR_REGIAO_PRESET_OUTRA = '__outra__' as const;

const OPCOES_BASE = [
  'Águas Lindas de Goiás — GO',
  'Anápolis — GO',
  'Aparecida de Goiânia — GO',
  'Caldas Novas — GO',
  'Catalão — GO',
  'Formosa — GO',
  'Goiânia — GO',
  'Goiás — GO',
  'Ipameri — GO',
  'Itumbiara — GO',
  'Jaraguá — GO',
  'Jataí — GO',
  'Luziânia — GO',
  'Mineiros — GO',
  'Morrinhos — GO',
  'Novo Gama — GO',
  'Planaltina — GO',
  'Porangatu — GO',
  'Rio Verde — GO',
  'Senador Canedo — GO',
  'Trindade — GO',
  'Uruaçu — GO',
  'Valparaíso de Goiás — GO',
] as const;

/** Lista ordenada para o select (sem a opção "Outra"). */
export const COBRADOR_REGIOES_ATUACAO_OPCOES: readonly string[] = [...OPCOES_BASE].sort((a, b) =>
  a.localeCompare(b, 'pt-BR'),
);

export function cobradorRegiaoEhPreset(gravado: string): boolean {
  const t = (gravado || '').trim();
  return t !== '' && COBRADOR_REGIOES_ATUACAO_OPCOES.includes(t);
}
