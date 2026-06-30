import { supabase } from './supabase';
import { rolesEfetivosUsuario } from './userRoles';
import {
  erroColunaRolesExtraAusente,
  marcarRolesExtraIndisponivel,
  supabaseSuportaRolesExtra,
} from './supabaseSchemaCaps';

export type ModoCalculoComissao = 'percentual_os' | 'por_servico';

export interface ComissaoConfigPadrao {
  id?: string;
  empresa_id: string;
  cargo: 'atendente' | 'agente_funerario' | 'vendedor';
  tipo_comissao: 'percentual' | 'fixo';
  valor: number;
  percentual?: number;
  valor_fixo_centavos?: number;
  modo_calculo?: ModoCalculoComissao;
  created_at?: string;
  updated_at?: string;
}

export interface AtendimentoComissaoItemDto {
  nome: string;
  quantidade: number;
}

export interface AtendimentoComissaoDto {
  id: string;
  empresa_id: string;
  codigo: string;
  data_servico: string;
  valor_total_centavos: number;
  valor_pago_centavos: number;
  baixa_registrada_em: string | null;
  status: string;
  os_aprovada: boolean;
  tipo_atendimento: 'particular' | 'plano';
  formulario_preparacao: string;
  orientacoes_tecnicas: string;
  observacoes_corpo: string;
  cliente_id: string | null;
  cliente_nome: string;
  falecido_nome: string;
  plano_id: string | null;
  plano_nome: string | null;
  plano_comissao_agente_percentual: number;
  plano_comissao_agente_fixo_centavos: number;
  plano_comissao_atendente_percentual: number;
  plano_comissao_atendente_fixo_centavos: number;
  itens_servicos: AtendimentoComissaoItemDto[];
  itens_produtos: AtendimentoComissaoItemDto[];
  usuario_id: string | null;
  atendente_id: string | null;
  atendente_nome: string | null;
  agente_funerario_id: string | null;
  agente_funerario_nome: string | null;
}

export interface PropostaComissaoDto {
  id: string;
  sequencial: number;
  status: string;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  plano_id: string | null;
  plano_nome: string | null;
  contribuinte_nome: string;
  valor_adesao_centavos: number;
  valor_mensal_centavos: number;
  plano_comissao_percentual: number;
  plano_comissao_fixa_centavos: number;
  created_at: string;
}

export interface ColaboradorResumoDto {
  id: string;
  nome: string;
  email: string;
  role: string;
  roles_extra?: string[];
  status: string;
  empresa_id?: string;
  empresa_nome?: string;
  comissao_tipo?: 'percentual' | 'fixo' | null;
  comissao_valor?: number | null;
  comissao_percentual?: number | null;
  comissao_fixo_centavos?: number | null;
}

const ROLES_GESTOR_COMISSAO = new Set([
  'admin',
  'admin_sistema',
  'admin_empresa',
  'super_admin',
  'gerente',
  'gestor',
  'supervisao',
  'diretoria',
  'rh',
  'financeiro',
]);

/** Gestor/RH/financeiro: pode ver e configurar a comissão de todos os colaboradores. */
export function usuarioEhGestorComissao(role?: string | null, rolesExtra?: string[] | null): boolean {
  return rolesEfetivosUsuario(role, rolesExtra).some((r) => ROLES_GESTOR_COMISSAO.has(r));
}

export const ROLES_ATENDENTE = ['atendente', 'vendedor'] as const;
export const ROLES_AGENTE_FUNERARIO = ['agente_funerario', 'agentes_funerarios'] as const;
export const ROLES_COLABORADOR_ATENDIMENTO = [
  ...ROLES_ATENDENTE,
  ...ROLES_AGENTE_FUNERARIO,
] as const;

export function labelRoleColaborador(role: string): string {
  const r = (role || '').toLowerCase();
  if (r === 'atendente') return 'Atendente';
  if (r === 'agente_funerario' || r === 'agentes_funerarios') return 'Agente Funerário';
  if (r === 'vendedor') return 'Vendedor';
  return role || 'Colaborador';
}

