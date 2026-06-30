/** Mensagem legível a partir de erros do Supabase/PostgREST ou genéricos. */

const CONSTRAINTS_AMIGAVEIS: Record<string, string> = {
  clientes_tipo_vendedor_check:
    'O tipo de vendedor não foi aceito. Selecione Escritório, Vendedor interno ou Vendedor externo e tente salvar de novo.',
  clientes_sexo_check:
    'O campo Sexo está com um valor inválido. Escolha Masculino, Feminino ou Outro.',
  clientes_cpf_key:
    'Já existe um cliente cadastrado com este CPF nesta unidade.',
  beneficiarios_cpf_key:
    'Já existe um dependente com este CPF.',
};

function extrairNomeConstraint(msg: string): string | null {
  const m = msg.match(/constraint\s+"([^"]+)"/i);
  return m?.[1]?.toLowerCase() || null;
}

function traduzirTextoTecnico(msg: string): string | null {
  const lower = msg.toLowerCase();

  for (const [nome, texto] of Object.entries(CONSTRAINTS_AMIGAVEIS)) {
    if (lower.includes(nome)) return texto;
  }

  const constraint = extrairNomeConstraint(msg);
  if (constraint && CONSTRAINTS_AMIGAVEIS[constraint]) {
    return CONSTRAINTS_AMIGAVEIS[constraint];
  }

  if (/row-level security|42501/i.test(msg)) {
    return 'Você não tem permissão para fazer isso. Peça ajuda ao administrador ou verifique a unidade selecionada no topo da tela.';
  }

  if (/violates foreign key constraint.*users_role_fkey/i.test(msg)) {
    return 'Perfil de acesso inválido. Escolha um perfil da lista.';
  }

  if (/violates foreign key/i.test(msg)) {
    return 'Algum vínculo do cadastro não foi encontrado (plano, vendedor ou unidade). Atualize a página e confira os campos.';
  }

  if (/violates check constraint/i.test(msg)) {
    return 'Algum campo foi preenchido com valor não permitido. Revise o formulário e tente novamente.';
  }

  if (/value too long|22001|string data right truncation/i.test(msg)) {
    const col =
      msg.match(/column\s+"([^"]+)"/i)?.[1]
      || msg.match(/\bfor\s+relation\s+"[^"]+"\s+column\s+"([^"]+)"/i)?.[1];
    if (col) {
      const limite = msg.match(/character varying\((\d+)\)/i)?.[1];
      const limiteTxt = limite ? ` (máximo ${limite} caracteres)` : '';
      return `O campo «${rotuloColuna(col)}» ultrapassou o tamanho permitido${limiteTxt}. Revise o valor na proposta e tente gerar o contrato novamente.`;
    }
    const limite = msg.match(/character varying\((\d+)\)/i)?.[1];
    if (limite === '20') {
      return 'O campo «Número do endereço» está muito longo (máximo 20 caracteres). Na proposta, informe só o número (ex.: 315) e coloque o restante no logradouro ou complemento.';
    }
    return 'Algum campo foi preenchido com texto longo demais. Revise endereço, telefone e demais dados da proposta e tente gerar o contrato novamente.';
  }

  if (/violates not-null constraint/i.test(msg)) {
    const col = msg.match(/column\s+"([^"]+)"/i)?.[1];
    if (col) {
      return `O campo obrigatório "${rotuloColuna(col)}" não foi preenchido.`;
    }
    return 'Falta preencher um campo obrigatório. Confira os itens marcados com * no formulário.';
  }

  if (/duplicate key|unique constraint|23505/i.test(msg)) {
    if (/cpf/i.test(msg)) return 'Já existe um cadastro com este CPF.';
    if (/codigo/i.test(msg) && /ser_atendimentos/i.test(msg)) {
      return 'Número de atendimento já em uso nesta unidade. Tente salvar novamente.';
    }
    if (/codigo/i.test(msg)) return 'Código já utilizado. Tente salvar novamente.';
    return 'Este registro já existe no sistema.';
  }

  if (/invalid input syntax|22007|date/i.test(msg) && /date/i.test(msg)) {
    return 'Data inválida. Use o formato dia/mês/ano.';
  }

  if (/dynamically imported module/i.test(msg)) {
    return 'Falha ao carregar parte do sistema. Recarregue a página (Ctrl+F5 ou F5) e tente de novo.';
  }

  if (/network|fetch failed|failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Não foi possível contactar o servidor. Confirme se está logado, recarregue a página (F5) e tente de novo. Se o erro continuar, o serviço pode estar instável — não é necessariamente falha da sua internet.';
  }

  if (/jwt|session|refresh token|not authenticated/i.test(msg)) {
    return 'Sua sessão expirou. Saia e entre novamente no sistema.';
  }

  return null;
}

