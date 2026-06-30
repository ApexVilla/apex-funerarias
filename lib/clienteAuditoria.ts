import { supabase } from './supabase';
import type { AssinaturaSB, TimelineEvent } from './ClienteStore';

export type LinhaAuditoriaCliente = {
  id: string;
  quando: string;
  titulo: string;
  descricao: string;
  acao: string;
  categoria?: string;
  contratoCodigo?: string;
  log?: TimelineEvent;
};

export type ParcelaAuditoriaInput = {
  id: string;
  codigo?: string;
  assinatura_id?: string | null;
  parcela_numero?: number;
  total_parcelas?: number;
  data_vencimento?: string;
  data_pagamento?: string;
  status?: string;
  valor_pago_centavos?: number;
  valor_total_centavos?: number;
  observacoes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EstornoParcelaInfo = {
  contaReceberId: string;
  quando: string;
  motivo: string;
  estornadoPorId: string | null;
  estornadoPorNome: string | null;
};

function isEventoEstornoParcela(ev: TimelineEvent): boolean {
  if ((ev.tipo_evento || '').toUpperCase() !== 'AUDITORIA') return false;
  const titulo = (ev.titulo || '').toLowerCase();
  if (!titulo.includes('estorn')) return false;
  const refTipo = (ev.referencia_tipo || '').toLowerCase();
  if (ev.categoria === 'parcela') return true;
  return ['conta_receber', 'fin_contas_receber'].includes(refTipo);
}

/** Último estorno por parcela a partir da timeline de auditoria do cliente. */
export function mapEstornosParcelasTimeline(
  timeline: TimelineEvent[],
  resolverNome?: (criadoPor: string | undefined | null) => string | null,
): Map<string, EstornoParcelaInfo> {
  const map = new Map<string, EstornoParcelaInfo>();
  for (const ev of timeline) {
    if (!isEventoEstornoParcela(ev)) continue;
    const contaId = ev.referencia_id;
    if (!contaId) continue;
    const quando = ev.data_evento || ev.created_at || '';
    const existente = map.get(contaId);
    if (existente && new Date(existente.quando).getTime() >= new Date(quando).getTime()) continue;
    const estornadoPorId = ev.criado_por || null;
    map.set(contaId, {
      contaReceberId: contaId,
      quando,
      motivo: (ev.descricao || '').trim(),
      estornadoPorId,
      estornadoPorNome:
        resolverNome?.(estornadoPorId) || ev.autor?.nome || null,
    });
  }
  return map;
}

/** Baixas marcadas como estornadas (legado / quando o registro não é apagado). */
export async function carregarEstornosBaixasParcelasCliente(
  clienteId: string,
): Promise<Map<string, EstornoParcelaInfo>> {
  const { data, error } = await supabase
    .from('fin_contas_receber_baixas')
    .select(
      `id, conta_receber_id, estornada_at, estornada_por, motivo_estorno,
      conta:conta_receber_id!inner ( cliente_id )`,
    )
    .eq('estornada', true)
    .eq('conta.cliente_id', clienteId)
    .order('estornada_at', { ascending: false })
    .limit(500);

  if (error) {
    console.warn('[carregarEstornosBaixasParcelasCliente]', error.message);
    return new Map();
  }

  const userIds = new Set<string>();
  for (const row of data || []) {
    const r = row as { estornada_por?: string | null };
    if (r.estornada_por) userIds.add(r.estornada_por);
  }

  const userMap = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, nome')
      .in('id', [...userIds]);
    for (const u of users || []) {
      const row = u as { id: string; nome?: string | null };
      if (row.id && row.nome) userMap.set(row.id, row.nome);
    }
  }

  const map = new Map<string, EstornoParcelaInfo>();
  for (const row of data || []) {
    const r = row as {
      conta_receber_id?: string;
      estornada_at?: string | null;
      estornada_por?: string | null;
      motivo_estorno?: string | null;
    };
    const contaId = r.conta_receber_id;
    if (!contaId || map.has(contaId)) continue;
    map.set(contaId, {
      contaReceberId: contaId,
      quando: r.estornada_at || '',
      motivo: (r.motivo_estorno || '').trim(),
      estornadoPorId: r.estornada_por || null,
      estornadoPorNome: r.estornada_por ? userMap.get(r.estornada_por) || 'Usuário' : null,
    });
  }
  return map;
}

