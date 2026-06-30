import { supabase } from './supabase';
import type { AssinaturaSB, ClienteSB } from './ClienteStore';
import {
  corrigirPossivelTypoAnoMigracao,
  dataHojeIsoLocal,
  normalizarDataIso,
} from './contratoDatas';

export type BeneficiarioFormRow = {
  id?: string;
  nome: string;
  parentesco: string;
  data_nascimento: string;
  data_inclusao: string;
  cpf?: string;
  rg?: string;
};

export function mapBeneficiariosDbParaForm(
  rows: Array<{
    id?: string;
    nome?: string | null;
    parentesco?: string | null;
    data_nascimento?: string | null;
    data_inclusao?: string | null;
    cpf?: string | null;
    rg_numero?: string | null;
  }>,
): BeneficiarioFormRow[] {
  return rows.map((b) => ({
    id: b.id as string,
    nome: b.nome || '',
    parentesco: b.parentesco || 'conjuge',
    data_nascimento: normalizarDataIso(b.data_nascimento) || '',
    data_inclusao: normalizarDataIso(b.data_inclusao) || dataHojeIsoLocal(),
    cpf: b.cpf || '',
    rg: b.rg_numero || '',
  }));
}

export async function carregarBeneficiariosClienteForm(
  clienteId: string,
): Promise<BeneficiarioFormRow[]> {
  const { data, error } = await supabase
    .from('beneficiarios')
    .select('id, nome, parentesco, data_nascimento, data_inclusao, cpf, rg_numero')
    .eq('cliente_id', clienteId)
    .is('deleted_at', null)
    .order('nome');

  if (error) throw error;
  return mapBeneficiariosDbParaForm(data || []);
}

/**
 * Data de início do contrato para cliente já cadastrado: usa `cliente_desde`,
 * senão a data de criação do cadastro, senão hoje.
 */
export function resolverDataInicioContratoDesdeCliente(cliente: Pick<ClienteSB, 'cliente_desde' | 'created_at'>): string {
  return (
    normalizarDataIso(cliente.cliente_desde) ||
    normalizarDataIso(cliente.created_at?.slice(0, 10)) ||
    dataHojeIsoLocal()
  );
}

/**
 * Data que deve gravar em `assinaturas.data_contratacao`.
 * Contrato novo: sempre a entrada na base (`cliente_desde`), nunca o dia de vencimento nem o 1º vencimento.
 */
export function resolverDataInicioContratoParaAssinatura(opts: {
  contratoMigracao: boolean;
  clienteDesdeDb?: string | null;
  dataEntradaForm?: string | null;
  dataInicioForm?: string | null;
}): string {
  if (opts.contratoMigracao) {
    const referencia =
      normalizarDataIso(opts.dataEntradaForm) ||
      normalizarDataIso(opts.clienteDesdeDb) ||
      '';
    const bruto =
      normalizarDataIso(opts.dataInicioForm) ||
      referencia ||
      dataHojeIsoLocal();
    return corrigirPossivelTypoAnoMigracao(referencia, bruto) || bruto;
  }
  const dbDesde = normalizarDataIso(opts.clienteDesdeDb);
  const formEntrada = normalizarDataIso(opts.dataEntradaForm);
  return dbDesde || formEntrada || dataHojeIsoLocal();
}

/** Contrato ativo ou o mais recente da lista em memória. */
export function resolverContratoPrincipal(assinaturas: AssinaturaSB[]): AssinaturaSB | null {
  if (!assinaturas.length) return null;
  return (
    assinaturas.find((a) => (a.status || '').toLowerCase() === 'ativo') || assinaturas[0] || null
  );
}

/**
 * Resolve o contrato efetivo a partir do seletor da ficha (valor "todos", id específico ou fallback).
 * Corrige ids órfãos (ex.: troca de cliente sem resetar o estado do seletor).
 */
export function resolverAssinaturaSelecionada(
  assinaturaId: string,
  assinaturas: AssinaturaSB[],
): AssinaturaSB | null {
  if (!assinaturas.length) return null;
  const principal = resolverContratoPrincipal(assinaturas);
  if (!assinaturaId || assinaturaId === 'todos') return principal;
  return assinaturas.find((a) => a.id === assinaturaId) || principal;
}

/** Garante id válido no seletor de contrato da ficha do cliente. */
export function normalizarContratoSelecionadoId(
  assinaturaId: string,
  assinaturas: AssinaturaSB[],
): string {
  if (!assinaturas.length) return 'todos';
  const principal = resolverContratoPrincipal(assinaturas);
  if (!assinaturaId || assinaturaId === 'todos') return principal?.id || 'todos';
  if (assinaturas.some((a) => a.id === assinaturaId)) return assinaturaId;
  return principal?.id || 'todos';
}

/** Contrato ativo mais recente do cliente (para pré-preencher edição). */
export async function carregarAssinaturaAtivaCliente(
  clienteId: string,
): Promise<AssinaturaSB | null> {
  const { data, error } = await supabase
    .from('assinaturas')
    .select('*')
    .eq('cliente_id', clienteId)
    .is('deleted_at', null)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as AssinaturaSB | null) ?? null;
}

export function resolverDiaVencimentoForm(opts: {
  assinaturaAtiva?: { dia_vencimento?: number | null } | null;
  diaVencimentoPreferido?: number | null;
}): string {
  const fromAssinatura = opts.assinaturaAtiva?.dia_vencimento;
  if (fromAssinatura != null && fromAssinatura >= 1 && fromAssinatura <= 31) {
    return String(fromAssinatura);
  }
  const pref = opts.diaVencimentoPreferido;
  if (pref != null && pref >= 1 && pref <= 31) return String(pref);
  return '5';
}

/** Campos do formulário de contrato preenchidos a partir do cliente já cadastrado. */
export function patchFormularioContratoDesdeCliente(
  cliente: ClienteSB,
  opts?: { cobradorIdCarteira?: string },
): {
  forma_pagamento_preferencial: string;
  vendedor_id: string;
  tipo_vendedor: string;
  cobrador_id: string;
} {
  const fp = cliente.forma_pagamento_preferencial || '';
  const cobradorId =
    fp === 'cobrador' && opts?.cobradorIdCarteira ? opts.cobradorIdCarteira : '';

  return {
    forma_pagamento_preferencial: fp,
    vendedor_id:
      cliente.tipo_vendedor === 'escritorio' || !cliente.vendedor_id
        ? ''
        : String(cliente.vendedor_id),
    tipo_vendedor: cliente.tipo_vendedor || '',
    cobrador_id: cobradorId,
  };
}
