import { dataHojeIsoLocal } from './contratoDatas';
import { dataCalendarioSp } from './finCaixaSessaoMovimento';
import { supabase } from './supabase';

export function contaExigeSessaoCaixa(tipo: string | null | undefined): boolean {
  const t = (tipo || '').toLowerCase();
  return t === 'caixa' || t === 'corrente';
}

/** Sessão de caixa aberta na data informada (YYYY-MM-DD). */
export async function buscarSessaoCaixaAbertaNoDia(
  contaBancariaId: string,
  dataPagamento: string,
): Promise<string | null> {
  const sessao = await buscarSessaoCaixaNoDia(contaBancariaId, dataPagamento, 'aberto');
  return sessao?.id ?? null;
}

/** Sessão do dia (aberta ou fechada) — para registrar baixa na data correta. */
export async function buscarSessaoCaixaNoDia(
  contaBancariaId: string,
  dataPagamento: string,
  status?: 'aberto' | 'fechado',
): Promise<{ id: string; status: string } | null> {
  const dia = dataPagamento.slice(0, 10);
  if (!contaBancariaId || !dia) return null;

  const { data: conta } = await supabase
    .from('fin_contas_bancarias')
    .select('empresa_id')
    .eq('id', contaBancariaId)
    .maybeSingle();
  if (!conta?.empresa_id) return null;

  let query = supabase
    .from('fin_caixa_sessoes')
    .select('id, data_abertura, status')
    .eq('empresa_id', conta.empresa_id)
    .eq('conta_bancaria_id', contaBancariaId)
    .order('data_abertura', { ascending: false })
    .limit(60);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: sessoes, error } = await query;
  if (error) throw error;

  const match = (sessoes ?? []).find(
    (s) => dataCalendarioSp(String(s.data_abertura ?? '')) === dia,
  );
  if (!match?.id) return null;
  return { id: String(match.id), status: String(match.status || '') };
}

const OBS_RETROATIVA = 'Sessão retroativa — registro de baixa no balcão';
const OBS_FECHAMENTO_DIA_ANTERIOR =
  'Fechamento automático ao abrir o caixa do dia corrente (conferência diária).';

/** Fecha sessões abertas de outro dia sem mover lançamentos (evita o trigger de consolidação). */
async function fecharSessoesAbertasOutroDia(
  contaBancariaId: string,
  diaAtual: string,
  usuarioId?: string | null,
): Promise<void> {
  const { data: abertas, error } = await supabase
    .from('fin_caixa_sessoes')
    .select('id, data_abertura')
    .eq('conta_bancaria_id', contaBancariaId)
    .eq('status', 'aberto');

  if (error) throw error;

  const outras = (abertas ?? []).filter(
    (s) => dataCalendarioSp(String(s.data_abertura ?? '')) !== diaAtual,
  );

  for (const sessao of outras) {
    const { data: saldoFisico, error: saldoErr } = await supabase.rpc(
      'fin_caixa_saldo_fisico_sessao',
      { p_sessao_id: sessao.id },
    );
    if (saldoErr) throw saldoErr;

    const saldo = saldoFisico != null ? Number(saldoFisico) : 0;
    const diaAntigo = dataCalendarioSp(String(sessao.data_abertura ?? ''));

    const { error: closeErr } = await supabase
      .from('fin_caixa_sessoes')
      .update({
        status: 'fechado',
        saldo_sistema_centavos: saldo,
        saldo_informado_centavos: saldo,
        diferenca_centavos: 0,
        data_fechamento: new Date().toISOString(),
        usuario_fechamento_id: usuarioId?.trim() || null,
        observacoes_fechamento: `${OBS_FECHAMENTO_DIA_ANTERIOR} Dia ${diaAntigo}.`,
      })
      .eq('id', sessao.id)
      .eq('status', 'aberto');

    if (closeErr) throw closeErr;
  }
}

async function calcularSaldoAberturaNovaSessao(contaBancariaId: string, empresaId: string): Promise<number> {
  const { data: ultimaFechada } = await supabase
    .from('fin_caixa_sessoes')
    .select('id, saldo_sistema_centavos')
    .eq('empresa_id', empresaId)
    .eq('conta_bancaria_id', contaBancariaId)
    .eq('status', 'fechado')
    .order('data_fechamento', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ultimaFechada?.id) {
    const { data: saldoFisico } = await supabase.rpc('fin_caixa_saldo_fisico_sessao', {
      p_sessao_id: ultimaFechada.id,
    });
    if (saldoFisico != null) return Number(saldoFisico);
    if (ultimaFechada.saldo_sistema_centavos != null) {
      return Number(ultimaFechada.saldo_sistema_centavos);
    }
  }

  const { data: conta } = await supabase
    .from('fin_contas_bancarias')
    .select('saldo_atual_centavos')
    .eq('id', contaBancariaId)
    .maybeSingle();

  return conta?.saldo_atual_centavos != null ? Number(conta.saldo_atual_centavos) : 0;
}

