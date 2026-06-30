import { supabase } from './supabase';

export type ComissaoAuditoriaAcao =
  | 'config_padrao'
  | 'colaborador'
  | 'override_plano'
  | 'pagamento'
  | 'relatorio'
  | 'vendedor_faixa'
  | 'vendedor_pagamento'
  | 'vendedor_relatorio';

export interface ComissaoAuditoriaDto {
  id: string;
  empresa_id: string;
  acao: ComissaoAuditoriaAcao | string;
  entidade_tipo?: string | null;
  entidade_id?: string | null;
  colaborador_id?: string | null;
  colaborador_nome?: string | null;
  campo_alterado?: string | null;
  valor_anterior?: string | null;
  valor_novo?: string | null;
  descricao: string;
  metadata?: Record<string, unknown>;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  created_at: string;
}

export interface RegistrarComissaoAuditoriaParams {
  empresaId: string;
  acao: ComissaoAuditoriaAcao;
  descricao: string;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  entidadeTipo?: string | null;
  entidadeId?: string | null;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
  campoAlterado?: string | null;
  valorAnterior?: string | null;
  valorNovo?: string | null;
  metadata?: Record<string, unknown>;
}

export const LABEL_ACAO_COMISSAO_AUDITORIA: Record<string, string> = {
  config_padrao: 'Configuração padrão',
  colaborador: 'Comissão do colaborador',
  override_plano: 'Regra por plano',
  pagamento: 'Pagamento registrado',
  relatorio: 'Relatório gerado',
  vendedor_faixa: 'Faixas de vendedor',
  vendedor_pagamento: 'Pagamento vendedor',
  vendedor_relatorio: 'Relatório vendedor',
};

export async function registrarComissaoAuditoria(params: RegistrarComissaoAuditoriaParams): Promise<void> {
  const empresaId = params.empresaId?.trim();
  if (!empresaId || !params.descricao?.trim()) return;

  const { error } = await supabase.from('comissao_auditoria').insert({
    empresa_id: empresaId,
    acao: params.acao,
    entidade_tipo: params.entidadeTipo?.trim() || null,
    entidade_id: params.entidadeId?.trim() || null,
    colaborador_id: params.colaboradorId || null,
    colaborador_nome: params.colaboradorNome?.trim() || null,
    campo_alterado: params.campoAlterado?.trim() || null,
    valor_anterior: params.valorAnterior ?? null,
    valor_novo: params.valorNovo ?? null,
    descricao: params.descricao.trim(),
    metadata: params.metadata || {},
    usuario_id: params.usuarioId || null,
    usuario_nome: params.usuarioNome?.trim() || null,
  });

  if (error) {
    console.error('[registrarComissaoAuditoria]', error);
  }
}

export async function listarComissaoAuditoria(
  empresaIds: string[],
  opts?: { dataInicio?: string; dataFim?: string; limite?: number },
): Promise<ComissaoAuditoriaDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const limite = opts?.limite ?? 200;
  let q = supabase
    .from('comissao_auditoria')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  if (opts?.dataInicio) {
    q = q.gte('created_at', `${opts.dataInicio.slice(0, 10)}T00:00:00`);
  }
  if (opts?.dataFim) {
    q = q.lte('created_at', `${opts.dataFim.slice(0, 10)}T23:59:59`);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[listarComissaoAuditoria]', error);
    return [];
  }

  return (data || []) as ComissaoAuditoriaDto[];
}
