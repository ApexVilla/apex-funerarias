import { supabase } from './supabase';

export type DetalheBaixaParcela = {
  id: string;
  valorPagoCentavos: number;
  dataPagamento: string | null;
  dataBaixa: string | null;
  registradoEm: string | null;
  operadorNome: string | null;
  formaPagamentoNome: string | null;
  contaNome: string | null;
  contaTipo: string | null;
  observacoes: string | null;
  estornada: boolean;
  estornadaEm: string | null;
  estornadaPorNome: string | null;
  motivoEstorno: string | null;
  pixNomePagador: string | null;
};

export type RecebimentoCampoResumo = {
  cobradorNome: string;
  data: string;
  formaPagamento: string | null;
  observacao: string | null;
};

export type ResumoDetalhesBaixaParcela = {
  parcelaCodigo: string | null;
  parcelaDescricao: string | null;
  filialNome: string | null;
  baixas: DetalheBaixaParcela[];
  recebimentoCampo: RecebimentoCampoResumo | null;
};

const fmtUser = async (ids: string[]): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  const unicos = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unicos.length) return map;
  const { data } = await supabase.from('users').select('id, nome').in('id', unicos);
  for (const u of data || []) {
    if (u?.id) map.set(String(u.id), String(u.nome || 'Usuário'));
  }
  return map;
};

export async function carregarDetalhesBaixaParcela(
  contaReceberId: string,
): Promise<ResumoDetalhesBaixaParcela> {
  const vazio: ResumoDetalhesBaixaParcela = {
    parcelaCodigo: null,
    parcelaDescricao: null,
    filialNome: null,
    baixas: [],
    recebimentoCampo: null,
  };
  if (!contaReceberId?.trim()) return vazio;

  const { data: titulo } = await supabase
    .from('fin_contas_receber')
    .select('codigo, descricao, filial:filial_id(nome)')
    .eq('id', contaReceberId)
    .maybeSingle();

  const filialRaw = (titulo as { filial?: { nome?: string } | { nome?: string }[] | null })?.filial;
  const filial = Array.isArray(filialRaw) ? filialRaw[0] : filialRaw;

  const { data: baixasRaw, error } = await supabase
    .from('fin_contas_receber_baixas')
    .select(
      `id, valor_pago_centavos, data_pagamento, data_baixa, created_at, created_by,
      estornada, estornada_at, estornada_por, motivo_estorno, observacoes,
      pix_nome_pagador,
      forma:forma_pagamento_id(nome, codigo),
      conta:conta_bancaria_id(nome, tipo, codigo)`,
    )
    .eq('conta_receber_id', contaReceberId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[carregarDetalhesBaixaParcela]', error.message);
    return {
      ...vazio,
      parcelaCodigo: (titulo as { codigo?: string })?.codigo || null,
      parcelaDescricao: (titulo as { descricao?: string })?.descricao || null,
      filialNome: filial?.nome || null,
    };
  }

  const userIds: string[] = [];
  for (const row of baixasRaw || []) {
    const r = row as { created_by?: string; estornada_por?: string };
    if (r.created_by) userIds.push(r.created_by);
    if (r.estornada_por) userIds.push(r.estornada_por);
  }

  const { data: campoRaw } = await supabase
    .from('cob_recebimentos_campo')
    .select(
      `data, forma_pagamento, observacao,
      cobrador:cobrador_id(nome)`,
    )
    .eq('conta_receber_id', contaReceberId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if ((campoRaw as { created_by?: string })?.created_by) {
    userIds.push(String((campoRaw as { created_by?: string }).created_by));
  }

  const userMap = await fmtUser(userIds);

  const baixas: DetalheBaixaParcela[] = (baixasRaw || []).map((row) => {
    const r = row as {
      id: string;
      valor_pago_centavos?: number;
      data_pagamento?: string | null;
      data_baixa?: string | null;
      created_at?: string | null;
      created_by?: string | null;
      estornada?: boolean;
      estornada_at?: string | null;
      estornada_por?: string | null;
      motivo_estorno?: string | null;
      observacoes?: string | null;
      pix_nome_pagador?: string | null;
      forma?: { nome?: string; codigo?: string } | { nome?: string; codigo?: string }[] | null;
      conta?: { nome?: string; tipo?: string; codigo?: string } | { nome?: string; tipo?: string; codigo?: string }[] | null;
    };
    const forma = Array.isArray(r.forma) ? r.forma[0] : r.forma;
    const conta = Array.isArray(r.conta) ? r.conta[0] : r.conta;
    return {
      id: r.id,
      valorPagoCentavos: Number(r.valor_pago_centavos || 0),
      dataPagamento: r.data_pagamento?.slice(0, 10) || null,
      dataBaixa: r.data_baixa?.slice(0, 10) || null,
      registradoEm: r.created_at || null,
      operadorNome: r.created_by ? userMap.get(r.created_by) || 'Usuário' : null,
      formaPagamentoNome: forma?.nome || forma?.codigo || null,
      contaNome: conta?.nome || conta?.codigo || null,
      contaTipo: conta?.tipo || null,
      observacoes: r.observacoes || null,
      estornada: !!r.estornada,
      estornadaEm: r.estornada_at || null,
      estornadaPorNome: r.estornada_por ? userMap.get(r.estornada_por) || 'Usuário' : null,
      motivoEstorno: r.motivo_estorno || null,
      pixNomePagador: r.pix_nome_pagador || null,
    };
  });

  let recebimentoCampo: RecebimentoCampoResumo | null = null;
  if (campoRaw) {
    const c = campoRaw as {
      data?: string;
      forma_pagamento?: string | null;
      observacao?: string | null;
      cobrador?: { nome?: string } | { nome?: string }[] | null;
    };
    const cob = Array.isArray(c.cobrador) ? c.cobrador[0] : c.cobrador;
    if (cob?.nome) {
      recebimentoCampo = {
        cobradorNome: cob.nome,
        data: c.data || '',
        formaPagamento: c.forma_pagamento || null,
        observacao: c.observacao || null,
      };
    }
  }

  return {
    parcelaCodigo: (titulo as { codigo?: string })?.codigo || null,
    parcelaDescricao: (titulo as { descricao?: string })?.descricao || null,
    filialNome: filial?.nome || null,
    baixas,
    recebimentoCampo,
  };
}
