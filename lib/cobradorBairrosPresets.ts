/**
 * Listas fixas de bairros por cobrador/rota (Catalão — GO e região).
 * Use no cadastro do cobrador ou em migrations de carga inicial.
 */

/** Rota completa — Bruno Rosa Bernades (Catalão — GO). */
export const COBRADOR_BRUNO_CATALAO_BAIRROS: readonly string[] = [
  'AEROPORTO',
  'AYRTON SENNA',
  'BAIRRO DAS AMERICAS',
  'BAIRRO DOS LUCAS',
  'CENTRO',
  'CIDADE JARDIM',
  'CONQUISTA',
  'COPACABANA',
  'CRUZEIRO',
  'CRUZEIRO I',
  'CRUZEIRO II',
  'DAS AMERICAS',
  'DONA MATILDE',
  'DONA SOFIA',
  'ELIAS SAFATLE',
  'EVELINA NOUR',
  'GOIANIENCE',
  'GOIANIENSE',
  'IPANEMA',
  'JARDIM FLORENCA',
  'JARDIM PRIMAVERA',
  'LAGO DAS MANSOES',
  'LEBLON',
  'MAE DE DEUS',
  'MORADA DO SOL',
  'NOVO HORIZONTE',
  'PARATI',
  'PARQUE DOS BURITIS',
  'PARQUE IMPERIAL',
  'PAULISTA',
  'PRIMAVERA',
  'PROGRESSO',
  'RESIDENCIAL PARATI',
  'SANTA CRUZ',
  'SANTA HELENA',
  'SANTA HELENA II',
  'SANTA MONICA',
  'SANTA RITA',
  'SAO FRANCISCO',
  'SAO JOAO',
  'SAO LUCAS',
  'SETOR LEAO',
  'SETOR UNIVERSITARIO',
  'TEOTONIO VILELA',
  'UNIVERSITARIO',
  'VILA CHAUD',
  'VILA CRUZEIRO',
  'VILA MARIA',
  'VILA UNIAO',
] as const;

export function cobradorNomeEhBrunoCatalao(nome: string): boolean {
  const n = (nome || '').trim().toLowerCase();
  return n.includes('bruno');
}

export function bairrosPresetBrunoCatalao(): string[] {
  return [...COBRADOR_BRUNO_CATALAO_BAIRROS];
}
