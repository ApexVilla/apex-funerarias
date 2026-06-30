import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';

function throwDb(e: PostgrestError | null): asserts e is PostgrestError {
  if (e) throw new Error(e.message);
}

/** Escopo de empresa(s) para leituras de frota (contexto do app). */
function resolveFrotaEmpresaIds(empresaId: string, opts?: { empresaIds?: string[] }): string[] {
  if (opts?.empresaIds?.length) {
    return [...new Set(opts.empresaIds.filter(Boolean))];
  }
  const id = (empresaId || '').trim();
  return id ? [id] : [];
}

function normTime(t: string | null | undefined): string | null {
  if (!t || !String(t).trim()) return null;
  const s = String(t).trim();
  if (s.length <= 5) return `${s}:00`;
  return s;
}

function mapManutencaoStatusUiToDb(s: string): string {
  const m: Record<string, string> = {
    pendente: 'agendada',
    em_andamento: 'em_andamento',
    concluido: 'concluida',
    cancelado: 'cancelada',
  };
  return m[s] || s;
}

function mapManutencaoStatusDbToUi(s: string): string {
  const m: Record<string, string> = {
    agendada: 'pendente',
    em_andamento: 'em_andamento',
    concluida: 'concluido',
    cancelada: 'cancelado',
  };
  return m[s] || s;
}