export function mesclarMapasEstornoParcela(
  ...mapas: Map<string, EstornoParcelaInfo>[]
): Map<string, EstornoParcelaInfo> {
  const merged = new Map<string, EstornoParcelaInfo>();
  for (const mapa of mapas) {
    for (const [id, info] of mapa) {
      const existente = merged.get(id);
      if (!existente || new Date(info.quando).getTime() > new Date(existente.quando).getTime()) {
        merged.set(id, info);
      }
    }
  }
  return merged;
}

const AUDIT_BENEFICIARIO_LABELS: Record<string, string> = {
  nome: 'Nome',
  cpf: 'CPF',
  parentesco: 'Parentesco',
  ativo: 'Ativo',
};

const AUDIT_CONTRATO_LABELS: Record<string, string> = {
  status: 'Status',
  plano_id: 'Plano',
  valor_mensal_centavos: 'Valor mensal',
  dia_vencimento: 'Dia vencimento',
  forma_pagamento: 'Forma pagamento',
  data_cancelamento: 'Data cancelamento',
  motivo_cancelamento: 'Motivo cancelamento',
};

const AUDIT_PARCELA_LABELS: Record<string, string> = {
  status: 'Status',
  data_vencimento: 'Vencimento',
  data_pagamento: 'Data pagamento',
  valor_pago_centavos: 'Valor pago',
};

function codigoContrato(assinaturas: AssinaturaSB[], assinaturaId?: string | null): string | undefined {
  if (!assinaturaId) return undefined;
  const a = assinaturas.find((x) => x.id === assinaturaId);
  return a?.codigo || assinaturaId.slice(0, 8);
}

function assinaturaIdDoLog(log: TimelineEvent): string | undefined {
  if (log.referencia_tipo === 'assinatura' && log.referencia_id) return log.referencia_id;
  const novo = log.dados_novos as Record<string, unknown> | undefined;
  const antigo = log.dados_anteriores as Record<string, unknown> | undefined;
  const id = novo?.assinatura_id ?? antigo?.assinatura_id;
  return typeof id === 'string' ? id : undefined;
}

export function isEventoAuditoriaTimeline(e: TimelineEvent): boolean {
  const tipo = (e.tipo_evento || '').toUpperCase();
  if (tipo === 'AUDITORIA') return true;
  if (tipo === 'CONTRATO' || tipo.startsWith('CONTRATO_')) return true;
  if (tipo.includes('BENEFICIARIO') || tipo.includes('DEPENDENTE')) return true;
  if (tipo.includes('PARCELA') || tipo.includes('MENSALIDADE') || tipo.includes('FINANCEIRO')) return true;
  if (e.categoria === 'beneficiario' || e.categoria === 'contrato' || e.categoria === 'parcela') return true;
  if (e.referencia_tipo === 'beneficiario' || e.referencia_tipo === 'assinatura' || e.referencia_tipo === 'conta_receber') {
    return true;
  }
  return false;
}

/** Eventos que pertencem à auditoria do contrato (plano, dependentes, parcelas). */
export function isEventoAuditoriaContrato(e: TimelineEvent): boolean {
  if (!isEventoAuditoriaTimeline(e)) return false;
  if (e.categoria === 'contrato' || e.categoria === 'beneficiario' || e.categoria === 'parcela') return true;
  if (e.referencia_tipo === 'assinatura' || e.referencia_tipo === 'beneficiario' || e.referencia_tipo === 'conta_receber') {
    return true;
  }
  const tipo = (e.tipo_evento || '').toLowerCase();
  return tipo.includes('contrato') || tipo.includes('parcela') || tipo.includes('mensalidade');
}

