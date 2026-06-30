import { supabase } from './supabase';

export type PromoverBeneficiarioTitularParams = {
  beneficiarioId: string;
  motivo?: string;
  registrarExTitular?: boolean;
};

export type PromoverBeneficiarioTitularResult =
  | {
      ok: true;
      clienteId: string;
      titularAnteriorNome: string;
      titularNovoNome: string;
      exTitularDependenteId?: string | null;
    }
  | { ok: false; error: string };

export async function promoverBeneficiarioTitular(
  params: PromoverBeneficiarioTitularParams,
): Promise<PromoverBeneficiarioTitularResult> {
  const { data, error } = await supabase.rpc('fn_promover_beneficiario_titular', {
    p_beneficiario_id: params.beneficiarioId,
    p_motivo: params.motivo?.trim() || null,
    p_registrar_ex_titular: params.registrarExTitular !== false,
  });

  if (error) {
    const msg = error.message || 'Não foi possível promover o dependente a titular.';
    if (msg.includes('fn_promover_beneficiario_titular') || msg.includes('Could not find')) {
      return {
        ok: false,
        error:
          'Função de troca de titular não está no banco. Aplique a migration fn_promover_beneficiario_titular.',
      };
    }
    return { ok: false, error: msg };
  }

  const row = (data || {}) as Record<string, unknown>;
  if (row.ok !== true) {
    return { ok: false, error: 'Resposta inválida ao promover titular.' };
  }

  return {
    ok: true,
    clienteId: String(row.cliente_id || ''),
    titularAnteriorNome: String(row.titular_anterior_nome || ''),
    titularNovoNome: String(row.titular_novo_nome || ''),
    exTitularDependenteId: row.ex_titular_dependente_id
      ? String(row.ex_titular_dependente_id)
      : null,
  };
}
