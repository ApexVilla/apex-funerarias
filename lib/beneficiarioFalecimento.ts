import { supabase } from './supabase';
import type { BeneficiarioSB } from './ClienteStore';

export type OrigemFalecimentoBeneficiario = 'manual' | 'atendimento';

export function beneficiarioEstaFalecido(b: BeneficiarioSB | null | undefined): boolean {
  if (!b) return false;
  if (b.data_falecimento) return true;
  const status = String(b.status || '').toLowerCase();
  if (status === 'falecido') return true;
  if (b.ativo === false && status === 'inativo') return true;
  return false;
}

export function labelFalecimentoBeneficiario(b: BeneficiarioSB): string | null {
  if (!beneficiarioEstaFalecido(b)) return null;
  const data = (b.data_falecimento || b.data_exclusao || '').slice(0, 10);
  if (data) {
    const [y, m, d] = data.split('-');
    if (y && m && d) return `Falecido em ${d}/${m}/${y}`;
  }
  return 'Falecido (baixado no plano)';
}

export function separarBeneficiariosAtivosEFalecidos(beneficiarios: BeneficiarioSB[]) {
  const ativos: BeneficiarioSB[] = [];
  const falecidos: BeneficiarioSB[] = [];
  for (const b of beneficiarios || []) {
    if ((b as { deleted_at?: string | null }).deleted_at) continue;
    if (!(b.nome || '').trim()) continue;
    if (beneficiarioEstaFalecido(b)) falecidos.push(b);
    else if (b.ativo !== false && String(b.status || 'ativo').toLowerCase() === 'ativo') {
      ativos.push(b);
    } else {
      falecidos.push(b);
    }
  }
  return { ativos, falecidos };
}

export type RegistrarFalecimentoBeneficiarioParams = {
  beneficiarioId: string;
  dataFalecimento: string;
  motivo?: string;
  origem?: OrigemFalecimentoBeneficiario;
  atendimentoId?: string;
};

export type RegistrarFalecimentoBeneficiarioResult =
  | { ok: true; jaRegistrado?: boolean; nome?: string; dataFalecimento?: string }
  | { ok: false; error: string };

export async function registrarFalecimentoBeneficiario(
  params: RegistrarFalecimentoBeneficiarioParams,
): Promise<RegistrarFalecimentoBeneficiarioResult> {
  const data = (params.dataFalecimento || '').trim().slice(0, 10);
  if (!data) {
    return { ok: false, error: 'Informe a data do óbito.' };
  }

  const { data: row, error } = await supabase.rpc('fn_registrar_falecimento_beneficiario', {
    p_beneficiario_id: params.beneficiarioId,
    p_data_falecimento: data,
    p_motivo: params.motivo?.trim() || null,
    p_origem: params.origem || 'manual',
    p_atendimento_id: params.atendimentoId || null,
  });

  if (error) {
    const msg = error.message || 'Não foi possível registrar o óbito.';
    if (msg.includes('fn_registrar_falecimento_beneficiario')) {
      return {
        ok: false,
        error: 'Função de óbito não está no banco. Aplique a migration fn_registrar_falecimento_beneficiario.',
      };
    }
    return { ok: false, error: msg };
  }

  const r = (row || {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return { ok: false, error: 'Resposta inválida ao registrar óbito.' };
  }

  return {
    ok: true,
    jaRegistrado: r.ja_registrado === true,
    nome: String(r.nome || ''),
    dataFalecimento: String(r.data_falecimento || data),
  };
}
