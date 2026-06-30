import type { LucideIcon } from 'lucide-react';
import { clientePermiteCadastroSemCpf } from './clienteDuplicidade';
import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  Lock,
  PauseCircle,
  XCircle,
} from 'lucide-react';

export type ContratoStatusExibicao =
  | 'ativo'
  | 'inadimplente'
  | 'transferido'
  | 'bloqueado'
  | 'inativo'
  | 'cancelado'
  | 'suspenso'
  | 'sem_contrato';

export type ContratoStatusUiConfig = {
  label: string;
  cls: string;
  iconCls: string;
  Icon: LucideIcon;
};

export const CONTRATO_STATUS_UI: Record<ContratoStatusExibicao, ContratoStatusUiConfig> = {
  ativo: {
    label: 'Ativo',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    iconCls: 'text-emerald-600',
    Icon: CheckCircle2,
  },
  inadimplente: {
    label: 'Inadimplente',
    cls: 'bg-red-50 text-red-800 border-red-200',
    iconCls: 'text-red-600',
    Icon: AlertTriangle,
  },
  transferido: {
    label: 'Transferido',
    cls: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    iconCls: 'text-indigo-600',
    Icon: ArrowRightLeft,
  },
  bloqueado: {
    label: 'Bloqueado',
    cls: 'bg-rose-50 text-rose-900 border-rose-200',
    iconCls: 'text-rose-700',
    Icon: Lock,
  },
  inativo: {
    label: 'Inativo',
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
    iconCls: 'text-slate-500',
    Icon: PauseCircle,
  },
  cancelado: {
    label: 'Cancelado',
    cls: 'bg-gray-100 text-gray-700 border-gray-200',
    iconCls: 'text-gray-500',
    Icon: XCircle,
  },
  suspenso: {
    label: 'Suspenso',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    iconCls: 'text-amber-600',
    Icon: Ban,
  },
  sem_contrato: {
    label: 'Sem contrato',
    cls: 'bg-gray-50 text-gray-400 border-gray-100',
    iconCls: 'text-gray-300',
    Icon: PauseCircle,
  },
};

export type AssinaturaResumoLista = {
  id: string;
  codigo?: string | null;
  status?: string | null;
  data_contratacao?: string | null;
};

export type ClienteContratoContexto = {
  bloqueado?: boolean | null;
  contrato_migracao?: boolean | null;
  origem_canal?: string | null;
  status?: string | null;
};

function normalizarStatusAssinatura(status?: string | null): string {
  const s = String(status || '').toLowerCase().trim();
  if (s === 'cancelada') return 'cancelado';
  if (s === 'suspensa') return 'suspenso';
  if (s === 'ativa') return 'ativo';
  return s;
}

/** Escolhe o contrato principal para exibição na listagem. */
export function escolherAssinaturaPrincipal(
  assinaturas: AssinaturaResumoLista[],
): AssinaturaResumoLista | null {
  if (!assinaturas.length) return null;

  const ordenadas = [...assinaturas].sort((a, b) => {
    const pa = prioridadeStatusAssinatura(a.status);
    const pb = prioridadeStatusAssinatura(b.status);
    if (pa !== pb) return pa - pb;
    const da = a.data_contratacao || '';
    const db = b.data_contratacao || '';
    return db.localeCompare(da);
  });

  return ordenadas[0] || null;
}

function prioridadeStatusAssinatura(status?: string | null): number {
  const s = normalizarStatusAssinatura(status);
  const ordem: Record<string, number> = {
    ativo: 0,
    inadimplente: 1,
    suspenso: 2,
    transferido: 3,
    inativo: 4,
    cancelado: 5,
  };
  return ordem[s] ?? 6;
}

export function resolverStatusContratoExibicao(
  assinatura: AssinaturaResumoLista | null,
  cliente: ClienteContratoContexto,
): ContratoStatusExibicao {
  if (cliente.bloqueado) return 'bloqueado';

  const statusAssinatura = normalizarStatusAssinatura(assinatura?.status);
  if (statusAssinatura === 'cancelado') return 'cancelado';
  if (statusAssinatura === 'inadimplente') return 'inadimplente';
  if (statusAssinatura === 'suspenso') return 'suspenso';
  if (cliente.contrato_migracao || clientePermiteCadastroSemCpf(cliente.origem_canal)) {
    return 'transferido';
  }

  if (statusAssinatura === 'ativo') return 'ativo';

  const statusCliente = String(cliente.status || '').toLowerCase().trim();
  if (statusCliente === 'inativo') return 'inativo';
  if (statusCliente === 'cancelado') return 'cancelado';
  if (statusCliente === 'inadimplente') return 'inadimplente';
  if (statusAssinatura && statusAssinatura in CONTRATO_STATUS_UI) {
    return statusAssinatura as ContratoStatusExibicao;
  }

  if (!assinatura) return 'sem_contrato';
  return 'inativo';
}

export function extrairCodigoContratoNumerico(codigo?: string | null): string {
  const digits = String(codigo ?? '').replace(/\D/g, '');
  return digits || '—';
}

export function obterConfigStatusContrato(status: ContratoStatusExibicao): ContratoStatusUiConfig {
  return CONTRATO_STATUS_UI[status] || CONTRATO_STATUS_UI.sem_contrato;
}
