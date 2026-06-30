import { supabase } from './supabase';

export type AcertoManualDto = {
  id: string;
  empresa_id: string;
  cobrador_id: string;
  cobrador_nome: string;
  data: string;
  periodo_info?: string;
  valores: Record<string, string>;
  total_arrecadado_centavos: number;
  comissao_calculada_centavos: number;
  comissao_final_centavos: number;
  bonus_centavos: number;
  desconto_centavos: number;
  liquido_centavos: number;
  observacoes?: string;
  criado_em: string;
};

export type SalvarAcertoManualParams = {
  empresa_id: string;
  cobrador_id: string;
  data: string;
  periodo_info?: string;
  valores: Record<string, string>;
  total_arrecadado_centavos: number;
  comissao_calculada_centavos: number;
  comissao_final_centavos: number;
  bonus_centavos: number;
  desconto_centavos: number;
  liquido_centavos: number;
  observacoes?: string;
  created_by?: string;
};

export async function listarAcertosManuais(
  empresaIds: string[],
  filtro?: { cobrador_id?: string; limite?: number },
): Promise<AcertoManualDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  let q = supabase
    .from('cob_acertos_manuais')
    .select(
      `
      id, empresa_id, cobrador_id, data, periodo_info, valores,
      total_arrecadado_centavos, comissao_calculada_centavos, comissao_final_centavos,
      bonus_centavos, desconto_centavos, liquido_centavos, observacoes, created_at,
      cobradores ( nome )
    `,
    )
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(filtro?.limite ?? 200, 1), 500));

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const cobradorId = (filtro?.cobrador_id || '').trim();
  if (cobradorId) q = q.eq('cobrador_id', cobradorId);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((row) => {
    const cob = row.cobradores as { nome?: string } | { nome?: string }[] | null;
    const cobNome = Array.isArray(cob) ? cob[0]?.nome : cob?.nome;
    return {
      id: String(row.id),
      empresa_id: String(row.empresa_id),
      cobrador_id: String(row.cobrador_id),
      cobrador_nome: String(cobNome || '-'),
      data: String(row.data || '').slice(0, 10),
      periodo_info: row.periodo_info ? String(row.periodo_info) : undefined,
      valores:
        row.valores && typeof row.valores === 'object'
          ? (row.valores as Record<string, string>)
          : {},
      total_arrecadado_centavos: Number(row.total_arrecadado_centavos || 0),
      comissao_calculada_centavos: Number(row.comissao_calculada_centavos || 0),
      comissao_final_centavos: Number(row.comissao_final_centavos || 0),
      bonus_centavos: Number(row.bonus_centavos || 0),
      desconto_centavos: Number(row.desconto_centavos || 0),
      liquido_centavos: Number(row.liquido_centavos || 0),
      observacoes: row.observacoes ? String(row.observacoes) : undefined,
      criado_em: String(row.created_at || ''),
    };
  });
}

export async function salvarAcertoManual(params: SalvarAcertoManualParams): Promise<AcertoManualDto> {
  const { data, error } = await supabase
    .from('cob_acertos_manuais')
    .insert({
      empresa_id: params.empresa_id,
      cobrador_id: params.cobrador_id,
      data: params.data,
      periodo_info: params.periodo_info?.trim() || null,
      valores: params.valores,
      total_arrecadado_centavos: params.total_arrecadado_centavos,
      comissao_calculada_centavos: params.comissao_calculada_centavos,
      comissao_final_centavos: params.comissao_final_centavos,
      bonus_centavos: params.bonus_centavos,
      desconto_centavos: params.desconto_centavos,
      liquido_centavos: params.liquido_centavos,
      observacoes: params.observacoes?.trim() || null,
      created_by: params.created_by || null,
    })
    .select(
      `
      id, empresa_id, cobrador_id, data, periodo_info, valores,
      total_arrecadado_centavos, comissao_calculada_centavos, comissao_final_centavos,
      bonus_centavos, desconto_centavos, liquido_centavos, observacoes, created_at,
      cobradores ( nome )
    `,
    )
    .single();

  if (error) throw error;

  const cob = data.cobradores as { nome?: string } | null;
  return {
    id: String(data.id),
    empresa_id: String(data.empresa_id),
    cobrador_id: String(data.cobrador_id),
    cobrador_nome: String(cob?.nome || '-'),
    data: String(data.data || '').slice(0, 10),
    periodo_info: data.periodo_info ? String(data.periodo_info) : undefined,
    valores:
      data.valores && typeof data.valores === 'object'
        ? (data.valores as Record<string, string>)
        : {},
    total_arrecadado_centavos: Number(data.total_arrecadado_centavos || 0),
    comissao_calculada_centavos: Number(data.comissao_calculada_centavos || 0),
    comissao_final_centavos: Number(data.comissao_final_centavos || 0),
    bonus_centavos: Number(data.bonus_centavos || 0),
    desconto_centavos: Number(data.desconto_centavos || 0),
    liquido_centavos: Number(data.liquido_centavos || 0),
    observacoes: data.observacoes ? String(data.observacoes) : undefined,
    criado_em: String(data.created_at || ''),
  };
}

export async function excluirAcertoManual(id: string, empresaIds: string[]): Promise<void> {
  const ids = [...new Set(empresaIds.map((i) => i.trim()).filter(Boolean))];
  if (!id || ids.length === 0) return;

  let q = supabase.from('cob_acertos_manuais').delete().eq('id', id);
  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { error } = await q;
  if (error) throw error;
}