function mapColaboradorRow(
  u: Record<string, unknown>,
  empresaNomePorId?: Record<string, string>,
): ColaboradorResumoDto {
  const empresaId = u.empresa_id ? String(u.empresa_id) : undefined;
  return {
    id: String(u.id),
    nome: String(u.nome || ''),
    email: String(u.email || ''),
    role: String(u.role || ''),
    roles_extra: Array.isArray(u.roles_extra) ? (u.roles_extra as string[]) : [],
    status: u.ativo ? 'ativo' : 'inativo',
    empresa_id: empresaId,
    empresa_nome: empresaId && empresaNomePorId ? empresaNomePorId[empresaId] : undefined,
    comissao_tipo: u.comissao_tipo as 'percentual' | 'fixo' | null,
    comissao_valor: u.comissao_valor !== null && u.comissao_valor !== undefined ? Number(u.comissao_valor) : null,
    comissao_percentual:
      u.comissao_percentual !== null && u.comissao_percentual !== undefined
        ? Number(u.comissao_percentual)
        : null,
    comissao_fixo_centavos:
      u.comissao_fixo_centavos !== null && u.comissao_fixo_centavos !== undefined
        ? Number(u.comissao_fixo_centavos)
        : null,
  };
}

export interface PlanoComissaoResumoDto {
  id: string;
  nome: string;
  codigo: string;
  comissao_venda_inicial: number;
  comissao_venda_fixa_centavos: number;
  comissao_agente_percentual: number;
  comissao_agente_fixo_centavos: number;
  comissao_atendente_percentual: number;
  comissao_atendente_fixo_centavos: number;
}

export interface OperacionalPlanoComissaoDto {
  id?: string;
  empresa_id: string;
  usuario_id: string;
  plano_id: string;
  cargo: 'atendente' | 'agente_funerario';
  plano_nome?: string;
  percentual: number | null;
  valor_fixo_centavos: number | null;
}

export interface VendedorPlanoComissaoDto {
  id?: string;
  empresa_id: string;
  usuario_id: string;
  plano_id: string;
  plano_nome?: string;
  percentual: number | null;
  valor_fixo_centavos: number | null;
}

