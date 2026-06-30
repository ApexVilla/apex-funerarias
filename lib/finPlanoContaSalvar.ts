import type { PlanoContaItem } from './FinanceiroStore';

export function payloadPlanoContaSalvar(data: Partial<PlanoContaItem>): Record<string, unknown> {
  const nome = (data.nome || '').trim();
  const codigo = (data.codigo || '').trim();
  if (!nome) {
    throw new Error('Informe o nome da natureza.');
  }
  if (!codigo) {
    throw new Error('Código da natureza inválido. Feche e abra o formulário novamente.');
  }

  const paiRaw = data.pai_id;
  const pai_id =
    paiRaw && String(paiRaw).trim() && String(paiRaw) !== 'null' ? String(paiRaw).trim() : null;

  const nivelNum = Number(data.nivel);
  const nivel =
    Number.isFinite(nivelNum) && nivelNum >= 1 && nivelNum <= 5 ? Math.round(nivelNum) : 1;

  return {
    codigo,
    nome,
    tipo: (data.tipo || 'despesa').trim(),
    natureza: (data.natureza || 'devedora').trim(),
    nivel,
    pai_id,
    aceita_lancamento: Boolean(data.aceita_lancamento),
    conta_sistema: false,
    ativo: data.ativo !== false,
  };
}

export function mensagemErroPlanoConta(err: unknown): string {
  const bruto =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message?: string }).message)
        : 'Erro ao salvar natureza.';

  const msg = bruto.toLowerCase();

  if (msg.includes('row-level security') || msg.includes('42501')) {
    return 'Sem permissão para cadastrar ou alterar naturezas. Use um perfil financeiro ou administrador.';
  }
  if (msg.includes('fin_plano_contas_empresa_id_codigo_key') || msg.includes('duplicate key')) {
    return 'Já existe uma natureza com este código nesta unidade. Atualize a lista e tente de novo.';
  }
  if (msg.includes('fin_plano_contas_nivel_check')) {
    return 'Nível inválido (máximo 5). Escolha uma pasta pai mais próxima da raiz.';
  }
  if (msg.includes('fin_plano_contas_tipo_check')) {
    return 'Tipo de conta inválido.';
  }
  if (msg.includes('fin_plano_contas_natureza_check')) {
    return 'Natureza contábil inválida (use credora ou devedora).';
  }
  if (msg.includes('empresa') && (msg.includes('null') || msg.includes('not null'))) {
    return 'Selecione a unidade (empresa) no topo da tela antes de cadastrar.';
  }

  return bruto || 'Erro ao salvar natureza.';
}
