import { supabase } from './supabase';
import { cpfValidoParaCadastro } from './cpfValidacao';

export function normalizarCpfCliente(raw?: string | null): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export function normalizarTelefoneCliente(raw?: string | null): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export type ClienteDuplicadoMotivo = 'cpf' | 'nome_telefone';

export type ClienteDuplicadoInfo = {
  id: string;
  nome: string;
  codigo?: string;
  cpf?: string | null;
  motivo: ClienteDuplicadoMotivo;
};

export function mensagemClienteDuplicado(info: ClienteDuplicadoInfo): string {
  const cod = info.codigo ? ` (código ${info.codigo})` : '';
  if (info.motivo === 'cpf') {
    return `Já existe o cliente "${info.nome}"${cod} com este CPF. Não é permitido cadastrar outro.`;
  }
  return `Já existe o cliente "${info.nome}"${cod} com o mesmo nome e telefone. Confira o cadastro existente antes de continuar.`;
}

/** Valor salvo em `clientes.origem_canal` para cadastros importados sem CPF. */
export const ORIGEM_CANAL_MIGRACAO = 'migracao';

export function clientePermiteCadastroSemCpf(origemCanal?: string | null): boolean {
  return String(origemCanal ?? '').trim().toLowerCase() === ORIGEM_CANAL_MIGRACAO;
}

/** Migração de cadastro e/ou contrato antigo — CPF pode ficar em branco. */
export function clientePermiteCadastroSemCpfPorFlags(params: {
  cadastroMigracao?: boolean;
  contratoMigracao?: boolean;
  origemCanal?: string | null;
}): boolean {
  if (clientePermiteCadastroSemCpf(params.origemCanal)) return true;
  return Boolean(params.cadastroMigracao || params.contratoMigracao);
}

/** Valida CPF somente quando o usuário informou algum dígito. */
export function validarCpfSeInformado(cpf?: string | null): string | null {
  const digits = normalizarCpfCliente(cpf);
  if (!digits) return null;
  if (digits.length < 11) {
    return 'CPF incompleto — preencha os 11 dígitos ou deixe o campo vazio.';
  }
  if (!cpfValidoParaCadastro(digits)) {
    return 'CPF inválido — confira o número digitado.';
  }
  return null;
}

/** Bloqueia CPF inválido ou placeholder em novo cadastro. */
export function validarCpfObrigatorioNovoCliente(cpf?: string | null): string | null {
  const digits = normalizarCpfCliente(cpf);
  if (digits.length === 0) {
    return 'CPF é obrigatório em cadastros novos — informe os 11 dígitos ou marque migração/transferência de outra funerária.';
  }
  if (digits.length < 11) {
    return 'CPF incompleto — preencha os 11 dígitos.';
  }
  if (!cpfValidoParaCadastro(digits)) {
    return 'CPF inválido — confira o número digitado.';
  }
  return null;
}

/**
 * Busca cliente ativo com mesmo CPF ou combinação nome + telefone.
 */
export async function buscarClienteDuplicado(params: {
  cpf?: string | null;
  nome?: string | null;
  telefone?: string | null;
  empresaIds?: string[];
  excluirClienteId?: string | null;
}): Promise<ClienteDuplicadoInfo | null> {
  const cpf = normalizarCpfCliente(params.cpf);
  const excluir = params.excluirClienteId?.trim() || null;

  if (cpf.length === 11) {
    let q = supabase
      .from('clientes')
      .select('id, nome, codigo, cpf')
      .eq('cpf', cpf)
      .is('deleted_at', null);
    if (excluir) q = q.neq('id', excluir);
    const { data, error } = await q.maybeSingle();
    if (error) console.warn('[buscarClienteDuplicado] cpf:', error.message);
    if (data?.id) {
      return {
        id: data.id,
        nome: data.nome,
        codigo: data.codigo,
        cpf: data.cpf,
        motivo: 'cpf',
      };
    }
  }

  const tel = normalizarTelefoneCliente(params.telefone);
  const nomeNorm = String(params.nome ?? '').trim().toLowerCase();
  if (tel.length < 10 || nomeNorm.length < 3) return null;

  let q = supabase
    .from('clientes')
    .select('id, nome, codigo, cpf, telefone_principal, celular')
    .is('deleted_at', null);
  const ids = (params.empresaIds || []).map((id) => id.trim()).filter(Boolean);
  if (ids.length === 1) q = q.eq('empresa_id', ids[0]);
  else if (ids.length > 1) q = q.in('empresa_id', ids);
  if (excluir) q = q.neq('id', excluir);

  const { data: rows, error: errRows } = await q.limit(800);
  if (errRows) {
    console.warn('[buscarClienteDuplicado] nome/telefone:', errRows.message);
    return null;
  }

  const sufixo = tel.slice(-8);
  const match = (rows || []).find((c) => {
    const nomeOk = String(c.nome || '').trim().toLowerCase() === nomeNorm;
    if (!nomeOk) return false;
    const tels = [
      normalizarTelefoneCliente(c.telefone_principal),
      normalizarTelefoneCliente(c.celular),
    ].filter((t) => t.length >= 10);
    return tels.some((t) => t === tel || t.slice(-8) === sufixo);
  });

  if (!match?.id) return null;
  return {
    id: match.id,
    nome: match.nome,
    codigo: match.codigo,
    cpf: match.cpf,
    motivo: 'nome_telefone',
  };
}