function ultimoDiaMes(mesAno: string): string {
  const [ano, mes] = mesAno.split('-').map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${mesAno}-${String(ultimo).padStart(2, '0')}`;
}

export async function listarConfiguracoesComissao(empresaIds: string[]): Promise<ComissaoConfigPadrao[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  let q = supabase.from('comissao_config_padrao').select('*');
  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q;
  if (error) {
    console.error('[listarConfiguracoesComissao]', error);
    return [];
  }
  return (data || []).map((row) => ({
    ...row,
    valor: Number(row.valor || 0),
    percentual: row.percentual != null ? Number(row.percentual) : undefined,
    valor_fixo_centavos: row.valor_fixo_centavos != null ? Number(row.valor_fixo_centavos) : undefined,
    modo_calculo: (row.modo_calculo as ModoCalculoComissao) || 'por_servico',
  })) as ComissaoConfigPadrao[];
}

export async function salvarConfiguracaoComissao(
  empresaId: string,
  cargo: 'atendente' | 'agente_funerario' | 'vendedor',
  percentual: number,
  valorFixoCentavos: number,
  modoCalculo?: ModoCalculoComissao,
): Promise<boolean> {
  const pct = Math.max(0, Number(percentual) || 0);
  const fixo = Math.max(0, Math.round(valorFixoCentavos) || 0);
  const tipoLegado: 'percentual' | 'fixo' = pct > 0 ? 'percentual' : 'fixo';
  const valorLegado = tipoLegado === 'percentual' ? pct : fixo / 100;

  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    cargo,
    tipo_comissao: tipoLegado,
    valor: valorLegado,
    percentual: pct,
    valor_fixo_centavos: fixo,
    updated_at: new Date().toISOString(),
  };
  if (modoCalculo) payload.modo_calculo = modoCalculo;

  const { error } = await supabase.from('comissao_config_padrao').upsert(payload, { onConflict: 'empresa_id,cargo' });

  if (error) {
    console.error('[salvarConfiguracaoComissao]', error);
    return false;
  }
  return true;
}

export async function salvarComissaoColaborador(
  usuarioId: string,
  percentual: number | null,
  valorFixoCentavos: number | null,
): Promise<boolean> {
  const usaCustom = percentual != null || valorFixoCentavos != null;
  let comissao_tipo: 'percentual' | 'fixo' | null = null;
  let comissao_valor: number | null = null;

  if (usaCustom) {
    if (percentual != null && (valorFixoCentavos == null || valorFixoCentavos === 0)) {
      comissao_tipo = 'percentual';
      comissao_valor = percentual;
    } else if (valorFixoCentavos != null && (percentual == null || percentual === 0)) {
      comissao_tipo = 'fixo';
      comissao_valor = valorFixoCentavos / 100;
    } else if (percentual != null) {
      comissao_tipo = 'percentual';
      comissao_valor = percentual;
    }
  }

  const { error } = await supabase
    .from('users')
    .update({
      comissao_tipo,
      comissao_valor,
      comissao_percentual: usaCustom ? percentual : null,
      comissao_fixo_centavos: usaCustom ? valorFixoCentavos : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', usuarioId);

  if (error) {
    console.error('[salvarComissaoColaborador]', error);
    return false;
  }
  return true;
}

export interface BuscarColaboradoresGrupoOpts {
  roles?: readonly string[];
  termo?: string;
  apenasAtivos?: boolean;
  limit?: number;
  empresaNomePorId?: Record<string, string>;
}

const COLABORADOR_SELECT_COM_ROLES_EXTRA =
  'id, nome, email, role, roles_extra, ativo, empresa_id, comissao_tipo, comissao_valor, comissao_percentual, comissao_fixo_centavos';

const COLABORADOR_SELECT_SEM_ROLES_EXTRA =
  'id, nome, email, role, ativo, empresa_id, comissao_tipo, comissao_valor, comissao_percentual, comissao_fixo_centavos';

type BuscarColaboradoresQueryOpts = BuscarColaboradoresGrupoOpts & {
  empresaIds: string[];
  roles: string[];
  termo: string;
  limit: number;
  comRolesExtra: boolean;
};

async function executarBuscaColaboradoresGrupo(
  opts: BuscarColaboradoresQueryOpts,
): Promise<ColaboradorResumoDto[]> {
  const { empresaIds: ids, roles, termo, limit, comRolesExtra } = opts;

  let q = supabase
    .from('users')
    .select(comRolesExtra ? COLABORADOR_SELECT_COM_ROLES_EXTRA : COLABORADOR_SELECT_SEM_ROLES_EXTRA)
    .order('nome')
    .limit(limit);

  if (roles.length > 0) {
    const roleList = roles.join(',');
    if (comRolesExtra) {
      q = q.or(`role.in.(${roleList}),roles_extra.ov.{${roleList}}`);
    } else {
      q = q.in('role', roles);
    }
  }

  if (opts.apenasAtivos !== false) {
    q = q.eq('ativo', true);
  }

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  if (termo.length >= 2) {
    const esc = termo.replace(/[%_,"\\]/g, '').trim();
    if (esc) {
      const padrao = `%${esc}%`;
      q = q.or([`nome.ilike.${padrao}`, `email.ilike.${padrao}`].join(','));
    }
  }

  const { data, error } = await q;
  if (error) {
    if (comRolesExtra && erroColunaRolesExtraAusente(error)) {
      marcarRolesExtraIndisponivel();
      return executarBuscaColaboradoresGrupo({ ...opts, comRolesExtra: false });
    }
    console.error('[buscarColaboradoresGrupo]', error);
    return [];
  }

  return (data || []).map((u) => mapColaboradorRow(u as unknown as Record<string, unknown>, opts.empresaNomePorId));
}

/** Colaboradores de todas as unidades informadas (grupo econômico), com busca opcional. */
export async function buscarColaboradoresGrupo(
  empresaIds: string[],
  opts: BuscarColaboradoresGrupoOpts = {},
): Promise<ColaboradorResumoDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const roles = opts.roles?.length ? [...opts.roles] : [...ROLES_COLABORADOR_ATENDIMENTO];
  const termo = (opts.termo || '').trim();
  const limit = opts.limit ?? (termo ? 40 : 500);
  const comRolesExtra = await supabaseSuportaRolesExtra();

  return executarBuscaColaboradoresGrupo({
    ...opts,
    empresaIds: ids,
    roles,
    termo,
    limit,
    comRolesExtra,
  });
}

/** Vendedores das unidades informadas (inclui inativos — para demonstrativo de comissão). */
export async function listarVendedoresParaComissao(empresaIds: string[]): Promise<ColaboradorResumoDto[]> {
  return buscarColaboradoresGrupo(empresaIds, { apenasAtivos: false, roles: ['vendedor'] });
}

/** Carrega colaboradores por id (ex.: vendedor com proposta mas fora do filtro de empresa). */
export async function buscarColaboradoresPorIds(
  usuarioIds: string[],
  opts: Pick<BuscarColaboradoresGrupoOpts, 'empresaNomePorId'> = {},
): Promise<ColaboradorResumoDto[]> {
  const ids = [...new Set(usuarioIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const comRolesExtra = await supabaseSuportaRolesExtra();

  const tentar = async (usarRolesExtra: boolean) => {
    const { data, error } = await supabase
      .from('users')
      .select(usarRolesExtra ? COLABORADOR_SELECT_COM_ROLES_EXTRA : COLABORADOR_SELECT_SEM_ROLES_EXTRA)
      .in('id', ids)
      .order('nome');
    return { data, error };
  };

  let { data, error } = await tentar(comRolesExtra);
  if (error && comRolesExtra && erroColunaRolesExtraAusente(error)) {
    marcarRolesExtraIndisponivel();
    ({ data, error } = await tentar(false));
  }
  if (error) {
    console.error('[buscarColaboradoresPorIds]', error);
    return [];
  }

  return (data || []).map((u) => mapColaboradorRow(u as unknown as Record<string, unknown>, opts.empresaNomePorId));
}

export async function listarColaboradoresParaComissao(empresaIds: string[]): Promise<ColaboradorResumoDto[]> {
  return buscarColaboradoresGrupo(empresaIds, { apenasAtivos: false });
}

export interface AtendimentoComissaoFiltro {
  data_inicio: string;
  data_fim: string;
  /** Restringe ao colaborador (atendente, agente funerário ou criador do registro). Use para visão "minhas comissões". */
  colaborador_id?: string;
}

function extrairNomeItemRelacionado(ref: unknown): string {
  if (!ref) return '';
  if (Array.isArray(ref)) {
    const first = ref[0] as { nome?: string } | undefined;
    return first?.nome ? String(first.nome) : '';
  }
  const obj = ref as { nome?: string };
  return obj.nome ? String(obj.nome) : '';
}

async function carregarItensAtendimentosComissao(
  atendimentoIds: string[],
): Promise<Map<string, { servicos: AtendimentoComissaoItemDto[]; produtos: AtendimentoComissaoItemDto[] }>> {
  const map = new Map<string, { servicos: AtendimentoComissaoItemDto[]; produtos: AtendimentoComissaoItemDto[] }>();
  if (atendimentoIds.length === 0) return map;

  const ensure = (atdId: string) => {
    if (!map.has(atdId)) map.set(atdId, { servicos: [], produtos: [] });
    return map.get(atdId)!;
  };

  const [{ data: servicosRows, error: servErr }, { data: produtosRows, error: prodErr }] = await Promise.all([
    supabase
      .from('ser_atendimento_servicos')
      .select('atendimento_id, quantidade, ser_servicos ( nome )')
      .in('atendimento_id', atendimentoIds),
    supabase
      .from('ser_atendimento_produtos')
      .select('atendimento_id, quantidade, ser_produtos ( nome )')
      .in('atendimento_id', atendimentoIds),
  ]);

  if (servErr) console.error('[carregarItensAtendimentosComissao/servicos]', servErr);
  if (prodErr) console.error('[carregarItensAtendimentosComissao/produtos]', prodErr);

  (servicosRows || []).forEach((row: Record<string, unknown>) => {
    const atdId = row.atendimento_id ? String(row.atendimento_id) : '';
    if (!atdId) return;
    const nome = extrairNomeItemRelacionado(row.ser_servicos);
    if (!nome) return;
    ensure(atdId).servicos.push({ nome, quantidade: Number(row.quantidade || 1) });
  });

  (produtosRows || []).forEach((row: Record<string, unknown>) => {
    const atdId = row.atendimento_id ? String(row.atendimento_id) : '';
    if (!atdId) return;
    const nome = extrairNomeItemRelacionado(row.ser_produtos);
    if (!nome) return;
    ensure(atdId).produtos.push({ nome, quantidade: Number(row.quantidade || 1) });
  });

  return map;
}

export async function listarAtendimentosComissao(
  empresaIds: string[],
  filtro: AtendimentoComissaoFiltro,
): Promise<AtendimentoComissaoDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const dataInicio = (filtro.data_inicio || '').slice(0, 10);
  const dataFim = (filtro.data_fim || '').slice(0, 10);
  if (!dataInicio || !dataFim) return [];

  let q = supabase
    .from('ser_atendimentos')
    .select(`
      id,
      empresa_id,
      codigo,
      data_servico,
      valor_total_centavos,
      valor_pago_centavos,
      baixa_registrada_em,
      status,
      os_aprovada,
      tipo_atendimento,
      formulario_preparacao,
      orientacoes_tecnicas,
      observacoes_corpo,
      cliente_id,
      usuario_id,
      atendente_id,
      agente_funerario_id,
      clientes ( nome ),
      falecidos:ser_falecidos ( nome )
    `)
    .gte('data_servico', dataInicio)
    .lte('data_servico', dataFim)
    .order('data_servico', { ascending: false });

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  if (filtro.colaborador_id) {
    const cid = filtro.colaborador_id;
    q = q.or(`atendente_id.eq.${cid},agente_funerario_id.eq.${cid},usuario_id.eq.${cid}`);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[listarAtendimentosComissao]', error);
    return [];
  }

  const userIds = [
    ...new Set([
      ...(data || []).map((a) => a.atendente_id).filter(Boolean),
      ...(data || []).map((a) => a.agente_funerario_id).filter(Boolean),
    ]),
  ] as string[];

  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: usersData } = await supabase.from('users').select('id, nome').in('id', userIds);
    (usersData || []).forEach((u) => userMap.set(u.id, u.nome || ''));
  }

  const clienteIds = [...new Set((data || []).map((a) => a.cliente_id).filter(Boolean))] as string[];
  const planoPorCliente = new Map<
    string,
    {
      plano_id: string;
      plano_nome: string;
      comissao_agente_percentual: number;
      comissao_agente_fixo_centavos: number;
      comissao_atendente_percentual: number;
      comissao_atendente_fixo_centavos: number;
    }
  >();

  if (clienteIds.length > 0) {
    const { data: assinaturasData } = await supabase
      .from('assinaturas')
      .select(`
        cliente_id,
        plano_id,
        created_at,
        planos:plano_id (
          nome,
          comissao_agente_percentual,
          comissao_agente_fixo_centavos,
          comissao_atendente_percentual,
          comissao_atendente_fixo_centavos
        )
      `)
      .in('cliente_id', clienteIds)
      .eq('status', 'ativo')
      .order('created_at', { ascending: false });

    (assinaturasData || []).forEach((row: Record<string, unknown>) => {
      const clienteId = row.cliente_id ? String(row.cliente_id) : '';
      if (!clienteId || planoPorCliente.has(clienteId)) return;
      const plano = row.planos as Record<string, unknown> | null;
      if (!row.plano_id || !plano) return;
      planoPorCliente.set(clienteId, {
        plano_id: String(row.plano_id),
        plano_nome: String(plano.nome || ''),
        comissao_agente_percentual: Number(plano.comissao_agente_percentual || 0),
        comissao_agente_fixo_centavos: Number(plano.comissao_agente_fixo_centavos || 0),
        comissao_atendente_percentual: Number(plano.comissao_atendente_percentual || 0),
        comissao_atendente_fixo_centavos: Number(plano.comissao_atendente_fixo_centavos || 0),
      });
    });
  }

  const atendimentoIds = (data || []).map((a) => String(a.id)).filter(Boolean);
  const itensPorAtd = await carregarItensAtendimentosComissao(atendimentoIds);

  return (data || []).map((a: Record<string, unknown>) => {
    const clienteId = a.cliente_id ? String(a.cliente_id) : null;
    const planoInfo = clienteId ? planoPorCliente.get(clienteId) : undefined;
    const atdId = String(a.id);
    const itensAtd = itensPorAtd.get(atdId) || { servicos: [], produtos: [] };

    return {
      id: atdId,
      empresa_id: String(a.empresa_id || ''),
      codigo: String(a.codigo || ''),
      data_servico: String(a.data_servico || ''),
      valor_total_centavos: Number(a.valor_total_centavos || 0),
      valor_pago_centavos: Number(a.valor_pago_centavos || 0),
      baixa_registrada_em: a.baixa_registrada_em ? String(a.baixa_registrada_em) : null,
      status: String(a.status || ''),
      os_aprovada: !!a.os_aprovada,
      tipo_atendimento: a.tipo_atendimento === 'plano' ? 'plano' : 'particular',
      formulario_preparacao: a.formulario_preparacao ? String(a.formulario_preparacao) : '',
      orientacoes_tecnicas: a.orientacoes_tecnicas ? String(a.orientacoes_tecnicas) : '',
      observacoes_corpo: a.observacoes_corpo ? String(a.observacoes_corpo) : '',
      cliente_id: clienteId,
      cliente_nome: (a.clientes as { nome?: string } | null)?.nome || 'Particular/Sem cadastro',
      falecido_nome: (a.falecidos as { nome?: string } | null)?.nome || 'Não informado',
      plano_id: planoInfo?.plano_id ?? null,
      plano_nome: planoInfo?.plano_nome ?? null,
      plano_comissao_agente_percentual: planoInfo?.comissao_agente_percentual ?? 0,
      plano_comissao_agente_fixo_centavos: planoInfo?.comissao_agente_fixo_centavos ?? 0,
      plano_comissao_atendente_percentual: planoInfo?.comissao_atendente_percentual ?? 0,
      plano_comissao_atendente_fixo_centavos: planoInfo?.comissao_atendente_fixo_centavos ?? 0,
      itens_servicos: itensAtd.servicos,
      itens_produtos: itensAtd.produtos,
      usuario_id: a.usuario_id ? String(a.usuario_id) : null,
      atendente_id: a.atendente_id ? String(a.atendente_id) : null,
      atendente_nome: a.atendente_id ? userMap.get(String(a.atendente_id)) || 'Desconhecido' : null,
      agente_funerario_id: a.agente_funerario_id ? String(a.agente_funerario_id) : null,
      agente_funerario_nome: a.agente_funerario_id
        ? userMap.get(String(a.agente_funerario_id)) || 'Desconhecido'
        : null,
    };
  });
}

async function buscarPropostasComissaoBruto(
  empresaIds: string[],
  inicioIso: string,
  fimIso: string,
  vendedorId?: string,
): Promise<PropostaComissaoDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  let q = supabase
    .from('propostas_venda')
    .select(`
      id,
      sequencial,
      status,
      vendedor_id,
      plano_id,
      contribuinte_nome,
      taxa_adesao_recebida_centavos,
      taxa_adesao_padrao_centavos,
      created_at,
      planos:plano_id (
        nome,
        valor_mensal_centavos,
        comissao_venda_inicial,
        comissao_venda_fixa_centavos
      )
    `)
    .gte('created_at', inicioIso)
    .lte('created_at', fimIso)
    .order('created_at', { ascending: false });

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);
  if (vendedorId) q = q.eq('vendedor_id', vendedorId);

  const { data, error } = await q;
  if (error) {
    console.error('[listarPropostasComissao]', error);
    return [];
  }

  const sellerIds = [...new Set((data || []).map((p) => p.vendedor_id).filter(Boolean))] as string[];
  const userMap = new Map<string, string>();

  if (sellerIds.length > 0) {
    const { data: usersData } = await supabase.from('users').select('id, nome').in('id', sellerIds);
    (usersData || []).forEach((u) => userMap.set(u.id, u.nome || ''));
  }

  return (data || []).map((p: Record<string, unknown>) => {
    const plano = p.planos as Record<string, unknown> | null;
    const adesaoRecebida = Number(p.taxa_adesao_recebida_centavos || 0);
    const adesaoPadrao = Number(p.taxa_adesao_padrao_centavos || 0);

    return {
      id: String(p.id),
      sequencial: Number(p.sequencial || 0),
      status: String(p.status || ''),
      vendedor_id: p.vendedor_id ? String(p.vendedor_id) : null,
      vendedor_nome: p.vendedor_id ? userMap.get(String(p.vendedor_id)) || 'Desconhecido' : null,
      plano_id: p.plano_id ? String(p.plano_id) : null,
      plano_nome: plano?.nome ? String(plano.nome) : null,
      contribuinte_nome: String(p.contribuinte_nome || 'Não informado'),
      valor_adesao_centavos: adesaoRecebida > 0 ? adesaoRecebida : adesaoPadrao,
      valor_mensal_centavos: Number(plano?.valor_mensal_centavos || 0),
      plano_comissao_percentual: Number(plano?.comissao_venda_inicial || 0),
      plano_comissao_fixa_centavos: Number(plano?.comissao_venda_fixa_centavos || 0),
      created_at: String(p.created_at || ''),
    };
  });
}

export async function listarPropostasComissao(
  empresaIds: string[],
  mesAno: string,
  /** Restringe ao vendedor informado. Use para visão "minhas comissões". */
  vendedorId?: string,
): Promise<PropostaComissaoDto[]> {
  const fimMes = ultimoDiaMes(mesAno);
  return buscarPropostasComissaoBruto(empresaIds, `${mesAno}-01T00:00:00Z`, `${fimMes}T23:59:59Z`, vendedorId);
}

/** Igual a listarPropostasComissao, mas com período arbitrário (não limitado a um mês). Use para gráficos de histórico. */
export async function listarPropostasComissaoPeriodo(
  empresaIds: string[],
  dataInicio: string,
  dataFim: string,
  vendedorId?: string,
): Promise<PropostaComissaoDto[]> {
  return buscarPropostasComissaoBruto(empresaIds, `${dataInicio}T00:00:00Z`, `${dataFim}T23:59:59Z`, vendedorId);
}

export async function listarPlanosParaComissao(empresaIds: string[]): Promise<PlanoComissaoResumoDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  let q = supabase
    .from('planos')
    .select(
      'id, nome, codigo, comissao_venda_inicial, comissao_venda_fixa_centavos, comissao_agente_percentual, comissao_agente_fixo_centavos, comissao_atendente_percentual, comissao_atendente_fixo_centavos, status',
    )
    .eq('status', 'ativo')
    .order('nome');

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q;
  if (error) {
    console.error('[listarPlanosParaComissao]', error);
    return [];
  }

  return (data || []).map((p) => ({
    id: String(p.id),
    nome: String(p.nome || ''),
    codigo: String(p.codigo || ''),
    comissao_venda_inicial: Number(p.comissao_venda_inicial || 0),
    comissao_venda_fixa_centavos: Number(p.comissao_venda_fixa_centavos || 0),
    comissao_agente_percentual: Number(p.comissao_agente_percentual || 0),
    comissao_agente_fixo_centavos: Number(p.comissao_agente_fixo_centavos || 0),
    comissao_atendente_percentual: Number(p.comissao_atendente_percentual || 0),
    comissao_atendente_fixo_centavos: Number(p.comissao_atendente_fixo_centavos || 0),
  }));
}

export async function listarOverridesVendedorPlano(
  usuarioId: string,
  empresaIds: string[],
): Promise<VendedorPlanoComissaoDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (!usuarioId || ids.length === 0) return [];

  let q = supabase
    .from('comissao_vendedor_plano')
    .select('id, empresa_id, usuario_id, plano_id, percentual, valor_fixo_centavos, planos:plano_id ( nome )')
    .eq('usuario_id', usuarioId);

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q;
  if (error) {
    console.error('[listarOverridesVendedorPlano]', error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id ? String(row.id) : undefined,
    empresa_id: String(row.empresa_id),
    usuario_id: String(row.usuario_id),
    plano_id: String(row.plano_id),
    plano_nome: (row.planos as { nome?: string } | null)?.nome,
    percentual: row.percentual != null ? Number(row.percentual) : null,
    valor_fixo_centavos: row.valor_fixo_centavos != null ? Number(row.valor_fixo_centavos) : null,
  }));
}

export async function salvarOverrideVendedorPlano(
  empresaId: string,
  usuarioId: string,
  planoId: string,
  percentual: number | null,
  valorFixoCentavos: number | null,
): Promise<boolean> {
  const pct = percentual != null && percentual > 0 ? percentual : null;
  const fixo = valorFixoCentavos != null && valorFixoCentavos > 0 ? Math.round(valorFixoCentavos) : null;

  if (!pct && !fixo) {
    const { error: delErr } = await supabase
      .from('comissao_vendedor_plano')
      .delete()
      .eq('usuario_id', usuarioId)
      .eq('plano_id', planoId);
    if (delErr) {
      console.error('[salvarOverrideVendedorPlano/delete]', delErr);
      return false;
    }
    return true;
  }

  const { error } = await supabase.from('comissao_vendedor_plano').upsert(
    {
      empresa_id: empresaId,
      usuario_id: usuarioId,
      plano_id: planoId,
      percentual: pct,
      valor_fixo_centavos: fixo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'usuario_id,plano_id' },
  );

  if (error) {
    console.error('[salvarOverrideVendedorPlano]', error);
    return false;
  }
  return true;
}

export async function listarOverridesOperacionalPlano(
  usuarioId: string,
  cargo: 'atendente' | 'agente_funerario',
  empresaIds: string[],
): Promise<OperacionalPlanoComissaoDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (!usuarioId || ids.length === 0) return [];

  let q = supabase
    .from('comissao_operacional_plano')
    .select('id, empresa_id, usuario_id, plano_id, cargo, percentual, valor_fixo_centavos, planos:plano_id ( nome )')
    .eq('usuario_id', usuarioId)
    .eq('cargo', cargo);

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q;
  if (error) {
    console.error('[listarOverridesOperacionalPlano]', error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id ? String(row.id) : undefined,
    empresa_id: String(row.empresa_id),
    usuario_id: String(row.usuario_id),
    plano_id: String(row.plano_id),
    cargo: row.cargo as 'atendente' | 'agente_funerario',
    plano_nome: (row.planos as { nome?: string } | null)?.nome,
    percentual: row.percentual != null ? Number(row.percentual) : null,
    valor_fixo_centavos: row.valor_fixo_centavos != null ? Number(row.valor_fixo_centavos) : null,
  }));
}

export async function salvarOverrideOperacionalPlano(
  empresaId: string,
  usuarioId: string,
  planoId: string,
  cargo: 'atendente' | 'agente_funerario',
  percentual: number | null,
  valorFixoCentavos: number | null,
): Promise<boolean> {
  const pct = percentual != null && percentual > 0 ? percentual : null;
  const fixo = valorFixoCentavos != null && valorFixoCentavos > 0 ? Math.round(valorFixoCentavos) : null;

  if (!pct && !fixo) {
    const { error: delErr } = await supabase
      .from('comissao_operacional_plano')
      .delete()
      .eq('usuario_id', usuarioId)
      .eq('plano_id', planoId)
      .eq('cargo', cargo);
    if (delErr) {
      console.error('[salvarOverrideOperacionalPlano/delete]', delErr);
      return false;
    }
    return true;
  }

  const { error } = await supabase.from('comissao_operacional_plano').upsert(
    {
      empresa_id: empresaId,
      usuario_id: usuarioId,
      plano_id: planoId,
      cargo,
      percentual: pct,
      valor_fixo_centavos: fixo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'usuario_id,plano_id,cargo' },
  );

  if (error) {
    console.error('[salvarOverrideOperacionalPlano]', error);
    return false;
  }
  return true;
}