async function reabrirSessaoHoje(sessaoId: string): Promise<void> {
  const { error: reopenErr } = await supabase
    .from('fin_caixa_sessoes')
    .update({
      status: 'aberto',
      data_fechamento: null,
      usuario_fechamento_id: null,
      observacoes_fechamento: null,
      saldo_informado_centavos: null,
      diferenca_centavos: null,
    })
    .eq('id', sessaoId);

  if (reopenErr) throw reopenErr;

  const { data: saldoRecalc } = await supabase.rpc('fin_caixa_saldo_fisico_sessao', {
    p_sessao_id: sessaoId,
  });
  if (saldoRecalc != null) {
    await supabase
      .from('fin_caixa_sessoes')
      .update({ saldo_sistema_centavos: saldoRecalc })
      .eq('id', sessaoId);
  }
}

async function abrirSessaoHoje(params: {
  contaBancariaId: string;
  empresaId: string;
  dia: string;
  usuarioId?: string | null;
  observacao?: string;
}): Promise<string> {
  await fecharSessoesAbertasOutroDia(params.contaBancariaId, params.dia, params.usuarioId);

  const existente = await buscarSessaoCaixaNoDia(params.contaBancariaId, params.dia);
  if (existente?.status === 'aberto') return existente.id;
  if (existente?.status === 'fechado') {
    await reabrirSessaoHoje(existente.id);
    return existente.id;
  }

  const saldoAbertura = await calcularSaldoAberturaNovaSessao(
    params.contaBancariaId,
    params.empresaId,
  );
  const obs = params.observacao?.trim() || `Abertura automática — dia ${params.dia}`;

  const { data: criada, error: insertErr } = await supabase
    .from('fin_caixa_sessoes')
    .insert({
      empresa_id: params.empresaId,
      conta_bancaria_id: params.contaBancariaId,
      usuario_abertura_id: params.usuarioId?.trim() || null,
      status: 'aberto',
      saldo_abertura_centavos: saldoAbertura,
      saldo_sistema_centavos: saldoAbertura,
      data_abertura: new Date().toISOString(),
      observacoes_abertura: obs,
    })
    .select('id')
    .single();

  if (insertErr) throw insertErr;
  if (!criada?.id) throw new Error('Não foi possível abrir o caixa do dia.');
  return String(criada.id);
}

/**
 * Garante sessão de caixa na data do pagamento.
 * - Hoje: mantém sessão ABERTA (reabre se foi fechada automaticamente).
 * - Dias passados: cria sessão retroativa fechada sem fechar dias anteriores abertos.
 */
export async function garantirSessaoCaixaParaDataBaixa(params: {
  contaBancariaId: string;
  dataPagamento: string;
  usuarioId?: string | null;
  observacao?: string;
}): Promise<string | null> {
  const dia = (params.dataPagamento || '').slice(0, 10) || dataHojeIsoLocal();
  const hoje = dataHojeIsoLocal();
  const contaId = params.contaBancariaId.trim();
  if (!contaId) return null;

  const { data: conta, error: contaErr } = await supabase
    .from('fin_contas_bancarias')
    .select('empresa_id, tipo')
    .eq('id', contaId)
    .maybeSingle();
  if (contaErr) throw contaErr;
  if (!contaExigeSessaoCaixa(conta?.tipo)) return null;
  if (!conta?.empresa_id) return null;

  if (dia === hoje) {
    return abrirSessaoHoje({
      contaBancariaId: contaId,
      empresaId: conta.empresa_id,
      dia,
      usuarioId: params.usuarioId,
      observacao: params.observacao,
    });
  }

  const existente = await buscarSessaoCaixaNoDia(contaId, dia);
  if (existente?.id) return existente.id;

  const obs = params.observacao?.trim() || OBS_RETROATIVA;
  const uid = params.usuarioId?.trim() || null;

  const { data: criada, error: insertErr } = await supabase
    .from('fin_caixa_sessoes')
    .insert({
      empresa_id: conta.empresa_id,
      conta_bancaria_id: contaId,
      usuario_abertura_id: uid,
      usuario_fechamento_id: uid,
      status: 'fechado',
      saldo_abertura_centavos: 0,
      saldo_sistema_centavos: 0,
      data_abertura: `${dia}T12:00:00`,
      data_fechamento: `${dia}T18:00:00`,
      observacoes_abertura: obs,
      observacoes_fechamento: obs,
    })
    .select('id')
    .single();

  if (insertErr) throw insertErr;
  return criada?.id ? String(criada.id) : null;
}

export type GarantirCaixaAbertoParams = {
  contaBancariaId: string;
  dataPagamento: string;
  observacao?: string;
  usuarioId?: string | null;
  /** Mantido para compatibilidade com CobrancasPendentes / Tesouraria. */
  abrirCaixa?: (
    contaBancariaId: string,
    saldoAberturaCentavos?: number,
    obs?: string,
    dataReferencia?: string,
  ) => Promise<boolean>;
};

