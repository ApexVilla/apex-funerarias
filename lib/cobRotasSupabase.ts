import { supabase } from './supabase';

const TABELA_ROTAS = 'cob_rotas';
const TABELA_PARADAS = 'cob_rota_paradas';

function mensagemErroRotas(error: { message?: string; code?: string }): string {
  const msg = (error.message || '').toLowerCase();
  if (
    error.code === '42P01' ||
    msg.includes('cob_rotas') && (msg.includes('does not exist') || msg.includes('could not find'))
  ) {
    return (
      'Tabelas de rotas (cob_rotas / cob_rota_paradas) não existem no banco. ' +
      'Aplique a migration supabase/migrations/20260521200000_cob_rotas_cobranca.sql no Supabase.'
    );
  }
  return error.message || 'Erro ao salvar rota de cobrança.';
}

export type StatusRota = 'planejada' | 'em_andamento' | 'concluida';
export type StatusParadaRota = 'pendente' | 'visitado' | 'ausente' | 'pago';

export type ParadaRotaDto = {
  id: string;
  ordem: number;
  cliente_id: string;
  cobranca_pendente_id?: string;
  cliente_nome: string;
  cliente_bairro: string;
  cliente_endereco: string;
  valor_centavos: number;
  dias_atraso: number;
  status: StatusParadaRota;
  observacao?: string;
  hora_visita?: string;
};

export type RotaCobrancaDto = {
  id: string;
  empresa_id: string;
  cobrador_id: string;
  cobrador_nome: string;
  data: string;
  regiao: string;
  bairros: string[];
  status: StatusRota;
  paradas: ParadaRotaDto[];
};

export type SalvarRotaParams = {
  empresa_id: string;
  cobrador_id: string;
  data: string;
  regiao: string;
  bairros: string[];
  status: StatusRota;
  paradas: {
    ordem: number;
    cliente_id: string;
    cobranca_pendente_id?: string;
    cliente_nome: string;
    cliente_bairro: string;
    cliente_endereco: string;
    valor_centavos: number;
    dias_atraso: number;
  }[];
  rota_id?: string;
};

function trimOrEmpty(v: unknown): string {
  return String(v ?? '').trim();
}

function mapParada(row: Record<string, unknown>): ParadaRotaDto {
  return {
    id: String(row.id),
    ordem: Number(row.ordem || 0),
    cliente_id: String(row.cliente_id || ''),
    cobranca_pendente_id: row.cobranca_pendente_id ? String(row.cobranca_pendente_id) : undefined,
    cliente_nome: trimOrEmpty(row.cliente_nome) || '-',
    cliente_bairro: trimOrEmpty(row.cliente_bairro) || 'Sem bairro',
    cliente_endereco: trimOrEmpty(row.cliente_endereco) || '-',
    valor_centavos: Number(row.valor_centavos || 0),
    dias_atraso: Number(row.dias_atraso || 0),
    status: (row.status as StatusParadaRota) || 'pendente',
    observacao: row.observacao ? String(row.observacao) : undefined,
    hora_visita: row.hora_visita ? String(row.hora_visita) : undefined,
  };
}

export async function listarRotasCobranca(
  empresaIds: string[],
  opts?: { cobrador_id?: string; data?: string; status?: StatusRota[] },
): Promise<RotaCobrancaDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  let q = supabase
    .from('cob_rotas')
    .select(`
      id, empresa_id, cobrador_id, data, regiao, bairros, status,
      cobradores ( nome ),
      cob_rota_paradas (
        id, ordem, cliente_id, cobranca_pendente_id, cliente_nome, cliente_bairro,
        cliente_endereco, valor_centavos, dias_atraso, status, observacao, hora_visita
      )
    `)
    .order('data', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(100);

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  if (opts?.cobrador_id) q = q.eq('cobrador_id', opts.cobrador_id);
  if (opts?.data) q = q.eq('data', opts.data);
  if (opts?.status?.length) q = q.in('status', opts.status);

  const { data, error } = await q;
  if (error) throw new Error(mensagemErroRotas(error));

  return (data || []).map((row: Record<string, unknown>) => {
    const cob = row.cobradores as { nome?: string } | null;
    const paradasRaw = (row.cob_rota_paradas as Record<string, unknown>[] | null) || [];
    const paradas = paradasRaw
      .map(mapParada)
      .sort((a, b) => a.ordem - b.ordem);

    let bairros: string[] = [];
    try {
      const b = row.bairros;
      if (Array.isArray(b)) bairros = b.map((x) => String(x));
      else if (typeof b === 'string') bairros = JSON.parse(b);
    } catch {
      bairros = [];
    }

    return {
      id: String(row.id),
      empresa_id: String(row.empresa_id),
      cobrador_id: String(row.cobrador_id),
      cobrador_nome: trimOrEmpty(cob?.nome) || '-',
      data: String(row.data || ''),
      regiao: trimOrEmpty(row.regiao),
      bairros,
      status: (row.status as StatusRota) || 'planejada',
      paradas,
    };
  });
}

