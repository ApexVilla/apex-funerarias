import { beneficiarioLinhaTemAlgumDado, type BeneficiarioLinhaForm } from './beneficiarioValidacaoCliente';
import { cpfValidoParaCadastro } from './cpfValidacao';
import { ORIGEM_CANAL_MIGRACAO } from './clienteDuplicidade';

export type GrupoCampoCadastro = 'titular' | 'endereco' | 'cobranca' | 'contato' | 'dependente';

export type PendenciaCadastro = {
  label: string;
  grupo: GrupoCampoCadastro;
  dependente?: string;
};

export type ResumoCompletudeCadastro = {
  totalRastreados: number;
  preenchidos: number;
  pendentes: number;
  percentual: number;
  itensPendentes: PendenciaCadastro[];
  titular: { pendentes: number; itens: PendenciaCadastro[] };
  dependentes: Array<{ nome: string; pendentes: number; itens: PendenciaCadastro[] }>;
};

export type ClienteCompletudeInput = {
  cpf?: string | null;
  data_nascimento?: string | null;
  rg?: string | null;
  sexo?: string | null;
  estado_civil?: string | null;
  email?: string | null;
  profissao?: string | null;
  nome_mae?: string | null;
  whatsapp?: string | null;
  telefone_principal?: string | null;
  endereco_cep?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  endereco_estado?: string | null;
  usa_endereco_residencial_cobranca?: boolean | null;
  endereco_cob_cep?: string | null;
  endereco_cob_logradouro?: string | null;
  endereco_cob_numero?: string | null;
  endereco_cob_bairro?: string | null;
  endereco_cob_cidade?: string | null;
  endereco_cob_uf?: string | null;
  origem_canal?: string | null;
};

export type DependenteCompletudeInput = BeneficiarioLinhaForm & {
  nome?: string | null;
  rg_numero?: string | null;
  data_inclusao?: string | null;
};

function textoPreenchido(v: unknown): boolean {
  return String(v ?? '').trim().length > 0;
}

function apenasDigitosRepetidos(digits: string): boolean {
  return digits.length > 0 && /^(\d)\1+$/.test(digits);
}

function pendencia(
  label: string,
  grupo: GrupoCampoCadastro,
  dependente?: string,
): PendenciaCadastro {
  return { label, grupo, dependente };
}

function checarCpf(cpf: unknown, grupo: GrupoCampoCadastro, dependente?: string): PendenciaCadastro | null {
  const digits = String(cpf ?? '').replace(/\D/g, '');
  if (!digits) return pendencia('CPF', grupo, dependente);
  if (digits.length !== 11) return pendencia('CPF (11 dígitos)', grupo, dependente);
  if (!cpfValidoParaCadastro(digits)) {
    return pendencia('CPF (válido, sem número fictício)', grupo, dependente);
  }
  return null;
}

function checarDataNascimento(
  valor: unknown,
  grupo: GrupoCampoCadastro,
  dependente?: string,
): PendenciaCadastro | null {
  const s = String(valor ?? '').trim().slice(0, 10);
  if (!s) return pendencia('Data de nascimento', grupo, dependente);
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return pendencia('Data de nascimento (válida)', grupo, dependente);
  }
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  if (d > hoje) return pendencia('Data de nascimento (não pode ser futura)', grupo, dependente);
  if (d.getFullYear() < 1900) {
    return pendencia('Data de nascimento (válida)', grupo, dependente);
  }
  return null;
}

function checarRg(valor: unknown, grupo: GrupoCampoCadastro, dependente?: string): PendenciaCadastro | null {
  const t = String(valor ?? '').trim();
  if (!t) return pendencia('RG', grupo, dependente);
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 3 && apenasDigitosRepetidos(digits)) {
    return pendencia('RG (válido)', grupo, dependente);
  }
  if (t.length < 3) return pendencia('RG', grupo, dependente);
  return null;
}

function checarTelefone(
  valor: unknown,
  grupo: GrupoCampoCadastro,
  dependente?: string,
): PendenciaCadastro | null {
  const digits = String(valor ?? '').replace(/\D/g, '');
  if (digits.length < 10) return pendencia('Telefone / WhatsApp', grupo, dependente);
  if (digits.length > 11) return pendencia('Telefone / WhatsApp (válido)', grupo, dependente);
  if (apenasDigitosRepetidos(digits) || digits === '00000000000') {
    return pendencia('Telefone / WhatsApp (válido)', grupo, dependente);
  }
  return null;
}

function checarEmail(valor: unknown, grupo: GrupoCampoCadastro): PendenciaCadastro | null {
  const e = String(valor ?? '').trim();
  if (!e) return pendencia('E-mail', grupo);
  if (!/\S+@\S+\.\S+/.test(e)) return pendencia('E-mail (válido)', grupo);
  return null;
}

