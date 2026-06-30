import { supabase } from './supabase';
import { cpfValidoParaCadastro } from './cpfValidacao';
import { normalizarCpfCliente } from './clienteDuplicidade';

export function normalizarCpfColaborador(raw?: string | null): string {
  return normalizarCpfCliente(raw);
}

/** Valida CPF quando informado (campo opcional em RH). */
export function validarCpfColaboradorSeInformado(cpf?: string | null): string | null {
  const digits = normalizarCpfColaborador(cpf);
  if (!digits) return null;
  if (digits.length < 11) {
    return 'CPF incompleto — preencha os 11 dígitos ou deixe o campo vazio.';
  }
  if (!cpfValidoParaCadastro(digits)) {
    return 'CPF inválido — confira o número digitado.';
  }
  return null;
}

/** Valida CPF obrigatório (ex.: cobrador). */
export function validarCpfObrigatorioColaborador(cpf?: string | null): string | null {
  const digits = normalizarCpfColaborador(cpf);
  if (!digits) return 'Informe o CPF.';
  return validarCpfColaboradorSeInformado(cpf);
}

export type PessoaDuplicadaCpfOrigem = 'colaborador' | 'cobrador';

export type PessoaDuplicadaCpfInfo = {
  origem: PessoaDuplicadaCpfOrigem;
  id: string;
  nome: string;
  email?: string | null;
  usuarioId?: string | null;
};

export function mensagemPessoaDuplicadaCpf(info: PessoaDuplicadaCpfInfo): string {
  const rotulo = info.origem === 'colaborador' ? 'colaborador' : 'cobrador';
  const email = info.email ? ` (${info.email})` : '';
  return `Já existe um ${rotulo} cadastrado com este CPF: "${info.nome}"${email}. Não é permitido duplicar.`;
}

export function normalizarNomeUsuario(raw?: string | null): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export type UsuarioDuplicadoEmailInfo = {
  id: string;
  nome: string;
  email: string;
  ativo?: boolean | null;
};

export type UsuarioDuplicadoNomeInfo = {
  id: string;
  nome: string;
  email?: string | null;
  ativo?: boolean | null;
};

function sufixoUnidade(empresaNome?: string | null): string {
  return empresaNome?.trim()
    ? ` nesta unidade (${empresaNome.trim()})`
    : ' nesta unidade';
}

export function mensagemUsuarioDuplicadoEmail(
  info: UsuarioDuplicadoEmailInfo,
  empresaNome?: string | null,
): string {
  const status = info.ativo === false ? ' (inativo)' : '';
  return `Já existe um usuário com o e-mail "${info.email}": ${info.nome}${status}${sufixoUnidade(empresaNome)}. Use outro e-mail ou edite o cadastro existente.`;
}

export function mensagemUsuarioDuplicadoNome(
  info: UsuarioDuplicadoNomeInfo,
  empresaNome?: string | null,
): string {
  const email = info.email ? ` (${info.email})` : '';
  const status = info.ativo === false ? ' (inativo)' : '';
  return `Já existe o usuário "${info.nome}"${email}${status}${sufixoUnidade(empresaNome)}. Use outro nome ou edite o cadastro existente.`;
}

/**
 * Impede o mesmo CPF em mais de um colaborador/cobrador ativo no sistema.
 */