export function auditFmtValor(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number' && v > 1000) {
    return `R$ ${(v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }
  return String(v ?? '—');
}

export function auditDiffCampos(log: TimelineEvent): { campo: string; de: string; para: string }[] {
  const antes = log.dados_anteriores as Record<string, unknown> | undefined;
  const depois = log.dados_novos as Record<string, unknown> | undefined;
  const labels =
    log.categoria === 'parcela' || log.referencia_tipo === 'conta_receber'
      ? AUDIT_PARCELA_LABELS
      : log.categoria === 'contrato' || log.referencia_tipo === 'assinatura'
        ? AUDIT_CONTRATO_LABELS
        : AUDIT_BENEFICIARIO_LABELS;
  const keys = Object.keys(labels);

  if (antes && depois) {
    return keys
      .filter((k) => String(antes[k] ?? '') !== String(depois[k] ?? ''))
      .map((k) => ({
        campo: labels[k],
        de: auditFmtValor(antes[k]),
        para: auditFmtValor(depois[k]),
      }));
  }

  if (antes && !depois && (log.titulo || '').toLowerCase().includes('remov')) {
    return keys
      .filter((k) => antes[k] !== undefined && antes[k] !== null && antes[k] !== '')
      .map((k) => ({ campo: labels[k], de: auditFmtValor(antes[k]), para: '—' }));
  }

  if (depois && !antes && (log.titulo || '').toLowerCase().includes('adicion')) {
    return keys
      .filter((k) => depois[k] !== undefined && depois[k] !== null && depois[k] !== '')
      .map((k) => ({ campo: labels[k], de: '—', para: auditFmtValor(depois[k]) }));
  }

  return [];
}

export function auditAcaoLabel(log: TimelineEvent): string {
  if (log.categoria === 'parcela' || log.referencia_tipo === 'conta_receber') {
    const t = (log.titulo || '').toLowerCase();
    if (t.includes('receb') || t.includes('pag') || t.includes('baixa')) return 'Pagamento';
    if (t.includes('estorn')) return 'Estorno';
    if (t.includes('prorrog')) return 'Prorrogação';
    if (t.includes('gerad') || t.includes('criad')) return 'Geração';
    return 'Parcela';
  }
  if (log.categoria === 'contrato' || log.referencia_tipo === 'assinatura') {
    const t = (log.titulo || '').toLowerCase();
    if (t.includes('criado') || t.includes('criação')) return 'Inclusão';
    if (t.includes('cancel')) return 'Cancelamento';
    if (t.includes('atualiz')) return 'Alteração';
    return 'Contrato';
  }
  if (log.categoria === 'beneficiario' || log.referencia_tipo === 'beneficiario') {
    const t = (log.titulo || '').toLowerCase();
    if (t.includes('adicion')) return 'Inclusão';
    if (t.includes('atualiz')) return 'Alteração';
    if (t.includes('remov')) return 'Exclusão';
    return 'Dependente';
  }
  return log.tipo_evento === 'AUDITORIA' ? 'Auditoria' : log.tipo_evento || 'Evento';
}

function labelParcela(p: ParcelaAuditoriaInput): string {
  const n = p.parcela_numero ?? 0;
  const t = p.total_parcelas ?? 0;
  if (n && t) return `Parcela ${n}/${t}`;
  return p.codigo || 'Parcela';
}

function linhasHistoricoContratos(assinaturas: AssinaturaSB[]): LinhaAuditoriaCliente[] {
  const linhas: LinhaAuditoriaCliente[] = [];
  for (const a of assinaturas) {
    const cod = a.codigo || a.id.slice(0, 8);
    const plano = a.plano_nome || 'Plano';
    if (a.created_at || a.data_contratacao) {
      linhas.push({
        id: `ctr-criacao-${a.id}`,
        quando: a.created_at || `${a.data_contratacao}T12:00:00`,
        titulo: `Contrato ${cod} criado`,
        descricao: `${plano} • venc. dia ${a.dia_vencimento} • ${a.forma_pagamento || '—'}`,
        acao: 'Inclusão',
        categoria: 'contrato',
        contratoCodigo: cod,
      });
    }
    if ((a.status === 'cancelado' || a.status === 'cancelada') && a.data_cancelamento) {
      linhas.push({
        id: `ctr-cancel-${a.id}`,
        quando: `${a.data_cancelamento}T12:00:00`,
        titulo: `Contrato ${cod} cancelado`,
        descricao: a.motivo_cancelamento || 'Cancelamento registrado no sistema.',
        acao: 'Cancelamento',
        categoria: 'contrato',
        contratoCodigo: cod,
      });
    }
  }
  return linhas;
}

/** Histórico sintético a partir das parcelas (pagamento e prorrogações nas observações). */
export function linhasHistoricoParcelas(
  parcelas: ParcelaAuditoriaInput[],
  assinaturas: AssinaturaSB[],
): LinhaAuditoriaCliente[] {
  const linhas: LinhaAuditoriaCliente[] = [];
  const reProrrog = /\[([^\]]+)\]\s*Prorrogado de (\S+) para (\S+)(?::\s*(.+))?/gi;

  for (const p of parcelas) {
    const ctr = codigoContrato(assinaturas, p.assinatura_id);
    const rotulo = labelParcela(p);

    if (p.observacoes) {
      let m: RegExpExecArray | null;
      let idx = 0;
      reProrrog.lastIndex = 0;
      while ((m = reProrrog.exec(p.observacoes)) !== null) {
        const [, quandoStr, de, para, motivo] = m;
        let quando = p.updated_at || p.created_at || '';
        const parsed = quandoStr?.trim();
        if (parsed) {
          const d = new Date(parsed.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
          if (!Number.isNaN(d.getTime())) quando = d.toISOString();
        }
        linhas.push({
          id: `parc-prorrog-${p.id}-${idx++}`,
          quando,
          titulo: `${rotulo} — vencimento prorrogado`,
          descricao: `De ${de} para ${para}${motivo?.trim() ? ` • ${motivo.trim()}` : ''}${ctr ? ` • Contrato ${ctr}` : ''}`,
          acao: 'Prorrogação',
          categoria: 'parcela',
          contratoCodigo: ctr,
        });
      }
    }
  }
  return linhas;
}

/** Baixas financeiras do cliente (histórico de recebimentos). */
export async function carregarLinhasBaixasParcelasCliente(
  clienteId: string,
  assinaturas: AssinaturaSB[],
): Promise<LinhaAuditoriaCliente[]> {
  const { data, error } = await supabase
    .from('fin_contas_receber_baixas')
    .select(
      `id, valor_pago_centavos, data_pagamento, created_at,
      conta:conta_receber_id!inner (
        id, codigo, assinatura_id, parcela_numero, total_parcelas, data_vencimento, cliente_id
      )`,
    )
    .eq('conta.cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.warn('[carregarLinhasBaixasParcelasCliente]', error.message);
    return [];
  }

  const linhas: LinhaAuditoriaCliente[] = [];
  for (const row of data || []) {
    const rawConta = (row as any).conta;
    const conta = (Array.isArray(rawConta) ? rawConta[0] : rawConta) as (ParcelaAuditoriaInput & { assinatura_id?: string }) | undefined;
    if (!conta) continue;
    const ctr = codigoContrato(assinaturas, conta.assinatura_id);
    const rotulo = labelParcela(conta as ParcelaAuditoriaInput);
    const valor = auditFmtValor((row as { valor_pago_centavos?: number }).valor_pago_centavos ?? 0);
    const quando =
      (row as { data_pagamento?: string }).data_pagamento
        ? `${String((row as { data_pagamento?: string }).data_pagamento).slice(0, 10)}T12:00:00`
        : (row as { created_at?: string }).created_at || '';
    linhas.push({
      id: `baixa-${(row as { id: string }).id}`,
      quando,
      titulo: `${rotulo} — recebimento`,
      descricao: `${valor} • venc. ${String(conta.data_vencimento || '').slice(0, 10)}${ctr ? ` • Contrato ${ctr}` : ''}`,
      acao: 'Pagamento',
      categoria: 'parcela',
      contratoCodigo: ctr,
    });
  }
  return linhas;
}

function linhaFromTimeline(log: TimelineEvent, assinaturas: AssinaturaSB[]): LinhaAuditoriaCliente {
  const assId = assinaturaIdDoLog(log);
  const ctr = assId ? assinaturas.find((a) => a.id === assId) : undefined;
  return {
    id: log.id,
    quando: log.data_evento || log.created_at || '',
    titulo: log.titulo || auditAcaoLabel(log),
    descricao: log.descricao || '',
    acao: auditAcaoLabel(log),
    categoria: log.categoria || log.referencia_tipo || undefined,
    contratoCodigo: ctr?.codigo || (assId ? assId.slice(0, 8) : undefined),
    log,
  };
}

export function mesclarLinhasAuditoria(...listas: LinhaAuditoriaCliente[][]): LinhaAuditoriaCliente[] {
  const porId = new Map<string, LinhaAuditoriaCliente>();
  for (const lista of listas) {
    for (const l of lista) {
      if (!porId.has(l.id)) porId.set(l.id, l);
    }
  }
  return [...porId.values()].sort(
    (a, b) => new Date(b.quando || 0).getTime() - new Date(a.quando || 0).getTime(),
  );
}

export function montarLinhasAuditoriaCliente(
  timeline: TimelineEvent[],
  assinaturas: AssinaturaSB[],
  opts?: {
    somenteContratos?: boolean;
    parcelas?: ParcelaAuditoriaInput[];
    linhasExtras?: LinhaAuditoriaCliente[];
  },
): LinhaAuditoriaCliente[] {
  const refsComAuditoriaBenef = new Set(
    timeline
      .filter(
        (e) =>
          (e.tipo_evento || '').toUpperCase() === 'AUDITORIA' &&
          e.referencia_tipo === 'beneficiario' &&
          e.referencia_id,
      )
      .map((e) => e.referencia_id as string),
  );

  const fromTimeline = timeline
    .filter(isEventoAuditoriaTimeline)
    .filter((e) => (opts?.somenteContratos ? isEventoAuditoriaContrato(e) : true))
    .filter(
      (e) =>
        !(
          e.tipo_evento === 'beneficiario_inclusao' &&
          e.referencia_id &&
          refsComAuditoriaBenef.has(e.referencia_id)
        ),
    )
    .map((e) => linhaFromTimeline(e, assinaturas));

  const fromContratos = opts?.somenteContratos === false ? [] : linhasHistoricoContratos(assinaturas);
  const fromParcelas =
    opts?.parcelas?.length && opts.somenteContratos !== false
      ? linhasHistoricoParcelas(opts.parcelas, assinaturas)
      : [];

  const merged = mesclarLinhasAuditoria(
    fromTimeline,
    fromContratos,
    fromParcelas,
    opts?.linhasExtras ?? [],
  );

  // Se já existe um evento de auditoria explícito para a criação do contrato,
  // removemos a linha sintética (histórico gerado só a partir da tabela de contratos)
  // para evitar duplicidade e garantir que o responsável exibido seja o usuário real.
  const contratosComInclusaoLog = new Set(
    merged
      .filter(
        (l) =>
          l.log &&
          (l.categoria === 'contrato' || l.log.referencia_tipo === 'assinatura') &&
          l.acao === 'Inclusão' &&
          !!l.contratoCodigo,
      )
      .map((l) => l.contratoCodigo as string),
  );

  if (contratosComInclusaoLog.size === 0) return merged;

  return merged.filter((l) => {
    if (
      !l.log &&
      l.categoria === 'contrato' &&
      l.acao === 'Inclusão' &&
      l.contratoCodigo &&
      contratosComInclusaoLog.has(l.contratoCodigo)
    ) {
      // Descarta linha sintética duplicada; a linha com log tem o responsável correto.
      return false;
    }
    return true;
  });
}