function checarCep(valor: unknown, label: string, grupo: GrupoCampoCadastro): PendenciaCadastro | null {
  const digits = String(valor ?? '').replace(/\D/g, '');
  if (digits.length !== 8) return pendencia(label, grupo);
  if (digits === '00000000' || apenasDigitosRepetidos(digits)) {
    return pendencia(`${label} (válido)`, grupo);
  }
  return null;
}

function checarTexto(
  valor: unknown,
  label: string,
  grupo: GrupoCampoCadastro,
  dependente?: string,
): PendenciaCadastro | null {
  if (!textoPreenchido(valor)) return pendencia(label, grupo, dependente);
  return null;
}

function pendenciasTitular(cliente: ClienteCompletudeInput): PendenciaCadastro[] {
  const itens: PendenciaCadastro[] = [];
  const add = (p: PendenciaCadastro | null) => {
    if (p) itens.push(p);
  };

  add(checarTexto(cliente.nome_mae, 'Nome da mãe', 'titular'));
  const cadastroMigracao =
    String(cliente.origem_canal ?? '').trim().toLowerCase() === ORIGEM_CANAL_MIGRACAO;
  if (!cadastroMigracao) {
    add(checarCpf(cliente.cpf, 'titular'));
  }
  add(checarDataNascimento(cliente.data_nascimento, 'titular'));
  add(checarRg(cliente.rg, 'titular'));
  add(checarTexto(cliente.sexo, 'Sexo', 'titular'));
  add(checarTexto(cliente.estado_civil, 'Estado civil', 'titular'));
  add(checarEmail(cliente.email, 'contato'));
  add(checarTelefone(cliente.whatsapp || cliente.telefone_principal, 'contato'));
  add(checarTexto(cliente.profissao, 'Profissão', 'titular'));
  add(checarCep(cliente.endereco_cep, 'CEP (residencial)', 'endereco'));
  add(checarTexto(cliente.endereco_logradouro, 'Logradouro', 'endereco'));
  add(checarTexto(cliente.endereco_numero, 'Número', 'endereco'));
  add(checarTexto(cliente.endereco_bairro, 'Bairro', 'endereco'));
  add(checarTexto(cliente.endereco_cidade, 'Cidade', 'endereco'));
  add(checarTexto(cliente.endereco_estado, 'UF', 'endereco'));

  if (cliente.usa_endereco_residencial_cobranca === false) {
    add(checarCep(cliente.endereco_cob_cep, 'CEP (cobrança)', 'cobranca'));
    add(checarTexto(cliente.endereco_cob_logradouro, 'Logradouro (cobrança)', 'cobranca'));
    add(checarTexto(cliente.endereco_cob_numero, 'Número (cobrança)', 'cobranca'));
    add(checarTexto(cliente.endereco_cob_bairro, 'Bairro (cobrança)', 'cobranca'));
    add(checarTexto(cliente.endereco_cob_cidade, 'Cidade (cobrança)', 'cobranca'));
    add(checarTexto(cliente.endereco_cob_uf, 'UF (cobrança)', 'cobranca'));
  }

  return itens;
}

function pendenciasDependente(dep: DependenteCompletudeInput, indice: number): PendenciaCadastro[] {
  const linha: BeneficiarioLinhaForm = {
    nome: dep.nome ?? '',
    parentesco: dep.parentesco,
    data_nascimento: dep.data_nascimento,
    cpf: dep.cpf,
    rg: dep.rg ?? dep.rg_numero,
  };
  if (!beneficiarioLinhaTemAlgumDado(linha) && !(dep.nome || '').trim()) {
    return [];
  }

  const nomeDep = (dep.nome || '').trim() || `Dependente ${indice + 1}`;
  const rgVal = dep.rg ?? dep.rg_numero;
  const itens: PendenciaCadastro[] = [];
  const add = (p: PendenciaCadastro | null) => {
    if (p) itens.push(p);
  };

  add(checarTexto(dep.nome, 'Nome', 'dependente', nomeDep));
  add(checarTexto(dep.parentesco, 'Parentesco', 'dependente', nomeDep));
  add(checarDataNascimento(dep.data_nascimento, 'dependente', nomeDep));
  add(checarCpf(dep.cpf, 'dependente', nomeDep));
  add(checarRg(rgVal, 'dependente', nomeDep));
  add(checarTexto(dep.data_inclusao, 'Data de filiação', 'dependente', nomeDep));

  return itens;
}

function dependenteAtivoNoCadastro(dep: DependenteCompletudeInput): boolean {
  return (
    beneficiarioLinhaTemAlgumDado({
      nome: dep.nome ?? '',
      parentesco: dep.parentesco,
      data_nascimento: dep.data_nascimento,
      cpf: dep.cpf,
      rg: dep.rg ?? dep.rg_numero,
    }) || Boolean((dep.nome || '').trim())
  );
}

const CAMPOS_TITULAR_BASE = 15;
const CAMPOS_COBRANCA_EXTRA = 6;
const CAMPOS_POR_DEPENDENTE = 6;