function viagemCodigo(): string {
  return `VG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/** Empresas cujos registros de frota o usuário pode consultar (própria + grupo, se gestão). */
export async function frotaEmpresaIdsVisiveis(empresaIdFallback: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('fn_empresas_do_meu_grupo');
    if (error || !Array.isArray(data) || data.length === 0) return [empresaIdFallback];
    const ids = (data as { id: string }[]).map((r) => r.id).filter(Boolean);
    return ids.length ? ids : [empresaIdFallback];
  } catch {
    return [empresaIdFallback];
  }
}

/** @deprecated Use `useEmpresaIdsOperacao().empresaIdsFiltro` — respeita unidade do header. */
export async function empresaIdsGrupoEconomico(empresaIdFallback: string): Promise<string[]> {
  return frotaEmpresaIdsVisiveis(empresaIdFallback);
}

// ─── Veículos ─────────────────────────────────────────────────────────────

export async function frotaListVeiculos(
  empresaId: string,
  filters: { search?: string; status?: string } = {},
  opts?: { empresaIds?: string[] },
): Promise<any[]> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (!ids.length) return [];
  const multi = ids.length > 1;
  let q = supabase.from('frota_veiculos').select('*');
  q = multi ? q.in('empresa_id', ids) : q.eq('empresa_id', ids[0]);
  q = q.order('updated_at', { ascending: false });

  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  throwDb(error);
  let rows = data || [];
  const s = filters.search?.trim();
  if (s) {
    const low = s.toLowerCase();
    rows = rows.filter(
      (v: any) =>
        String(v.placa || '')
          .toLowerCase()
          .includes(low) ||
        String(v.modelo || '')
          .toLowerCase()
          .includes(low) ||
        String(v.marca || '')
          .toLowerCase()
          .includes(low),
    );
  }
  return rows.map((v: any) => ({
    ...v,
    motorista_padrao: null,
  }));
}

export async function frotaGetVeiculo(
  empresaId: string,
  id: string,
  opts?: { empresaIds?: string[] },
): Promise<any | null> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (!ids.length) return null;
  const multi = ids.length > 1;
  let q = supabase.from('frota_veiculos').select('*');
  q = multi ? q.in('empresa_id', ids).eq('id', id) : q.eq('empresa_id', ids[0]).eq('id', id);
  const { data, error } = await q.maybeSingle();
  throwDb(error);
  return data;
}

export async function frotaInsertVeiculo(empresaId: string, payload: Record<string, unknown>): Promise<string> {
  const row: Record<string, unknown> = {
    empresa_id: empresaId,
    placa: String(payload.placa || '').trim(),
    modelo: String(payload.modelo || '').trim(),
    marca: String(payload.marca || '').trim(),
    ano: payload.ano != null ? Number(payload.ano) : null,
    tipo: payload.tipo || 'carro',
    status: payload.status || 'ativo',
    cor: payload.cor || null,
    combustivel: payload.combustivel || 'flex',
    km_atual: Math.round(Number(payload.km_atual ?? 0)),
    km_ultima_revisao: payload.km_ultima_revisao != null ? Math.round(Number(payload.km_ultima_revisao)) : null,
    km_proxima_revisao: payload.km_proxima_revisao != null ? Math.round(Number(payload.km_proxima_revisao)) : null,
    vencimento_crlv: payload.vencimento_crlv || null,
    vencimento_seguro: payload.vencimento_seguro || null,
    observacao: payload.observacao || null,
    ativo: true,
  };
  const { data, error } = await supabase.from('frota_veiculos').insert(row).select('id').single();
  throwDb(error);
  return (data as { id: string }).id;
}

export async function frotaUpdateVeiculo(
  empresaId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const row: Record<string, unknown> = {
    placa: String(payload.placa || '').trim(),
    modelo: String(payload.modelo || '').trim(),
    marca: String(payload.marca || '').trim(),
    ano: payload.ano != null ? Number(payload.ano) : null,
    tipo: payload.tipo || 'carro',
    status: payload.status || 'ativo',
    cor: payload.cor || null,
    combustivel: payload.combustivel || 'flex',
    km_atual: Math.round(Number(payload.km_atual ?? 0)),
    km_ultima_revisao: payload.km_ultima_revisao != null ? Math.round(Number(payload.km_ultima_revisao)) : null,
    km_proxima_revisao: payload.km_proxima_revisao != null ? Math.round(Number(payload.km_proxima_revisao)) : null,
    vencimento_crlv: payload.vencimento_crlv || null,
    vencimento_seguro: payload.vencimento_seguro || null,
    observacao: payload.observacao || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('frota_veiculos').update(row).eq('id', id).eq('empresa_id', empresaId);
  throwDb(error);
}

export async function frotaDeleteVeiculo(empresaId: string, id: string): Promise<void> {
  const { error } = await supabase.from('frota_veiculos').delete().eq('id', id).eq('empresa_id', empresaId);
  throwDb(error);
}

// ─── Motoristas ────────────────────────────────────────────────────────────

export async function frotaListMotoristas(
  empresaId: string,
  filters: { search?: string; status?: string } = {},
  opts?: { empresaIds?: string[] },
): Promise<any[]> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (ids.length === 0) return [];
  const multi = ids.length > 1;

  let q = supabase.from('frota_motoristas').select('*');
  q = multi ? q.in('empresa_id', ids) : q.eq('empresa_id', ids[0]);
  q = q.order('nome');
  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  throwDb(error);
  let rows = data || [];
  const s = filters.search?.trim();
  if (s) {
    const low = s.toLowerCase();
    rows = rows.filter(
      (m: any) =>
        String(m.nome || '')
          .toLowerCase()
          .includes(low) ||
        String(m.cpf || '')
          .toLowerCase()
          .includes(low),
    );
  }
  const padraoIds = [...new Set(rows.map((m: any) => m.veiculo_padrao_id).filter(Boolean))] as string[];
  let placaByVid: Record<string, string> = {};
  if (padraoIds.length) {
    let vq = supabase.from('frota_veiculos').select('id, placa').in('id', padraoIds);
    vq = multi ? vq.in('empresa_id', ids) : vq.eq('empresa_id', ids[0]);
    const { data: ve, error: veErr } = await vq;
    throwDb(veErr);
    (ve || []).forEach((v: any) => {
      placaByVid[v.id] = v.placa;
    });
  }

  const motoristaIds = rows.map((m: any) => m.id).filter(Boolean) as string[];
  const viagensAggByMotorista: Record<string, { total_viagens: number; km_total: number }> = {};
  if (motoristaIds.length) {
    const statusConcluidos = ['concluida', 'concluido', 'finalizada', 'finalizado'];
    let vq = supabase
      .from('frota_viagens')
      .select('motorista_id, km_saida, km_retorno, status')
      .in('motorista_id', motoristaIds)
      .in('status', statusConcluidos);
    vq = multi ? vq.in('empresa_id', ids) : vq.eq('empresa_id', ids[0]);
    const { data: viagens, error: viagensErr } = await vq;
    throwDb(viagensErr);

    (viagens || []).forEach((v: any) => {
      const mid = String(v.motorista_id || '');
      if (!mid) return;
      const acc = viagensAggByMotorista[mid] || { total_viagens: 0, km_total: 0 };
      acc.total_viagens += 1;

      const kmSaida = Number(v.km_saida);
      const kmRetorno = Number(v.km_retorno);
      if (Number.isFinite(kmSaida) && Number.isFinite(kmRetorno) && kmRetorno >= kmSaida) {
        acc.km_total += kmRetorno - kmSaida;
      }
      viagensAggByMotorista[mid] = acc;
    });
  }

  return rows.map((m: any) => ({
    ...m,
    veiculo_placa: (m.veiculo_padrao_id && placaByVid[m.veiculo_padrao_id]) || null,
    total_viagens: viagensAggByMotorista[m.id]?.total_viagens ?? Number(m.total_viagens ?? 0),
    km_total: viagensAggByMotorista[m.id]?.km_total ?? Number(m.km_total ?? 0),
    cnh_numero: m.numero_cnh,
    cnh_categoria: m.categoria_cnh,
    cnh_vencimento: m.vencimento_cnh,
  }));
}

export async function frotaGetMotorista(
  empresaId: string,
  id: string,
  opts?: { empresaIds?: string[] },
): Promise<any | null> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (!ids.length) return null;
  const multi = ids.length > 1;
  let q = supabase.from('frota_motoristas').select('*').eq('id', id);
  q = multi ? q.in('empresa_id', ids) : q.eq('empresa_id', ids[0]);
  const { data, error } = await q.maybeSingle();
  throwDb(error);
  if (!data) return null;
  return {
    ...data,
    cnh_numero: (data as any).numero_cnh,
    cnh_categoria: (data as any).categoria_cnh,
    cnh_vencimento: (data as any).vencimento_cnh,
  };
}

function motoristaRowFromForm(empresaId: string, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    empresa_id: empresaId,
    nome: String(payload.nome || '').trim(),
    cpf: payload.cpf || null,
    telefone: payload.telefone || null,
    status: payload.status || 'ativo',
    categoria_cnh: payload.cnh_categoria || payload.categoria_cnh || 'B',
    numero_cnh: payload.cnh_numero || payload.numero_cnh || null,
    vencimento_cnh: payload.cnh_vencimento || payload.vencimento_cnh || null,
    email: payload.email || null,
    observacao: payload.observacao || null,
    ativo: true,
    data_admissao: payload.data_admissao || null,
    veiculo_padrao_id: payload.veiculo_padrao_id || null,
    total_viagens: payload.total_viagens ?? 0,
    km_total: payload.km_total ?? 0,
  };
}

export async function frotaInsertMotorista(empresaId: string, payload: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase
    .from('frota_motoristas')
    .insert(motoristaRowFromForm(empresaId, payload))
    .select('id')
    .single();
  throwDb(error);
  return (data as { id: string }).id;
}

export async function frotaUpdateMotorista(
  empresaId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('frota_motoristas')
    .update({
      ...motoristaRowFromForm(empresaId, payload),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('empresa_id', empresaId);
  throwDb(error);
}

// ─── Viagens ───────────────────────────────────────────────────────────────

/** KM percorrido na viagem (nunca negativo). Retorna null se não houver KM de chegada. */
export function calcKmPercorridoViagem(
  kmSaida: number | null | undefined,
  kmRetorno: number | null | undefined,
): number | null {
  const saida = Math.round(Number(kmSaida ?? 0));
  const retorno = kmRetorno != null ? Math.round(Number(kmRetorno)) : null;
  if (retorno == null || !Number.isFinite(saida) || !Number.isFinite(retorno)) return null;
  return Math.max(0, retorno - saida);
}

/** Impede salvar viagem com hodômetro de chegada menor que o de saída. */
export function validarKmViagem(
  kmSaida: number | null | undefined,
  kmRetorno: number | null | undefined,
): void {
  const saida = Math.round(Number(kmSaida ?? 0));
  const retorno = kmRetorno != null ? Math.round(Number(kmRetorno)) : null;
  if (retorno != null && Number.isFinite(saida) && Number.isFinite(retorno) && retorno < saida) {
    throw new Error(
      `KM de chegada (${retorno.toLocaleString('pt-BR')}) não pode ser menor que o KM de saída (${saida.toLocaleString('pt-BR')}).`,
    );
  }
}

function flattenViagemRow(v: any): any {
  const fv = v.frota_veiculos as { placa?: string; modelo?: string } | null | undefined;
  const fm = v.frota_motoristas as { nome?: string } | null | undefined;
  const at = v.ser_atendimentos as { codigo?: string } | null | undefined;
  const { frota_veiculos: _a, frota_motoristas: _b, ser_atendimentos: _c, ...base } = v;
  return {
    ...base,
    placa: fv?.placa,
    modelo: fv?.modelo,
    motorista_nome: fm?.nome,
    descricao: base.observacao,
    atendimento_codigo: at?.codigo ?? null,
    data_chegada: base.data_retorno,
    hora_chegada: base.hora_retorno,
    km_chegada: base.km_retorno,
    objetivo: base.observacao || '',
  };
}

export async function frotaListViagens(
  empresaId: string,
  filters: { search?: string; status?: string } = {},
  opts?: { empresaIds?: string[] },
): Promise<any[]> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (!ids.length) return [];
  const multi = ids.length > 1;
  const applyEmp = (q: any) => (multi ? q.in('empresa_id', ids) : q.eq('empresa_id', ids[0]));

  let q = supabase
    .from('frota_viagens')
    .select(
      `*,
      frota_veiculos (placa, modelo),
      frota_motoristas (nome),
      ser_atendimentos (codigo)`,
    );
  q = applyEmp(q).order('updated_at', { ascending: false });

  if (filters.status) q = q.eq('status', filters.status);
  let { data, error } = await q;
  if (error) {
    let q2 = supabase
      .from('frota_viagens')
      .select(`*, frota_veiculos (placa, modelo), frota_motoristas (nome)`);
    q2 = applyEmp(q2).order('updated_at', { ascending: false });
    const r2 = await q2;
    data = r2.data;
    error = r2.error;
    if (filters.status && data) {
      data = data.filter((x: any) => x.status === filters.status);
    }
  }
  throwDb(error);
  let rows = (data || []).map(flattenViagemRow);
  const s = filters.search?.trim();
  if (s) {
    const low = s.toLowerCase();
    rows = rows.filter(
      (v: any) =>
        String(v.codigo || '')
          .toLowerCase()
          .includes(low) ||
        String(v.placa || '')
          .toLowerCase()
          .includes(low) ||
        String(v.origem || '')
          .toLowerCase()
          .includes(low) ||
        String(v.destino || '')
          .toLowerCase()
          .includes(low),
    );
  }
  return rows;
}

export async function frotaGetViagem(
  empresaId: string,
  id: string,
  opts?: { empresaIds?: string[] },
): Promise<any | null> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (!ids.length) return null;
  const multi = ids.length > 1;
  const applyEmp = (q: any) => (multi ? q.in('empresa_id', ids) : q.eq('empresa_id', ids[0]));

  let q = supabase
    .from('frota_viagens')
    .select(
      `*,
      frota_veiculos (placa, modelo),
      frota_motoristas (nome),
      ser_atendimentos (codigo)`,
    )
    .eq('id', id);
  q = applyEmp(q);
  let { data, error } = await q.maybeSingle();
  if (error) {
    let q2 = supabase
      .from('frota_viagens')
      .select(`*, frota_veiculos (placa, modelo), frota_motoristas (nome)`)
      .eq('id', id);
    q2 = applyEmp(q2);
    const r2 = await q2.maybeSingle();
    data = r2.data;
    error = r2.error;
  }
  throwDb(error);
  return data ? flattenViagemRow(data) : null;
}

/** Atualiza o odômetro do veículo com o KM de chegada registrado na viagem. */
async function frotaSyncVeiculoKmAtual(
  empresaId: string,
  veiculoId: string | null | undefined,
  kmChegada: number | null | undefined,
): Promise<void> {
  if (!veiculoId) return;
  const km = Math.round(Number(kmChegada ?? 0));
  if (!Number.isFinite(km) || km <= 0) return;

  const { data: veiculo, error: readErr } = await supabase
    .from('frota_veiculos')
    .select('km_atual')
    .eq('id', veiculoId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  throwDb(readErr);
  if (!veiculo) return;

  const kmAtual = Math.round(Number((veiculo as { km_atual?: number }).km_atual ?? 0));
  const novoKm = Math.max(kmAtual, km);

  if (novoKm === kmAtual) return;

  const { error: updateErr } = await supabase
    .from('frota_veiculos')
    .update({ km_atual: novoKm, updated_at: new Date().toISOString() })
    .eq('id', veiculoId)
    .eq('empresa_id', empresaId);
  throwDb(updateErr);
}

function viagemRowFromPayload(empresaId: string, payload: Record<string, unknown>, codigo?: string): Record<string, unknown> {
  const observacaoParts = [payload.observacao, payload.descricao, payload.objetivo].filter(Boolean);
  const observacao = observacaoParts.length ? observacaoParts.map(String).join(' | ') : null;
  const paradas = Array.isArray(payload.paradas) ? payload.paradas : [];
  const row = {
    empresa_id: empresaId,
    codigo: codigo || viagemCodigo(),
    veiculo_id: payload.veiculo_id,
    motorista_id: payload.motorista_id || null,
    tipo: payload.tipo || 'servico',
    status: payload.status || 'agendada',
    origem: payload.origem || null,
    destino: payload.destino || null,
    data_saida: payload.data_saida || null,
    hora_saida: normTime(payload.hora_saida as string),
    data_retorno: (payload.data_retorno ?? payload.data_chegada) || null,
    hora_retorno: normTime((payload.hora_retorno ?? payload.hora_chegada) as string),
    km_saida: Math.round(Number(payload.km_saida ?? 0)),
    km_retorno:
      payload.km_retorno != null
        ? Math.round(Number(payload.km_retorno))
        : payload.km_chegada != null
          ? Math.round(Number(payload.km_chegada))
          : null,
    passageiros: payload.passageiros != null ? Math.round(Number(payload.passageiros)) : 0,
    observacao,
    paradas,
    atendimento_id: payload.atendimento_id || null,
  };
  validarKmViagem(row.km_saida, row.km_retorno);
  return row;
}

export async function frotaInsertViagem(empresaId: string, payload: Record<string, unknown>): Promise<string> {
  const row = viagemRowFromPayload(empresaId, payload);
  const { data, error } = await supabase.from('frota_viagens').insert(row).select('id').single();
  throwDb(error);
  await frotaSyncVeiculoKmAtual(
    empresaId,
    row.veiculo_id as string | null | undefined,
    row.km_retorno as number | null | undefined,
  );
  return (data as { id: string }).id;
}

export async function frotaUpdateViagem(empresaId: string, id: string, payload: Record<string, unknown>): Promise<void> {
  const { data: raw, error: e0 } = await supabase
    .from('frota_viagens')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .maybeSingle();
  throwDb(e0);
  if (!raw) throw new Error('Viagem não encontrada');
  const merged = { ...raw, ...payload };
  const row = viagemRowFromPayload(empresaId, merged as Record<string, unknown>, String((merged as any).codigo));
  const { error } = await supabase.from('frota_viagens').update(row).eq('id', id).eq('empresa_id', empresaId);
  throwDb(error);
  await frotaSyncVeiculoKmAtual(
    empresaId,
    row.veiculo_id as string | null | undefined,
    row.km_retorno as number | null | undefined,
  );
}

// ─── Abastecimentos ───────────────────────────────────────────────────────

export async function frotaListAbastecimentos(
  empresaId: string,
  filters: { search?: string } = {},
  opts?: { empresaIds?: string[] },
): Promise<any[]> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (!ids.length) return [];
  const multi = ids.length > 1;
  let q = supabase.from('frota_abastecimentos').select('*');
  q = multi ? q.in('empresa_id', ids) : q.eq('empresa_id', ids[0]);
  q = q.order('data_abastecimento', { ascending: false });
  const { data, error } = await q;
  throwDb(error);
  let rows = data || [];
  const vids = [...new Set(rows.map((a: any) => a.veiculo_id).filter(Boolean))] as string[];
  const mids = [...new Set(rows.map((a: any) => a.motorista_id).filter(Boolean))] as string[];
  const veicQuery = () => {
    if (!vids.length) return Promise.resolve({ data: [] as any[], error: null });
    let vq = supabase.from('frota_veiculos').select('id, placa, modelo').in('id', vids);
    vq = multi ? vq.in('empresa_id', ids) : vq.eq('empresa_id', ids[0]);
    return vq;
  };
  const motQuery = () => {
    if (!mids.length) return Promise.resolve({ data: [] as any[], error: null });
    let mq = supabase.from('frota_motoristas').select('id, nome').in('id', mids);
    mq = multi ? mq.in('empresa_id', ids) : mq.eq('empresa_id', ids[0]);
    return mq;
  };
  const [ve, mo] = await Promise.all([veicQuery(), motQuery()]);
  throwDb(ve.error);
  throwDb(mo.error);
  const vmap = Object.fromEntries((ve.data || []).map((v: any) => [v.id, v]));
  const mmap = Object.fromEntries((mo.data || []).map((m: any) => [m.id, m]));
  let out = rows.map((a: any) => {
    const fv = vmap[a.veiculo_id];
    const fm = a.motorista_id ? mmap[a.motorista_id] : null;
    return {
      ...a,
      placa: fv?.placa,
      modelo: fv?.modelo,
      motorista_nome: fm?.nome,
    };
  });
  const s = filters.search?.trim();
  if (s) {
    const low = s.toLowerCase();
    out = out.filter(
      (a: any) =>
        String(a.placa || '')
          .toLowerCase()
          .includes(low) ||
        String(a.posto || '')
          .toLowerCase()
          .includes(low),
    );
  }
  return out;
}

export async function frotaGetAbastecimento(
  empresaId: string,
  id: string,
  opts?: { empresaIds?: string[] },
): Promise<any | null> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (!ids.length) return null;
  const multi = ids.length > 1;
  let q = supabase.from('frota_abastecimentos').select('*').eq('id', id);
  q = multi ? q.in('empresa_id', ids) : q.eq('empresa_id', ids[0]);
  const { data, error } = await q.maybeSingle();
  throwDb(error);
  return data;
}

/** valor_total em frota_abastecimentos é GENERATED (litros * valor_litro) — não enviar no INSERT/UPDATE. */
function buildFrotaAbastecimentoDbRow(payload: Record<string, unknown>) {
  const litros = Number(payload.litros ?? 0);
  let valorLitro = Number(payload.valor_litro ?? 0);
  if (litros > 0 && (!Number.isFinite(valorLitro) || valorLitro <= 0) && payload.valor_total != null) {
    valorLitro = Number(payload.valor_total) / litros;
  }
  return {
    veiculo_id: payload.veiculo_id,
    motorista_id: payload.motorista_id || null,
    data_abastecimento: payload.data_abastecimento,
    km_atual: Math.round(Number(payload.km_atual ?? 0)),
    km_anterior: payload.km_anterior != null ? Math.round(Number(payload.km_anterior)) : null,
    litros,
    valor_litro: valorLitro,
    combustivel: payload.combustivel || null,
    posto: payload.posto || null,
    nota_fiscal: payload.nota_fiscal || null,
    observacao: payload.observacao || null,
  };
}

export async function frotaInsertAbastecimento(empresaId: string, payload: Record<string, unknown>): Promise<string> {
  const row = {
    empresa_id: empresaId,
    ...buildFrotaAbastecimentoDbRow(payload),
    data_abastecimento:
      payload.data_abastecimento || new Date().toISOString().slice(0, 10),
  };
  const { data, error } = await supabase.from('frota_abastecimentos').insert(row).select('id').single();
  throwDb(error);
  return (data as { id: string }).id;
}

export async function frotaUpdateAbastecimento(
  empresaId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const row = buildFrotaAbastecimentoDbRow(payload);
  const { error } = await supabase.from('frota_abastecimentos').update(row).eq('id', id).eq('empresa_id', empresaId);
  throwDb(error);
}

// ─── Manutenções ───────────────────────────────────────────────────────────

export async function frotaListManutencoes(
  empresaId: string,
  filters: { search?: string; status?: string } = {},
  opts?: { empresaIds?: string[] },
): Promise<any[]> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (!ids.length) return [];
  const multi = ids.length > 1;
  let q = supabase.from('frota_manutencoes').select('*');
  q = multi ? q.in('empresa_id', ids) : q.eq('empresa_id', ids[0]);
  q = q.order('updated_at', { ascending: false });
  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  throwDb(error);
  let rows = data || [];
  const vids = [...new Set(rows.map((m: any) => m.veiculo_id).filter(Boolean))] as string[];
  const mids = [...new Set(rows.map((m: any) => m.motorista_id).filter(Boolean))] as string[];
  const veicQuery = () => {
    if (!vids.length) return Promise.resolve({ data: [] as any[], error: null });
    let vq = supabase.from('frota_veiculos').select('id, placa, modelo').in('id', vids);
    vq = multi ? vq.in('empresa_id', ids) : vq.eq('empresa_id', ids[0]);
    return vq;
  };
  const motQuery = () => {
    if (!mids.length) return Promise.resolve({ data: [] as any[], error: null });
    let mq = supabase.from('frota_motoristas').select('id, nome').in('id', mids);
    mq = multi ? mq.in('empresa_id', ids) : mq.eq('empresa_id', ids[0]);
    return mq;
  };
  const [ve, mo] = await Promise.all([veicQuery(), motQuery()]);
  throwDb(ve.error);
  throwDb(mo.error);
  const vmap = Object.fromEntries((ve.data || []).map((v: any) => [v.id, v]));
  const mmap = Object.fromEntries((mo.data || []).map((m: any) => [m.id, m]));
  let out = rows.map((m: any) => {
    const fv = vmap[m.veiculo_id];
    const fm = m.motorista_id ? mmap[m.motorista_id] : null;
    return {
      ...m,
      placa: fv?.placa,
      modelo: fv?.modelo,
      motorista_nome: fm?.nome,
    };
  });
  const s = filters.search?.trim();
  if (s) {
    const low = s.toLowerCase();
    out = out.filter((m: any) => String(m.descricao || '').toLowerCase().includes(low));
  }
  return out;
}

export async function frotaGetManutencao(
  empresaId: string,
  id: string,
  opts?: { empresaIds?: string[] },
): Promise<any | null> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (!ids.length) return null;
  const multi = ids.length > 1;
  let q = supabase.from('frota_manutencoes').select('*').eq('id', id);
  q = multi ? q.in('empresa_id', ids) : q.eq('empresa_id', ids[0]);
  const { data, error } = await q.maybeSingle();
  throwDb(error);
  if (!data) return null;
  const m = data as any;
  return {
    ...m,
    data_inicio: m.data_entrada,
    data_fim: m.data_conclusao,
    km_veiculo: m.km_entrada,
    valor_total: m.valor_final ?? m.valor_estimado,
    status: mapManutencaoStatusDbToUi(m.status),
  };
}

export async function frotaInsertManutencao(empresaId: string, payload: Record<string, unknown>): Promise<string> {
  const row = {
    empresa_id: empresaId,
    veiculo_id: payload.veiculo_id,
    motorista_id: payload.motorista_id || null,
    tipo: payload.tipo || 'preventiva',
    status: mapManutencaoStatusUiToDb(String(payload.status || 'concluido')),
    descricao: String(payload.descricao || '').trim() || 'Manutenção',
    oficina: payload.oficina || null,
    data_entrada: payload.data_inicio || payload.data_entrada || null,
    data_previsao: payload.data_previsao || null,
    data_conclusao: payload.data_fim || payload.data_conclusao || null,
    km_entrada: payload.km_veiculo != null ? Math.round(Number(payload.km_veiculo)) : null,
    valor_estimado: null,
    valor_final: payload.valor_total != null ? Number(payload.valor_total) : null,
    responsavel: null,
    itens: [],
    observacao: payload.observacao || null,
  };
  const { data, error } = await supabase.from('frota_manutencoes').insert(row).select('id').single();
  throwDb(error);
  return (data as { id: string }).id;
}

export async function frotaUpdateManutencao(
  empresaId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: cur, error: e0 } = await supabase
    .from('frota_manutencoes')
    .select('itens')
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .maybeSingle();
  throwDb(e0);
  const row = {
    veiculo_id: payload.veiculo_id,
    motorista_id: payload.motorista_id || null,
    tipo: payload.tipo || 'preventiva',
    status: mapManutencaoStatusUiToDb(String(payload.status || 'concluido')),
    descricao: String(payload.descricao || '').trim() || 'Manutenção',
    oficina: payload.oficina || null,
    data_entrada: payload.data_inicio || payload.data_entrada || null,
    data_previsao: payload.data_previsao || null,
    data_conclusao: payload.data_fim || payload.data_conclusao || null,
    km_entrada: payload.km_veiculo != null ? Math.round(Number(payload.km_veiculo)) : null,
    valor_final: payload.valor_total != null ? Number(payload.valor_total) : null,
    observacao: payload.observacao || null,
    itens: (cur as any)?.itens ?? [],
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('frota_manutencoes').update(row).eq('id', id).eq('empresa_id', empresaId);
  throwDb(error);
}

// ─── Gastos ────────────────────────────────────────────────────────────────

export async function frotaListGastos(empresaId: string, opts?: { empresaIds?: string[] }): Promise<any[]> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (!ids.length) return [];
  const multi = ids.length > 1;
  let q = supabase.from('frota_gastos').select('*');
  q = multi ? q.in('empresa_id', ids) : q.eq('empresa_id', ids[0]);
  q = q.order('data_gasto', { ascending: false });
  const { data, error } = await q;
  throwDb(error);
  const rows = data || [];
  const vids = [...new Set(rows.map((g: any) => g.veiculo_id).filter(Boolean))] as string[];
  const mids = [...new Set(rows.map((g: any) => g.motorista_id).filter(Boolean))] as string[];
  const veicQuery = () => {
    if (!vids.length) return Promise.resolve({ data: [] as any[], error: null });
    let vq = supabase.from('frota_veiculos').select('id, placa, modelo').in('id', vids);
    vq = multi ? vq.in('empresa_id', ids) : vq.eq('empresa_id', ids[0]);
    return vq;
  };
  const motQuery = () => {
    if (!mids.length) return Promise.resolve({ data: [] as any[], error: null });
    let mq = supabase.from('frota_motoristas').select('id, nome').in('id', mids);
    mq = multi ? mq.in('empresa_id', ids) : mq.eq('empresa_id', ids[0]);
    return mq;
  };
  const [ve, mo] = await Promise.all([veicQuery(), motQuery()]);
  throwDb(ve.error);
  throwDb(mo.error);
  const vmap = Object.fromEntries((ve.data || []).map((v: any) => [v.id, v]));
  const mmap = Object.fromEntries((mo.data || []).map((m: any) => [m.id, m]));
  return rows.map((g: any) => {
    const fv = g.veiculo_id ? vmap[g.veiculo_id] : null;
    const fm = g.motorista_id ? mmap[g.motorista_id] : null;
    return {
      ...g,
      placa: fv?.placa,
      modelo: fv?.modelo,
      motorista_nome: fm?.nome,
      tipo: g.categoria,
      data_gasto: g.data_gasto,
    };
  });
}

// ─── Ocorrências ───────────────────────────────────────────────────────────

export async function frotaListOcorrencias(empresaId: string, opts?: { empresaIds?: string[] }): Promise<any[]> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (!ids.length) return [];
  const multi = ids.length > 1;
  let q = supabase.from('frota_ocorrencias').select('*');
  q = multi ? q.in('empresa_id', ids) : q.eq('empresa_id', ids[0]);
  q = q.order('data_ocorrencia', { ascending: false });
  const { data, error } = await q;
  throwDb(error);
  const rows = data || [];
  const vids = [...new Set(rows.map((o: any) => o.veiculo_id).filter(Boolean))] as string[];
  const mids = [...new Set(rows.map((o: any) => o.motorista_id).filter(Boolean))] as string[];
  const veicQuery = () => {
    if (!vids.length) return Promise.resolve({ data: [] as any[], error: null });
    let vq = supabase.from('frota_veiculos').select('id, placa, modelo').in('id', vids);
    vq = multi ? vq.in('empresa_id', ids) : vq.eq('empresa_id', ids[0]);
    return vq;
  };
  const motQuery = () => {
    if (!mids.length) return Promise.resolve({ data: [] as any[], error: null });
    let mq = supabase.from('frota_motoristas').select('id, nome').in('id', mids);
    mq = multi ? mq.in('empresa_id', ids) : mq.eq('empresa_id', ids[0]);
    return mq;
  };
  const [ve, mo] = await Promise.all([veicQuery(), motQuery()]);
  throwDb(ve.error);
  throwDb(mo.error);
  const vmap = Object.fromEntries((ve.data || []).map((v: any) => [v.id, v]));
  const mmap = Object.fromEntries((mo.data || []).map((m: any) => [m.id, m]));
  return rows.map((o: any) => {
    const fv = vmap[o.veiculo_id];
    const fm = o.motorista_id ? mmap[o.motorista_id] : null;
    return {
      ...o,
      veiculo_placa: fv?.placa,
      veiculo_modelo: fv?.modelo,
      motorista_nome: fm?.nome,
    };
  });
}

export async function frotaGetOcorrencia(
  empresaId: string,
  id: string,
  opts?: { empresaIds?: string[] },
): Promise<any | null> {
  const ids = resolveFrotaEmpresaIds(empresaId, opts);
  if (!ids.length) return null;
  const multi = ids.length > 1;
  let q = supabase.from('frota_ocorrencias').select('*').eq('id', id);
  q = multi ? q.in('empresa_id', ids) : q.eq('empresa_id', ids[0]);
  const { data, error } = await q.maybeSingle();
  throwDb(error);
  return data;
}

export async function frotaInsertOcorrencia(empresaId: string, payload: Record<string, unknown>): Promise<string> {
  const row = {
    empresa_id: empresaId,
    veiculo_id: payload.veiculo_id,
    motorista_id: payload.motorista_id || null,
    tipo: payload.tipo || 'avaria',
    data_ocorrencia: payload.data_ocorrencia || new Date().toISOString().slice(0, 10),
    gravidade: payload.gravidade || 'leve',
    descricao: String(payload.descricao || '').trim() || '—',
    status: payload.status || 'pendente',
  };
  const { data, error } = await supabase.from('frota_ocorrencias').insert(row).select('id').single();
  throwDb(error);
  return (data as { id: string }).id;
}

export async function frotaUpdateOcorrencia(
  empresaId: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const row = {
    veiculo_id: payload.veiculo_id,
    motorista_id: payload.motorista_id || null,
    tipo: payload.tipo,
    data_ocorrencia: payload.data_ocorrencia,
    gravidade: payload.gravidade,
    descricao: String(payload.descricao || '').trim(),
    status: payload.status,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('frota_ocorrencias').update(row).eq('id', id).eq('empresa_id', empresaId);
  throwDb(error);
}

export async function frotaDeleteOcorrencia(empresaId: string, id: string): Promise<void> {
  const { error } = await supabase.from('frota_ocorrencias').delete().eq('id', id).eq('empresa_id', empresaId);
  throwDb(error);
}
