export type ServicoCatalogoItem = {
  id?: string;
  nome: string;
  descricao?: string | null;
  preco_base_centavos: number;
  categoria?: string | null;
  ativo?: boolean;
};

export const CATEGORIAS_SERVICO_ORDEM = [
  'velorio',
  'urnas',
  'traslado',
  'documentacao',
  'cemiterio',
  'geral',
] as const;

export type CategoriaServico = (typeof CATEGORIAS_SERVICO_ORDEM)[number] | string;

export const CATEGORIA_SERVICO_LABEL: Record<string, string> = {
  velorio: 'Velório',
  urnas: 'Urnas e preparação',
  traslado: 'Translado e remoção',
  documentacao: 'Documentação',
  cemiterio: 'Cemitério',
  geral: 'Geral e complementos',
};

export const CATEGORIA_SERVICO_RESUMO: Record<string, string> = {
  velorio: 'Salas de velório, cortejo e estrutura cerimonial.',
  urnas: 'Tanatopraxia, vestimenta, embalsamamento e preparação do corpo.',
  traslado: 'Remoção e translado — valores fixos ou cobrados por quilômetro.',
  documentacao: 'Formalização e documentos do óbito.',
  cemiterio: 'Serviços no cemitério e sepultamento.',
  geral: 'Ornamentação, paramentos, invólucro e itens de apoio.',
};

export const CATEGORIA_SERVICO_BADGE: Record<string, string> = {
  urnas: 'bg-orange-50 border-orange-200 text-orange-700',
  velorio: 'bg-purple-50 border-purple-200 text-purple-700',
  traslado: 'bg-blue-50 border-blue-200 text-blue-700',
  documentacao: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  cemiterio: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  geral: 'bg-slate-50 border-slate-200 text-slate-700',
};

const fmtMoney = (centavos: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100);

export function labelCategoriaServico(cat?: string | null): string {
  const key = (cat || 'geral').toLowerCase();
  return CATEGORIA_SERVICO_LABEL[key] || cat || 'Geral';
}

export function resumoCategoriaServico(cat?: string | null): string {
  const key = (cat || 'geral').toLowerCase();
  return CATEGORIA_SERVICO_RESUMO[key] || 'Serviços diversos do atendimento funerário.';
}

export function badgeClasseCategoriaServico(cat?: string | null): string {
  const key = (cat || 'geral').toLowerCase();
  return CATEGORIA_SERVICO_BADGE[key] || CATEGORIA_SERVICO_BADGE.geral;
}

/** Serviço cobrado por quilômetro (ex.: translado). */
export function servicoCobrancaPorKm(s: Pick<ServicoCatalogoItem, 'nome' | 'descricao' | 'categoria'>): boolean {
  const desc = (s.descricao || '').toLowerCase();
  if (desc.includes('por quilômetro') || desc.includes('por quilometro') || desc.includes('por km')) {
    return true;
  }
  const nome = (s.nome || '').toLowerCase();
  return (s.categoria || '') === 'traslado' && nome.includes('translado');
}

export function formatarPrecoServico(s: Pick<ServicoCatalogoItem, 'nome' | 'descricao' | 'categoria' | 'preco_base_centavos'>): string {
  if (servicoCobrancaPorKm(s)) return `${fmtMoney(s.preco_base_centavos)} / km`;
  return fmtMoney(s.preco_base_centavos);
}

export function ordenarServicosCatalogo<T extends ServicoCatalogoItem>(itens: T[]): T[] {
  return [...itens].sort((a, b) => {
    const ca = CATEGORIAS_SERVICO_ORDEM.indexOf((a.categoria || 'geral') as (typeof CATEGORIAS_SERVICO_ORDEM)[number]);
    const cb = CATEGORIAS_SERVICO_ORDEM.indexOf((b.categoria || 'geral') as (typeof CATEGORIAS_SERVICO_ORDEM)[number]);
    const ia = ca >= 0 ? ca : CATEGORIAS_SERVICO_ORDEM.length;
    const ib = cb >= 0 ? cb : CATEGORIAS_SERVICO_ORDEM.length;
    if (ia !== ib) return ia - ib;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

export type GrupoServicosCategoria<T extends ServicoCatalogoItem> = {
  categoria: string;
  label: string;
  resumo: string;
  itens: T[];
};

export function agruparServicosPorCategoria<T extends ServicoCatalogoItem>(itens: T[]): GrupoServicosCategoria<T>[] {
  const mapa = new Map<string, T[]>();
  for (const item of ordenarServicosCatalogo(itens)) {
    const cat = (item.categoria || 'geral').toLowerCase();
    const lista = mapa.get(cat) || [];
    lista.push(item);
    mapa.set(cat, lista);
  }

  const ordenadas = [
    ...CATEGORIAS_SERVICO_ORDEM.filter((c) => mapa.has(c)),
    ...[...mapa.keys()].filter((c) => !CATEGORIAS_SERVICO_ORDEM.includes(c as (typeof CATEGORIAS_SERVICO_ORDEM)[number])).sort(),
  ];

  return ordenadas.map((categoria) => ({
    categoria,
    label: labelCategoriaServico(categoria),
    resumo: resumoCategoriaServico(categoria),
    itens: mapa.get(categoria) || [],
  }));
}

/** Sugestão de descrição breve ao cadastrar (categoria + nome). */
export function sugerirDescricaoServico(categoria: string, nome: string): string {
  const cat = (categoria || 'geral').toLowerCase();
  const n = nome.trim().toLowerCase();
  if (cat === 'traslado' && n.includes('translado')) {
    if (n.includes('associado') || n.includes('plano')) {
      return 'Valor por quilômetro — associado/plano';
    }
    if (n.includes('particular')) return 'Valor por quilômetro — particular';
    return 'Valor por quilômetro rodado';
  }
  if (n.includes('remoção') && n.includes('outra funerária')) {
    return 'Retirada do corpo em outra funerária';
  }
  if (n === 'remoção' || n.startsWith('remoção ')) {
    return 'Retirada do corpo no local do óbito';
  }
  if (n.includes('cortejo') && !n.includes('sala')) return 'Deslocamento cerimonial até cemitério ou crematório';
  if (n.includes('sala') && n.includes('cortejo')) return 'Sala de velório com cortejo até o sepultamento';
  if (n.includes('sala') && n.includes('sem')) return 'Uso da sala de velório sem cortejo';
  if (n.includes('tanatopraxia') && n.includes('associado')) return 'Conservação do corpo — associado/plano';
  if (n.includes('tanatopraxia')) return 'Conservação e preparação do corpo';
  if (n.includes('formalização')) return 'Documentação e formalização do óbito';
  if (n.includes('ornamentação')) return 'Flores e ornamentação do velório';
  if (n.includes('invólucro') || n.includes('involucro')) return 'Invólucro padrão para o corpo';
  if (n.includes('tule')) return 'Tule de nylon para ornamentação';
  if (n.includes('vela')) return 'Vela para ornamentação do velório';
  return '';
}