export async function salvarRotaCobranca(params: SalvarRotaParams): Promise<string> {
  const now = new Date().toISOString();
  const rotaBody = {
    empresa_id: params.empresa_id,
    cobrador_id: params.cobrador_id,
    data: params.data,
    regiao: params.regiao.trim(),
    bairros: params.bairros,
    status: params.status,
    updated_at: now,
  };

  let rotaId = params.rota_id;

  if (rotaId) {
    const { error } = await supabase.from(TABELA_ROTAS).update(rotaBody).eq('id', rotaId);
    if (error) throw new Error(mensagemErroRotas(error));
    await supabase.from(TABELA_PARADAS).delete().eq('rota_id', rotaId);
  } else {
    const { data, error } = await supabase
      .from(TABELA_ROTAS)
      .insert({ ...rotaBody, created_at: now })
      .select('id')
      .single();
    if (error) throw new Error(mensagemErroRotas(error));
    rotaId = String(data.id);
  }

  if (params.paradas.length > 0) {
    const paradasInsert = params.paradas.map((p) => ({
      rota_id: rotaId,
      ordem: p.ordem,
      cliente_id: p.cliente_id || null,
      cobranca_pendente_id: p.cobranca_pendente_id || null,
      cliente_nome: p.cliente_nome,
      cliente_bairro: p.cliente_bairro,
      cliente_endereco: p.cliente_endereco,
      valor_centavos: p.valor_centavos,
      dias_atraso: p.dias_atraso,
      status: 'pendente' as StatusParadaRota,
    }));
    const { error: parErr } = await supabase.from(TABELA_PARADAS).insert(paradasInsert);
    if (parErr) throw new Error(mensagemErroRotas(parErr));
  }

  return rotaId!;
}

export async function carregarRotaCobranca(rotaId: string): Promise<RotaCobrancaDto | null> {
  const { data, error } = await supabase
    .from('cob_rotas')
    .select(`
      id, empresa_id, cobrador_id, data, regiao, bairros, status,
      cobradores ( nome ),
      cob_rota_paradas (
        id, ordem, cliente_id, cobranca_pendente_id, cliente_nome, cliente_bairro,
        cliente_endereco, valor_centavos, dias_atraso, status, observacao, hora_visita
      )
    `)
    .eq('id', rotaId)
    .maybeSingle();

  if (error) throw new Error(mensagemErroRotas(error));
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const lista = await listarRotasCobranca([String(row.empresa_id)], {});
  return lista.find((r) => r.id === rotaId) || null;
}

export async function atualizarStatusRota(rotaId: string, status: StatusRota): Promise<void> {
  const { error } = await supabase
    .from('cob_rotas')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', rotaId);
  if (error) throw new Error(mensagemErroRotas(error));
}

export type AtualizarParadaRotaParams = {
  status?: StatusParadaRota;
  observacao?: string;
  hora_visita?: string;
};

/** Atualiza parada da rota após visita ou baixa em campo. */
export async function atualizarParadaRotaCobranca(
  paradaId: string,
  params: AtualizarParadaRotaParams,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (params.status) patch.status = params.status;
  if (params.observacao !== undefined) patch.observacao = params.observacao?.trim() || null;
  if (params.hora_visita !== undefined) patch.hora_visita = params.hora_visita || null;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from(TABELA_PARADAS).update(patch).eq('id', paradaId);
  if (error) throw new Error(mensagemErroRotas(error));
}
