import { supabase } from './supabase';

export interface KitPlanoResumo {
  id: string;
  nome: string;
  descricao?: string | null;
  plano_id?: string | null;
  plano_nome?: string | null;
}

export interface ProdutoKitRef {
  id: string;
  nome: string;
  empresa_id?: string;
}

export interface ItemKitSugerido {
  produto_id: string;
  quantidade: number;
  beneficio?: string;
}

export interface ItemKitCarregado {
  produto_id: string;
  quantidade: number;
  produto?: (ProdutoKitRef & { preco_centavos?: number; ativo?: boolean; categoria?: string }) | null;
}

function normalizarTexto(valor: string): string {
  return (valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Palavras-chave do benefício do plano → termos para buscar produto no estoque. */
const REGRAS_BENEFICIO_PRODUTO: { testeBeneficio: RegExp; testeProduto: RegExp }[] = [
  { testeBeneficio: /urna|caix[aã]o/i, testeProduto: /urna/i },
  { testeBeneficio: /vela/i, testeProduto: /vela/i },
  { testeBeneficio: /flor|coroa/i, testeProduto: /flor|coroa/i },
  { testeBeneficio: /tule|v[eé]u/i, testeProduto: /tule|v[eé]u/i },
  { testeBeneficio: /invol/i, testeProduto: /invol/i },
  { testeBeneficio: /remo[cç][aã]o/i, testeProduto: /remo[cç]|saco.*remo/i },
  { testeBeneficio: /parament|casti[cç]al|suporte/i, testeProduto: /parament|casti[cç]al|suporte/i },
  { testeBeneficio: /cortejo/i, testeProduto: /cortejo|carro|coroa/i },
  { testeBeneficio: /translado/i, testeProduto: /translado|km/i },
  { testeBeneficio: /tanatopraxia|embalsamamento|prepara[cç][aã]o/i, testeProduto: /tanato|embalsam|prepara/i },
  { testeBeneficio: /terno|roupa/i, testeProduto: /terno|roupa|vestu/i },
];

function escolherProdutoParaBeneficio(
  beneficioNome: string,
  produtos: ProdutoKitRef[],
  usados: Set<string>,
): ProdutoKitRef | null {
  const bNorm = normalizarTexto(beneficioNome);
  for (const regra of REGRAS_BENEFICIO_PRODUTO) {
    if (!regra.testeBeneficio.test(bNorm)) continue;
    const candidato = produtos.find((p) => {
      if (usados.has(p.id)) return false;
      const pNorm = normalizarTexto(p.nome);
      return regra.testeProduto.test(pNorm);
    });
    if (candidato) return candidato;
  }
  return null;
}

export function sugerirItensKitDoPlano(
  beneficios: { nome: string; incluido?: boolean }[] | null | undefined,
  produtos: ProdutoKitRef[],
): ItemKitSugerido[] {
  const incluidos = (beneficios || []).filter((b) => b.incluido !== false && (b.nome || '').trim());
  const usados = new Set<string>();
  const itens: ItemKitSugerido[] = [];

  for (const beneficio of incluidos) {
    const produto = escolherProdutoParaBeneficio(beneficio.nome, produtos, usados);
    if (!produto) continue;
    usados.add(produto.id);
    itens.push({ produto_id: produto.id, quantidade: 1, beneficio: beneficio.nome });
  }

  return itens;
}

export async function carregarProdutosGrupo(empresaIds: string[]): Promise<ProdutoKitRef[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('ser_produtos')
    .select('id, nome, empresa_id')
    .in('empresa_id', ids)
    .eq('ativo', true)
    .order('nome', { ascending: true });

  if (error) throw error;
  return (data || []) as ProdutoKitRef[];
}

export async function listarKitsPorPlano(
  planoId: string,
  _empresaId?: string | null,
): Promise<KitPlanoResumo[]> {
  if (!planoId) return [];

  const { data, error } = await supabase
    .from('estoque_kits')
    .select('id, nome, descricao, plano_id, planos:plano_id ( nome )')
    .eq('plano_id', planoId)
    .order('nome', { ascending: true });

  if (error) {
    console.error('[listarKitsPorPlano]', error);
    return [];
  }

  return (data || []).map((k: any) => ({
    id: k.id,
    nome: k.nome,
    descricao: k.descricao,
    plano_id: k.plano_id,
    plano_nome: k.planos?.nome || null,
  }));
}

export async function listarKitsEmpresa(
  empresaIdOrIds?: string | string[] | null,
): Promise<KitPlanoResumo[]> {
  const ids = Array.isArray(empresaIdOrIds)
    ? [...new Set(empresaIdOrIds.map((id) => id.trim()).filter(Boolean))]
    : (empresaIdOrIds || '').trim()
      ? [(empresaIdOrIds as string).trim()]
      : [];

  let query = supabase
    .from('estoque_kits')
    .select('id, nome, descricao, plano_id, planos:plano_id ( nome )')
    .order('nome', { ascending: true });

  if (ids.length === 1) {
    query = query.eq('empresa_id', ids[0]);
  } else if (ids.length > 1) {
    query = query.in('empresa_id', ids);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[listarKitsEmpresa]', error);
    throw error;
  }

  return (data || []).map((k: any) => ({
    id: k.id,
    nome: k.nome,
    descricao: k.descricao,
    plano_id: k.plano_id,
    plano_nome: k.planos?.nome || null,
  }));
}

export async function carregarItensKit(kitId: string): Promise<ItemKitCarregado[]> {
  if (!kitId) return [];

  const { data: itens, error } = await supabase
    .from('estoque_kit_itens')
    .select('produto_id, quantidade')
    .eq('kit_id', kitId);

  if (error) throw error;
  if (!itens?.length) return [];

  const produtoIds = [...new Set(itens.map((i) => i.produto_id).filter(Boolean))];
  const { data: produtos, error: prodErr } = await supabase
    .from('ser_produtos')
    .select('id, nome, preco_centavos, empresa_id, ativo, categoria')
    .in('id', produtoIds);

  if (prodErr) throw prodErr;

  const produtoPorId = new Map((produtos || []).map((p) => [p.id, p]));

  return itens.map((item) => ({
    produto_id: item.produto_id,
    quantidade: Number(item.quantidade) || 1,
    produto: produtoPorId.get(item.produto_id) ?? null,
  }));
}

export interface CriarKitDoPlanoResult {
  kitId: string;
  itensInseridos: number;
  itensSugeridos: ItemKitSugerido[];
}

/** Cria kit vinculado ao plano com produtos sugeridos a partir dos benefícios. */
export async function criarKitDoPlano(
  planoId: string,
  empresaIdsProdutos: string[],
): Promise<CriarKitDoPlanoResult> {
  const { data: plano, error: planoErr } = await supabase
    .from('planos')
    .select('id, nome, empresa_id, beneficios')
    .eq('id', planoId)
    .single();

  if (planoErr || !plano) throw planoErr || new Error('Plano não encontrado.');

  const existentes = await listarKitsPorPlano(planoId);
  if (existentes.length > 0) {
    throw new Error(`Já existe kit para o plano "${plano.nome}". Edite o kit existente.`);
  }

  const produtos = await carregarProdutosGrupo(empresaIdsProdutos);
  const itensSugeridos = sugerirItensKitDoPlano(plano.beneficios, produtos);

  if (itensSugeridos.length === 0) {
    throw new Error(
      'Nenhum produto do estoque corresponde aos benefícios deste plano. Cadastre produtos ou monte o kit manualmente.',
    );
  }

  const { data: kit, error: kitErr } = await supabase
    .from('estoque_kits')
    .insert({
      empresa_id: plano.empresa_id,
      plano_id: planoId,
      nome: `Kit ${plano.nome}`,
      descricao: `Kit gerado automaticamente a partir dos benefícios do ${plano.nome}.`,
    })
    .select('id')
    .single();

  if (kitErr || !kit) throw kitErr || new Error('Erro ao criar kit.');

  const { error: itensErr } = await supabase.from('estoque_kit_itens').insert(
    itensSugeridos.map((i) => ({
      kit_id: kit.id,
      produto_id: i.produto_id,
      quantidade: i.quantidade,
    })),
  );

  if (itensErr) {
    await supabase.from('estoque_kits').delete().eq('id', kit.id);
    throw itensErr;
  }

  return { kitId: kit.id, itensInseridos: itensSugeridos.length, itensSugeridos };
}
