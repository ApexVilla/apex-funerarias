export type ParentescoGrupoId =
  | 'conjugal'
  | 'filhos'
  | 'pais'
  | 'avos'
  | 'irmaos'
  | 'tios'
  | 'netos'
  | 'sogros'
  | 'outros';

export type ParentescoOpcao = {
  value: string;
  label: string;
  /** Exibição curta em listas, tabelas e cache. */
  abrev: string;
  grupo: ParentescoGrupoId;
};

export const PARENTESCO_GRUPOS: { id: ParentescoGrupoId; label: string }[] = [
  { id: 'conjugal', label: 'Cônjuge' },
  { id: 'filhos', label: 'Filhos' },
  { id: 'pais', label: 'Pais' },
  { id: 'avos', label: 'Avós' },
  { id: 'irmaos', label: 'Irmãos' },
  { id: 'tios', label: 'Tios' },
  { id: 'netos', label: 'Netos e genros' },
  { id: 'sogros', label: 'Sogros' },
  { id: 'outros', label: 'Outros' },
];

export const PARENTESCO_OPCOES: ParentescoOpcao[] = [
  { value: 'esposo', label: 'Esposo(a)', abrev: 'Cônj.', grupo: 'conjugal' },
  { value: 'filho', label: 'Filho(a)', abrev: 'Fil.', grupo: 'filhos' },
  { value: 'enteado', label: 'Enteado(a)', abrev: 'Ent.', grupo: 'filhos' },
  { value: 'pai', label: 'Pai', abrev: 'Pai', grupo: 'pais' },
  { value: 'mae', label: 'Mãe', abrev: 'Mãe', grupo: 'pais' },
  { value: 'padrasto', label: 'Padrasto', abrev: 'Padr.', grupo: 'pais' },
  { value: 'madrasta', label: 'Madrasta', abrev: 'Madr.', grupo: 'pais' },
  { value: 'avo', label: 'Avô', abrev: 'Avô', grupo: 'avos' },
  { value: 'ava', label: 'Avó', abrev: 'Avó', grupo: 'avos' },
  { value: 'irmao', label: 'Irmão(ã)', abrev: 'Irm.', grupo: 'irmaos' },
  { value: 'cunhado', label: 'Cunhado(a)', abrev: 'Cunh.', grupo: 'irmaos' },
  { value: 'tio', label: 'Tio', abrev: 'Tio', grupo: 'tios' },
  { value: 'tia', label: 'Tia', abrev: 'Tia', grupo: 'tios' },
  { value: 'neto', label: 'Neto(a)', abrev: 'Net.', grupo: 'netos' },
  { value: 'genro', label: 'Genro', abrev: 'Genr.', grupo: 'netos' },
  { value: 'nora', label: 'Nora', abrev: 'Nora', grupo: 'netos' },
  { value: 'sogro', label: 'Sogro', abrev: 'Sogr.', grupo: 'sogros' },
  { value: 'sogra', label: 'Sogra', abrev: 'Sogr.', grupo: 'sogros' },
  { value: 'sobrinho', label: 'Sobrinho(a)', abrev: 'Sobr.', grupo: 'outros' },
  { value: 'outro', label: 'Outro', abrev: 'Outro', grupo: 'outros' },
];

const OPCAO_POR_VALUE = new Map(PARENTESCO_OPCOES.map((o) => [o.value, o]));

/** Normaliza rótulos antigos / legados para o código salvo no banco. */
export function normalizarParentescoDependente(value?: string | null): string {
  const bruto = String(value || '').trim();
  if (!bruto) return '';

  const chave = bruto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

  const aliases: Record<string, string> = {
    conjuge: 'esposo',
    esposa: 'esposo',
    'esposo(a)': 'esposo',
    companheiro: 'esposo',
    companheira: 'esposo',
    filha: 'filho',
    'filho(a)': 'filho',
    mae: 'mae',
    'pai/mae': 'pai',
    irma: 'irmao',
    'irmao(a)': 'irmao',
    'irmao/irma': 'irmao',
    'sogro(a)': 'sogro',
    'tio(a)': 'tio',
    avo: 'avo',
    avó: 'ava',
    'avo/avó': 'avo',
    'avo/avo': 'avo',
    dependente: 'outro',
  };

  if (aliases[chave]) return aliases[chave];
  if (OPCAO_POR_VALUE.has(chave)) return chave;

  const porLabel = PARENTESCO_OPCOES.find(
    (o) => o.label.toLowerCase() === bruto.toLowerCase(),
  );
  if (porLabel) return porLabel.value;

  return chave.length <= 20 ? chave : 'outro';
}