export async function buscarPessoaDuplicadaPorCpf(params: {
  cpf?: string | null;
  excluirUsuarioId?: string | null;
  excluirCobradorId?: string | null;
}): Promise<PessoaDuplicadaCpfInfo | null> {
  const cpf = normalizarCpfColaborador(params.cpf);
  if (cpf.length !== 11 || !cpfValidoParaCadastro(cpf)) return null;

  const excluirUsuario = params.excluirUsuarioId?.trim() || null;
  const excluirCobrador = params.excluirCobradorId?.trim() || null;

  const { data: rhRows, error: rhErr } = await supabase
    .from('rh_colaborador_detalhes')
    .select('usuario_id, cpf, users:usuario_id ( id, nome, email, deleted_at )')
    .not('cpf', 'is', null);

  if (rhErr) console.warn('[buscarPessoaDuplicadaPorCpf] rh:', rhErr.message);

  for (const row of rhRows || []) {
    const digits = normalizarCpfColaborador((row as { cpf?: string }).cpf);
    if (digits !== cpf) continue;
    const usuarioId = String((row as { usuario_id?: string }).usuario_id || '');
    if (excluirUsuario && usuarioId === excluirUsuario) continue;
    const u = (row as { users?: { id?: string; nome?: string; email?: string; deleted_at?: string | null } }).users;
    if (u?.deleted_at) continue;
    return {
      origem: 'colaborador',
      id: usuarioId,
      nome: String(u?.nome || 'Colaborador'),
      email: u?.email || null,
      usuarioId,
    };
  }

  let qCob = supabase
    .from('cobradores')
    .select('id, nome, email, cpf, usuario_id, status')
    .not('cpf', 'is', null);
  if (excluirCobrador) qCob = qCob.neq('id', excluirCobrador);

  const { data: cobRows, error: cobErr } = await qCob;
  if (cobErr) console.warn('[buscarPessoaDuplicadaPorCpf] cobrador:', cobErr.message);

  for (const row of cobRows || []) {
    const digits = normalizarCpfColaborador((row as { cpf?: string }).cpf);
    if (digits !== cpf) continue;
    const cobrador = row as {
      id?: string;
      nome?: string;
      email?: string | null;
      usuario_id?: string | null;
      status?: string | null;
    };
    if (String(cobrador.status || '').toLowerCase() === 'inativo') continue;
    const vinculo = (cobrador.usuario_id || '').trim();
    if (excluirUsuario && vinculo && vinculo === excluirUsuario) continue;
    return {
      origem: 'cobrador',
      id: String(cobrador.id || ''),
      nome: String(cobrador.nome || 'Cobrador'),
      email: cobrador.email || null,
      usuarioId: vinculo || null,
    };
  }

  return null;
}

/** Impede criar outro usuário com o mesmo e-mail de login na mesma unidade. */
export async function buscarUsuarioDuplicadoPorEmail(
  email: string,
  empresaId: string,
  excluirUsuarioId?: string | null,
): Promise<UsuarioDuplicadoEmailInfo | null> {
  const norm = String(email || '').trim().toLowerCase();
  const emp = String(empresaId || '').trim();
  if (!norm || !norm.includes('@') || !emp) return null;

  let q = supabase
    .from('users')
    .select('id, nome, email, ativo')
    .eq('empresa_id', emp)
    .ilike('email', norm)
    .is('deleted_at', null);
  if (excluirUsuarioId) q = q.neq('id', excluirUsuarioId);

  const { data, error } = await q.maybeSingle();
  if (error) console.warn('[buscarUsuarioDuplicadoPorEmail]:', error.message);
  if (!data?.id) return null;

  return {
    id: String(data.id),
    nome: String(data.nome || 'Usuário'),
    email: String(data.email || norm),
    ativo: data.ativo,
  };
}

/** Impede criar outro usuário com o mesmo nome na mesma unidade. */
export async function buscarUsuarioDuplicadoPorNome(
  nome: string,
  empresaId: string,
  excluirUsuarioId?: string | null,
): Promise<UsuarioDuplicadoNomeInfo | null> {
  const norm = normalizarNomeUsuario(nome);
  const emp = String(empresaId || '').trim();
  if (norm.length < 3 || !emp) return null;

  let q = supabase
    .from('users')
    .select('id, nome, email, ativo')
    .eq('empresa_id', emp)
    .is('deleted_at', null);
  if (excluirUsuarioId) q = q.neq('id', excluirUsuarioId);

  const { data, error } = await q;
  if (error) console.warn('[buscarUsuarioDuplicadoPorNome]:', error.message);

  for (const row of data || []) {
    if (normalizarNomeUsuario((row as { nome?: string }).nome) !== norm) continue;
    return {
      id: String((row as { id?: string }).id || ''),
      nome: String((row as { nome?: string }).nome || nome),
      email: (row as { email?: string | null }).email || null,
      ativo: (row as { ativo?: boolean | null }).ativo,
    };
  }

  return null;
}
