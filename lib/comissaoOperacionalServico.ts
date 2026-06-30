import { supabase } from './supabase';
import type { CargoComissaoOperacional } from './comissaoCalculo';
import type { ModoCalculoComissao } from './comissaoAtendenteService';

export type { ModoCalculoComissao };
export type TipoCalculoServicoComissao = 'fixo' | 'percentual';

export interface ComissaoOperacionalServicoDto {
  id: string;
  empresa_id: string;
  cargo: CargoComissaoOperacional;
  codigo: string;
  nome: string;
  descricao?: string | null;
  tipo_calculo: TipoCalculoServicoComissao;
  valor_fixo_centavos: number;
  percentual: number;
  palavras_chave: string[];
  ordem: number;
  ativo: boolean;
}

export interface ComissaoOperacionalServicoInput {
  codigo: string;
  nome: string;
  descricao?: string | null;
  tipo_calculo: TipoCalculoServicoComissao;
  valor_fixo_centavos: number;
  percentual: number;
  palavras_chave: string[];
  ordem: number;
  ativo: boolean;
}

function mapRow(row: Record<string, unknown>): ComissaoOperacionalServicoDto {
  return {
    id: String(row.id),
    empresa_id: String(row.empresa_id),
    cargo: row.cargo as CargoComissaoOperacional,
    codigo: String(row.codigo || ''),
    nome: String(row.nome || ''),
    descricao: row.descricao != null ? String(row.descricao) : null,
    tipo_calculo: (row.tipo_calculo as TipoCalculoServicoComissao) || 'fixo',
    valor_fixo_centavos: Number(row.valor_fixo_centavos || 0),
    percentual: Number(row.percentual || 0),
    palavras_chave: Array.isArray(row.palavras_chave) ? (row.palavras_chave as string[]) : [],
    ordem: Number(row.ordem || 0),
    ativo: row.ativo !== false,
  };
}

export async function listarComissaoOperacionalServicos(
  empresaIds: string[],
  cargo?: CargoComissaoOperacional,
): Promise<ComissaoOperacionalServicoDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  let q = supabase.from('comissao_operacional_servico').select('*').order('ordem').order('nome');
  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);
  if (cargo) q = q.eq('cargo', cargo);

  const { data, error } = await q;
  if (error) {
    console.error('[listarComissaoOperacionalServicos]', error);
    return [];
  }
  return (data || []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function salvarComissaoOperacionalServico(
  empresaId: string,
  cargo: CargoComissaoOperacional,
  input: ComissaoOperacionalServicoInput,
): Promise<boolean> {
  const payload = {
    empresa_id: empresaId,
    cargo,
    codigo: input.codigo.trim().toLowerCase(),
    nome: input.nome.trim(),
    descricao: input.descricao?.trim() || null,
    tipo_calculo: input.tipo_calculo,
    valor_fixo_centavos: Math.max(0, Math.round(input.valor_fixo_centavos) || 0),
    percentual: Math.max(0, Math.min(100, Number(input.percentual) || 0)),
    palavras_chave: input.palavras_chave.map((k) => k.trim().toLowerCase()).filter(Boolean),
    ordem: Math.max(0, Math.round(input.ordem) || 0),
    ativo: input.ativo,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('comissao_operacional_servico').upsert(payload, {
    onConflict: 'empresa_id,cargo,codigo',
  });

  if (error) {
    console.error('[salvarComissaoOperacionalServico]', error);
    return false;
  }
  return true;
}

export async function excluirComissaoOperacionalServico(id: string): Promise<boolean> {
  const { error } = await supabase.from('comissao_operacional_servico').delete().eq('id', id);
  if (error) {
    console.error('[excluirComissaoOperacionalServico]', error);
    return false;
  }
  return true;
}

export function formatarValorServicoComissao(servico: ComissaoOperacionalServicoDto): string {
  if (servico.tipo_calculo === 'percentual') {
    return `${servico.percentual.toFixed(2).replace('.', ',')}%`;
  }
  return `R$ ${(servico.valor_fixo_centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export function labelModoCalculo(modo: ModoCalculoComissao): string {
  return modo === 'por_servico' ? 'Por serviço (planilha)' : 'Percentual sobre OS';
}