export type ModoLabelParentesco = 'completo' | 'abrev';

/**
 * Infere o sexo ('M' ou 'F') a partir do primeiro nome do dependente (heurística em português).
 */
export function inferirSexoPorNome(nome?: string | null): 'M' | 'F' | null {
  const n = String(nome || '').trim().toUpperCase().split(/\s+/)[0];
  if (!n) return null;

  // Nomes femininos comuns que terminam em consoante ou outras vogais
  const nomesFemininosComuns = new Set([
    'BEATRIZ', 'ALICE', 'CARMEN', 'CARMEM', 'ELISABETH', 'ELIZABETH', 'ESTHER', 'HELEN', 'INES', 'INÊS',
    'IRENE', 'IVONE', 'JUANITA', 'LIDIA', 'LÍDIA', 'MARGARETH', 'NICOLE', 'RUTE', 'RUTH', 'SOLANGE',
    'SUELI', 'SUELY', 'VALQUIRIA', 'VALQUÍRIA', 'VIVIAN', 'YASMIN', 'CLARA', 'LEILA', 'CLEUSA', 'CREUSA',
    'NEUSA', 'NEUZA', 'DEBORA', 'DÉBORA', 'RAQUEL', 'MIRIAM', 'MÍRIAM', 'SARAH', 'SARA'
  ]);
  if (nomesFemininosComuns.has(n)) return 'F';

  // Nomes masculinos comuns que terminam em A ou possuem finais ambíguos
  const nomesMasculinosComA = new Set([
    'LUCA', 'JONAS', 'LUCAS', 'MATIAS', 'MATHIAS', 'ALAN', 'ALLAN', 'ALEX', 'ANDRE', 'ANDRÉ', 'FELIPE',
    'GABRIEL', 'MIGUEL', 'RAFAEL', 'SAMUEL', 'DANIEL', 'NATAN', 'NATHAN', 'DAVI', 'DAVID', 'JORGE',
    'HENRIQUE', 'GUILHERME', 'MATEUS', 'MATHEUS', 'TIAGO', 'THIAGO', 'DIEGO', 'RODRIGO', 'BRUNO',
    'MURILO', 'OTAVIO', 'OTÁVIO', 'CAIO', 'HUGO', 'IGOR', 'LEO', 'LÉO', 'LEONARDO', 'WILLIAN', 'WILLIAM',
    'JEAN', 'ADILSON', 'EDILSON', 'GILSON', 'MILTON', 'NILTON', 'EDSON', 'HUDSON', 'CLEITON', 'KLEBER',
    'CLAYTON', 'HEITOR', 'VICTOR', 'VITOR', 'VÍTOR', 'VALDIR', 'VALDEMAR', 'OSMAR', 'NEIMAR', 'NEYMAR',
    'CEZAR', 'CÉSAR', 'CESAR', 'ARTHUR', 'ARTUR', 'IGOR', 'YURI', 'IURI', 'DOUGLAS', 'MAURICIO', 'MAURÍCIO',
    'OTAVIO', 'OTÁVIO', 'FABIO', 'FÁBIO', 'ROGERIO', 'ROGÉRIO', 'CLAUDIO', 'CLÁUDIO', 'FLAVIO', 'FLÁVIO',
    'ALESSANDRO', 'EVANDRO', 'LEANDRO', 'ALEXANDRE'
  ]);
  if (nomesMasculinosComA.has(n)) return 'M';

  if (n.endsWith('A')) {
    return 'F';
  }

  if (
    n.endsWith('O') ||
    n.endsWith('OS') ||
    n.endsWith('OR') ||
    n.endsWith('ON') ||
    n.endsWith('EL') ||
    n.endsWith('ER') ||
    n.endsWith('U') ||
    n.endsWith('IM') ||
    n.endsWith('IR') ||
    n.endsWith('AR')
  ) {
    return 'M';
  }

  return null;
}