/** Garante sessão na data do pagamento (hoje aberta; passado retroativo fechado). */
export async function garantirCaixaAbertoParaData(
  params: GarantirCaixaAbertoParams,
): Promise<string | null> {
  return garantirSessaoCaixaParaDataBaixa({
    contaBancariaId: params.contaBancariaId,
    dataPagamento: params.dataPagamento,
    usuarioId: params.usuarioId,
    observacao: params.observacao,
  });
}

export type CaixaOperadorRef = {
  id: string;
  nome: string;
  tipo?: string | null;
};

/** Caixa do operador (mesma regra de fin_baixar_conta_receber). */
async function resolverCaixaOperadorEmpresa(
  empresaId: string,
  usuarioId?: string | null,
): Promise<CaixaOperadorRef | null> {
  const uid = usuarioId?.trim() || null;
  const { data: contas, error } = await supabase
    .from('fin_contas_bancarias')
    .select('id, nome, tipo, autorizados_operacao')
    .eq('empresa_id', empresaId)
    .eq('tipo', 'caixa')
    .eq('ativo', true)
    .order('created_at', { ascending: true });

  if (error || !contas?.length) return null;

  const elegiveis = (contas as Array<{
    id: string;
    nome: string;
    tipo: string | null;
    autorizados_operacao?: string[] | null;
  }>).filter((cb) => {
    const auth = cb.autorizados_operacao;
    if (!uid) return true;
    if (!auth?.length) return true;
    return auth.includes(uid);
  });

  if (!elegiveis.length) return null;

  elegiveis.sort((a, b) => {
    const aAuth = uid && (a.autorizados_operacao || []).includes(uid) ? 0 : 1;
    const bAuth = uid && (b.autorizados_operacao || []).includes(uid) ? 0 : 1;
    return aAuth - bAuth;
  });

  const cb = elegiveis[0];
  return { id: cb.id, nome: cb.nome, tipo: cb.tipo };
}

async function resolverEmpresaIdDasContas(
  contas: Array<CaixaOperadorRef | null | undefined>,
): Promise<string | null> {
  const primeiroId = contas.find((c) => c?.id)?.id;
  if (!primeiroId) return null;
  const { data } = await supabase
    .from('fin_contas_bancarias')
    .select('empresa_id')
    .eq('id', primeiroId)
    .maybeSingle();
  return data?.empresa_id ? String(data.empresa_id) : null;
}

export type EnsureCaixaOperadorResult =
  | { ok: true }
  | { ok: false; errorMsg: string };

/** Prepara sessão de caixa na data da baixa. */
export async function ensureContasDestinoBaixa(params: {
  contas: Array<CaixaOperadorRef | null | undefined>;
  dataPagamento: string;
  usuarioId?: string | null;
  observacaoPrefixo?: string;
}): Promise<EnsureCaixaOperadorResult> {
  const dia = (params.dataPagamento || '').slice(0, 10) || dataHojeIsoLocal();
  const hoje = dataHojeIsoLocal();
  const vistos = new Set<string>();
  const fila: CaixaOperadorRef[] = [];

  for (const conta of params.contas) {
    if (!conta?.id || vistos.has(conta.id)) continue;
    vistos.add(conta.id);
    fila.push(conta);
  }

  // Baixas em conta corrente/PIX sincronizam no caixa do operador — garantir sessão desse caixa também.
  const empresaId = await resolverEmpresaIdDasContas(params.contas);
  if (empresaId && params.usuarioId) {
    const caixaOp = await resolverCaixaOperadorEmpresa(empresaId, params.usuarioId);
    if (caixaOp && !vistos.has(caixaOp.id)) {
      vistos.add(caixaOp.id);
      fila.push(caixaOp);
    }
  }

  for (const conta of fila) {
    if (!contaExigeSessaoCaixa(conta.tipo)) continue;

    try {
      const obs =
        dia === hoje
          ? params.observacaoPrefixo?.trim() || `Abertura automática — ${conta.nome}, ${dia}`
          : params.observacaoPrefixo?.trim() ||
            `Sessão retroativa — baixa (${conta.nome}, ${dia})`;

      const sessaoId = await garantirSessaoCaixaParaDataBaixa({
        contaBancariaId: conta.id,
        dataPagamento: dia,
        usuarioId: params.usuarioId,
        observacao: obs,
      });

      if (!sessaoId) {
        return {
          ok: false,
          errorMsg: `Não foi possível preparar o caixa "${conta.nome}" para a data ${dia}.`,
        };
      }
    } catch (err) {
      const detalhe = err instanceof Error ? err.message : 'Erro ao preparar sessão de caixa';
      return {
        ok: false,
        errorMsg: `Não foi possível registrar no caixa "${conta.nome}" para ${dia}: ${detalhe}`,
      };
    }
  }

  return { ok: true };
}