function rotuloColuna(col: string): string {
  const map: Record<string, string> = {
    nome: 'Nome',
    cpf: 'CPF',
    sexo: 'Sexo',
    tipo_vendedor: 'Tipo de vendedor',
    vendedor_id: 'Vendedor',
    empresa_id: 'Unidade',
    plano_id: 'Plano',
    data_nascimento: 'Data de nascimento',
    estado_civil: 'Estado civil',
    endereco_cep: 'CEP',
    endereco_logradouro: 'Logradouro',
    endereco_numero: 'Número do endereço',
    endereco_complemento: 'Complemento do endereço',
    endereco_bairro: 'Bairro',
    endereco_cidade: 'Cidade',
    endereco_estado: 'UF',
    endereco_cob_numero: 'Número do endereço de cobrança',
    endereco_cob_logradouro: 'Logradouro de cobrança',
    telefone_principal: 'Telefone',
    celular: 'Celular',
    forma_pagamento: 'Forma de pagamento',
    forma_pagamento_preferencial: 'Forma de pagamento',
    parentesco: 'Parentesco do dependente',
  };
  return map[col] || col.replace(/_/g, ' ');
}

/** Remove prefixos técnicos que confundem o usuário. */
function limparMensagemBruta(msg: string): string {
  return msg
    .replace(/^new row for relation\s+"[^"]+"\s+/i, '')
    .replace(/^violates check constraint\s+"[^"]+"\s*/i, '')
    .trim();
}

function extrairTextoErroSupabase(e: unknown): string {
  if (e && typeof e === 'object') {
    const err = e as { message?: string; details?: string; hint?: string; code?: string };
    return [err.message, err.details, err.hint, err.code]
      .filter((part) => typeof part === 'string' && part.trim())
      .join(' ')
      .trim();
  }
  if (e instanceof Error) return e.message.trim();
  if (typeof e === 'string') return e.trim();
  return '';
}

export function mensagemErroSupabase(e: unknown, fallback: string): string {
  const msg = extrairTextoErroSupabase(e);

  if (msg) {
    const traduzida = traduzirTextoTecnico(msg);
    if (traduzida) return traduzida;

    const limpa = limparMensagemBruta(msg);
    if (limpa && limpa.length < 120 && !/violates|constraint|relation/i.test(limpa)) {
      return limpa;
    }
  }

  return fallback;
}

export function mensagemErroCadastroCliente(erro: unknown): string {
  const detalhe = mensagemErroSupabase(erro, 'Não foi possível salvar o cliente. Tente novamente.');
  return `Não foi possível cadastrar o cliente. ${detalhe}`;
}

export function mensagemErroContrato(erro: unknown): string {
  const detalhe = mensagemErroSupabase(
    erro,
    'Não foi possível criar o contrato. Verifique plano, permissões e unidade selecionada.',
  );
  return `Não foi possível criar o contrato. ${detalhe}`;
}

export function mensagemErroAtualizarCliente(erro: unknown): string {
  const detalhe = mensagemErroSupabase(erro, 'Não foi possível salvar as alterações.');
  return `Não foi possível atualizar o cliente. ${detalhe}`;
}

export function mensagemErroDependente(nome: string, erro: unknown): string {
  const detalhe = mensagemErroSupabase(erro, 'Verifique os dados do dependente.');
  return `Não foi possível salvar o dependente "${nome}". ${detalhe}`;
}