export function labelParentescoDependente(
  value?: string | null,
  modo: ModoLabelParentesco = 'completo',
  sexo?: string | null,
  nome?: string | null,
): string {
  let s = sexo;
  if (!s && nome) {
    s = inferirSexoPorNome(nome);
  }
  const norm = normalizarParentescoDependente(value);
  if (!norm) return '—';

  let label = '';
  let abrev = '';

  const isFeminino = s && (s.toUpperCase() === 'F' || s.toLowerCase().startsWith('fem'));
  const isMasculino = s && (s.toUpperCase() === 'M' || s.toLowerCase().startsWith('masc'));

  if (isFeminino) {
    switch (norm) {
      case 'esposo':
        label = 'Esposa';
        abrev = 'Cônj.';
        break;
      case 'filho':
        label = 'Filha';
        abrev = 'Filha';
        break;
      case 'enteado':
        label = 'Enteada';
        abrev = 'Ent.';
        break;
      case 'pai':
      case 'padrasto':
        label = norm === 'pai' ? 'Mãe' : 'Madrasta';
        abrev = norm === 'pai' ? 'Mãe' : 'Madr.';
        break;
      case 'avo':
        label = 'Avó';
        abrev = 'Avó';
        break;
      case 'irmao':
        label = 'Irmã';
        abrev = 'Irmã';
        break;
      case 'cunhado':
        label = 'Cunhada';
        abrev = 'Cunh.';
        break;
      case 'tio':
        label = 'Tia';
        abrev = 'Tia';
        break;
      case 'neto':
        label = 'Neta';
        abrev = 'Neta';
        break;
      case 'genro':
        label = 'Nora';
        abrev = 'Nora';
        break;
      case 'sogro':
        label = 'Sogra';
        abrev = 'Sogr.';
        break;
      case 'sobrinho':
        label = 'Sobrinha';
        abrev = 'Sobr.';
        break;
      case 'outro':
        label = 'Outra';
        abrev = 'Outra';
        break;
      default:
        break;
    }
  } else if (isMasculino) {
    switch (norm) {
      case 'esposo':
        label = 'Esposo';
        abrev = 'Cônj.';
        break;
      case 'filho':
        label = 'Filho';
        abrev = 'Filho';
        break;
      case 'enteado':
        label = 'Enteado';
        abrev = 'Ent.';
        break;
      case 'mae':
      case 'madrasta':
        label = norm === 'mae' ? 'Pai' : 'Padrasto';
        abrev = norm === 'mae' ? 'Pai' : 'Padr.';
        break;
      case 'ava':
        label = 'Avô';
        abrev = 'Avô';
        break;
      case 'irmao':
        label = 'Irmão';
        abrev = 'Irmão';
        break;
      case 'cunhado':
        label = 'Cunhado';
        abrev = 'Cunh.';
        break;
      case 'tia':
        label = 'Tio';
        abrev = 'Tio';
        break;
      case 'nora':
        label = 'Genro';
        abrev = 'Genr.';
        break;
      case 'sogra':
        label = 'Sogro';
        abrev = 'Sogr.';
        break;
      case 'sobrinho':
        label = 'Sobrinho';
        abrev = 'Sobr.';
        break;
      case 'outro':
        label = 'Outro';
        abrev = 'Outro';
        break;
      default:
        break;
    }
  }

  if (label) {
    return modo === 'abrev' ? abrev : label;
  }

  const hit = OPCAO_POR_VALUE.get(norm);
  if (hit) return modo === 'abrev' ? hit.abrev : hit.label;
  const bruto = String(value || '').trim();
  return bruto || norm;
}

export function parentescoOpcoesPorGrupo(grupo: ParentescoGrupoId): ParentescoOpcao[] {
  return PARENTESCO_OPCOES.filter((o) => o.grupo === grupo);
}
