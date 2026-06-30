import type { SupabaseClient } from '@supabase/supabase-js';

export type PropostaAlertaCadastroTipo =
  | 'cliente_cadastrado'
  | 'contrato_titular'
  | 'dependente_contrato'
  | 'proposta_aberta';

export interface PropostaAlertaCadastro {
  tipo: PropostaAlertaCadastroTipo;
  mensagem: string;
  documento?: string;
}

export function mensagensAlertaCadastroExistente(alertas: PropostaAlertaCadastro[]): string[] {
  return alertas.map((a) => a.mensagem);
}

export function temAlertaCadastroExistente(alertas: PropostaAlertaCadastro[]): boolean {
  return alertas.length > 0;
}

/** Bloqueia envio da proposta (ex.: outra proposta aberta para o mesmo CPF). */
export function temAlertaBloqueanteProposta(alertas: PropostaAlertaCadastro[]): boolean {
  return alertas.some((a) => a.tipo === 'proposta_aberta');
}

/** Cliente já cadastrado e/ou com contrato — segundo contrato no mesmo cadastro é permitido. */
export function temAvisoSegundoContratoProposta(alertas: PropostaAlertaCadastro[]): boolean {
  return alertas.some((a) => a.tipo === 'contrato_titular' || a.tipo === 'cliente_cadastrado');
}

function normalizarDoc(doc: string): string {
  return doc.replace(/\D/g, '');
}

function cpfEmDependentesDetalhes(
  dependentesDetalhes: unknown,
  cpf: string,
): boolean {
  if (!cpf || !Array.isArray(dependentesDetalhes)) return false;
  return dependentesDetalhes.some(
    (d) => normalizarDoc(String((d as { cpf?: string })?.cpf || '')) === cpf,
  );
}

/**
 * Verifica titular e dependentes contra cadastro de clientes, contratos e propostas abertas.
 */