function totalCamposRastreados(
  cliente: ClienteCompletudeInput,
  qtdDependentes: number,
): number {
  const cobranca = cliente.usa_endereco_residencial_cobranca === false ? CAMPOS_COBRANCA_EXTRA : 0;
  return CAMPOS_TITULAR_BASE + cobranca + qtdDependentes * CAMPOS_POR_DEPENDENTE;
}

export function calcularCompletudeCadastroCliente(
  cliente: ClienteCompletudeInput,
  dependentes: DependenteCompletudeInput[] = [],
): ResumoCompletudeCadastro {
  const titularItens = pendenciasTitular(cliente);
  const depGruposFiltrados = dependentes
    .map((d, i) => {
      if (!dependenteAtivoNoCadastro(d)) return null;
      const itens = pendenciasDependente(d, i);
      return {
        nome: (d.nome || '').trim() || `Dependente ${i + 1}`,
        pendentes: itens.length,
        itens,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g != null);

  const itensPendentes = [...titularItens, ...depGruposFiltrados.flatMap((g) => g.itens)];
  const totalRastreados = totalCamposRastreados(cliente, depGruposFiltrados.length);
  const pendentes = itensPendentes.length;
  const preenchidos = Math.max(0, totalRastreados - pendentes);
  const percentual = totalRastreados > 0 ? Math.round((preenchidos / totalRastreados) * 100) : 100;

  return {
    totalRastreados,
    preenchidos,
    pendentes,
    percentual,
    itensPendentes,
    titular: { pendentes: titularItens.length, itens: titularItens },
    dependentes: depGruposFiltrados,
  };
}

export function rotuloPendenciasCadastro(resumo: ResumoCompletudeCadastro): string {
  if (resumo.pendentes === 0) return 'Cadastro completo';
  if (resumo.pendentes === 1) return '1 dado pendente';
  return `${resumo.pendentes} dados pendentes`;
}

export const GRUPO_PENDENCIA_LABEL: Record<GrupoCampoCadastro, string> = {
  titular: 'Titular',
  endereco: 'Endereço',
  cobranca: 'Cobrança',
  contato: 'Contato',
  dependente: 'Dependente',
};

export type LinhaPendenciaCadastro = {
  id: string;
  numero: number;
  grupo: GrupoCampoCadastro;
  grupoLabel: string;
  campo: string;
  pessoa: string;
  tipoPessoa: 'titular' | 'dependente';
};

export type LinhaPendenciaCadastroExibicao = LinhaPendenciaCadastro & {
  /** Mesma pessoa da linha anterior — não repetir nome na tabela. */
  rowspanPessoa: number;
  rowspanGrupo: number;
};

function chavePessoaLinhaPendencia(linha: LinhaPendenciaCadastro): string {
  return `${linha.tipoPessoa}:${linha.pessoa.trim().toLowerCase()}`;
}

/** Lista plana para grade (estilo aba Financeiro do contrato). */
export function listarLinhasPendenciasCadastro(
  resumo: ResumoCompletudeCadastro,
  titularNome = 'Titular',
): LinhaPendenciaCadastro[] {
  return resumo.itensPendentes.map((item, idx) => ({
    id: `pend-${idx}-${item.grupo}-${item.label}-${item.dependente || 't'}`,
    numero: idx + 1,
    grupo: item.grupo,
    grupoLabel: GRUPO_PENDENCIA_LABEL[item.grupo] || item.grupo,
    campo: item.label,
    pessoa: item.dependente || titularNome,
    tipoPessoa: item.grupo === 'dependente' || item.dependente ? 'dependente' : 'titular',
  }));
}

/** Agrupa linhas consecutivas da mesma pessoa (titular não aparece duas vezes). */
export function prepararLinhasPendenciasParaExibicao(
  linhas: LinhaPendenciaCadastro[],
): LinhaPendenciaCadastroExibicao[] {
  const out: LinhaPendenciaCadastroExibicao[] = [];
  let i = 0;
  while (i < linhas.length) {
    const base = linhas[i];
    const chave = chavePessoaLinhaPendencia(base);
    let j = i + 1;
    while (j < linhas.length && chavePessoaLinhaPendencia(linhas[j]) === chave) {
      j += 1;
    }
    const spanPessoa = j - i;

    let k = i;
    while (k < j) {
      const linha = linhas[k];
      let spanGrupo = 1;
      if (k < j - 1 && linhas[k + 1].grupoLabel === linha.grupoLabel) {
        let g = k + 1;
        while (g < j && linhas[g].grupoLabel === linha.grupoLabel) {
          g += 1;
        }
        spanGrupo = g - k;
        for (let t = k; t < g; t += 1) {
          out.push({
            ...linhas[t],
            rowspanPessoa: t === i ? spanPessoa : 0,
            rowspanGrupo: t === k ? spanGrupo : 0,
          });
        }
        k = g;
      } else {
        out.push({
          ...linha,
          rowspanPessoa: k === i ? spanPessoa : 0,
          rowspanGrupo: 1,
        });
        k += 1;
      }
    }
    i = j;
  }
  return out;
}
