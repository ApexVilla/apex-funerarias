/** Nome do plano para listagens: usa o cadastro no banco (não troca Catálão Padrão por Fênix pelo valor R$ 53). */
export function nomePlanoParaExibicao(
  nomeDb?: string | null,
  valorCentavos?: number | null,
  codigo?: string | null,
): string {
  const nome = (nomeDb || '').trim();
  if (nome) return nome;
  const valor = valorCentavos ?? 0;
  if (valor === 6800) return 'Plano Ônix';
  if (valor === 5300) return 'Plano Fênix';
  return (codigo || '').trim() || 'Plano';
}