export async function buscarAlertasCadastroExistenteProposta(
  supabase: SupabaseClient,
  params: {
    empresaIds: string[];
    titularDocumento: string;
    dependentesCpfs: string[];
    propostaIdIgnorar?: string | null;
  },
): Promise<PropostaAlertaCadastro[]> {
  const empresaIds = [...new Set(params.empresaIds.map((id) => id.trim()).filter(Boolean))];
  const titularDoc = normalizarDoc(params.titularDocumento);
  const cpfsDependentes = params.dependentesCpfs
    .map(normalizarDoc)
    .filter((cpf) => cpf.length === 11);
  const docsConsulta = Array.from(new Set([titularDoc, ...cpfsDependentes].filter((d) => d.length >= 11)));

  if (empresaIds.length === 0 || docsConsulta.length === 0) {
    return [];
  }

  const avisos: PropostaAlertaCadastro[] = [];
  const titularComContrato = new Set<string>();
  const dependenteComContrato = new Set<string>();

  const { data: clientesMatch, error: clientesError } = await supabase
    .from('clientes')
    .select('id, nome, cpf, status, empresa_id')
    .in('empresa_id', empresaIds)
    .in('cpf', docsConsulta)
    .is('deleted_at', null);
  if (clientesError) throw clientesError;

  const clienteIds = (clientesMatch || []).map((c) => c.id as string);
  const clienteById = new Map((clientesMatch || []).map((c) => [c.id as string, c]));
  const clienteByCpf = new Map(
    (clientesMatch || []).map((c) => [normalizarDoc(String(c.cpf || '')), c]),
  );

  const cpfsComCliente = new Set(clienteByCpf.keys());

  if (titularDoc.length >= 11 && cpfsComCliente.has(titularDoc)) {
    const cliente = clienteByCpf.get(titularDoc)!;
    avisos.push({
      tipo: 'cliente_cadastrado',
      documento: titularDoc,
      mensagem: `Titular já cadastrado como "${cliente.nome}" (status: ${cliente.status || '—'}). Será usado o mesmo cadastro para o novo contrato.`,
    });
  }

  cpfsDependentes.forEach((cpf) => {
    if (cpf === titularDoc) return;
    if (cpfsComCliente.has(cpf)) {
      const cliente = clienteByCpf.get(cpf)!;
      avisos.push({
        tipo: 'cliente_cadastrado',
        documento: cpf,
        mensagem: `CPF do dependente já consta como cliente titular: "${cliente.nome}".`,
      });
    }
  });

  if (clienteIds.length > 0) {
    const { data: assinaturasRows, error: assinaturasError } = await supabase
      .from('assinaturas')
      .select('id, cliente_id, codigo, status')
      .in('cliente_id', clienteIds)
      .is('deleted_at', null);
    if (assinaturasError) throw assinaturasError;

    (assinaturasRows || []).forEach((a) => {
      const cliente = clienteById.get(a.cliente_id as string);
      if (!cliente) return;
      const cpf = normalizarDoc(String(cliente.cpf || ''));
      if (cpf === titularDoc) {
        titularComContrato.add(cpf);
        avisos.push({
          tipo: 'contrato_titular',
          documento: cpf,
          mensagem: `Titular já possui contrato ${a.codigo || 'sem código'} (status: ${a.status}). Ao gerar este contrato, será criado um novo plano (CTR-…) no mesmo cadastro.`,
        });
      }
    });
  }

  const { data: beneficiariosRows, error: beneficiariosError } = await supabase
    .from('beneficiarios')
    .select('id, nome, cpf, cliente_id, assinatura_id, status, ativo')
    .in('empresa_id', empresaIds)
    .in('cpf', docsConsulta);
  if (beneficiariosError) throw beneficiariosError;

  const assinaturaIdsBenef = Array.from(
    new Set((beneficiariosRows || []).map((b) => b.assinatura_id).filter(Boolean)),
  ) as string[];
  const assinaturaById = new Map<string, { codigo?: string; status?: string }>();
  if (assinaturaIdsBenef.length > 0) {
    const { data: assRows, error: assErr } = await supabase
      .from('assinaturas')
      .select('id, codigo, status')
      .in('id', assinaturaIdsBenef);
    if (assErr) throw assErr;
    (assRows || []).forEach((a) => assinaturaById.set(a.id as string, a));
  }

  (beneficiariosRows || []).forEach((b) => {
    const cpf = normalizarDoc(String(b.cpf || ''));
    if (!cpf) return;
    const cliente = b.cliente_id
      ? clienteById.get(b.cliente_id as string)
      : clienteByCpf.get(cpf);
    const assinatura = b.assinatura_id
      ? assinaturaById.get(b.assinatura_id as string)
      : null;
    const ehTitular = cpf === titularDoc;
    const chave = ehTitular ? `titular:${cpf}` : `dep:${cpf}`;
    if (ehTitular && titularComContrato.has(cpf)) return;
    if (!ehTitular && dependenteComContrato.has(cpf)) return;
    if (ehTitular) titularComContrato.add(cpf);
    else dependenteComContrato.add(cpf);

    const nomePessoa = ehTitular ? 'Titular informado' : `Dependente ${b.nome || ''}`.trim();
    avisos.push({
      tipo: 'dependente_contrato',
      documento: cpf,
      mensagem:
        `${nomePessoa} já consta em contrato da família ${cliente?.nome || 'sem cliente definido'}`
        + `${assinatura?.codigo ? ` (${assinatura.codigo})` : ''}`
        + ` — status "${assinatura?.status || b.status || (b.ativo ? 'ativo' : 'inativo')}".`,
    });
  });

  let qPropostas = supabase
    .from('propostas_venda')
    .select('id, sequencial, status, contribuinte_documento, contribuinte_nome, dependentes_detalhes')
    .in('empresa_id', empresaIds)
    .in('status', ['rascunho', 'aguardando_contrato', 'pendente_geracao_contrato']);
  if (params.propostaIdIgnorar) {
    qPropostas = qPropostas.neq('id', params.propostaIdIgnorar);
  }
  const { data: propostasAbertas, error: propostasError } = await qPropostas;
  if (propostasError) throw propostasError;

  (propostasAbertas || []).forEach((p) => {
    const docTitular = normalizarDoc(String(p.contribuinte_documento || ''));
    const numero = String(p.sequencial ?? '').padStart(3, '0');
    const statusLabel = p.status || '—';

    if (titularDoc.length >= 11 && docTitular === titularDoc) {
      avisos.push({
        tipo: 'proposta_aberta',
        documento: titularDoc,
        mensagem: `Já existe proposta nº ${numero} em aberto para este titular (${p.contribuinte_nome || '—'}, status: ${statusLabel}).`,
      });
    }

    cpfsDependentes.forEach((cpfDep) => {
      if (cpfEmDependentesDetalhes(p.dependentes_detalhes, cpfDep)) {
        avisos.push({
          tipo: 'proposta_aberta',
          documento: cpfDep,
          mensagem: `Dependente (CPF …${cpfDep.slice(-4)}) já aparece na proposta nº ${numero} (${statusLabel}).`,
        });
      }
    });
  });

  const vistos = new Set<string>();
  return avisos.filter((a) => {
    const chave = `${a.tipo}|${a.documento || ''}|${a.mensagem}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}
