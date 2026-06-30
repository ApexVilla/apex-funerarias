import { supabase } from './supabase';
import {
  charsPorLinha,
  loadReciboTermicoConfig,
  loadReciboTermicoConfigFinanceiro,
  metricasLayoutReciboImpressao,
  RECIBO_COBRADOR_DEFAULTS,
  resolveAvisoRodape,
  type ReciboTermicoConfig,
} from './reciboTermicoConfig';
import { generateReciboPDF, type ReciboData } from './ReciboService';
import {
  calcularResumoSintetico,
  rotuloContratoItem,
  rotuloParcelasItem,
  type ItemRelatorioCobradorPeriodo,
  type TipoRelatorioCobradorPeriodo,
} from './cobradorRelatorioPeriodo';
import { urlLogoReciboTermico } from './reciboTermicoLogo';
import {
  carregarEmpresaReciboContext,
  carregarEmpresaReciboPorClienteId,
  type EmpresaReciboContext,
} from './reciboEmpresaContexto';

export type { ItemRelatorioCobradorPeriodo, TipoRelatorioCobradorPeriodo } from './cobradorRelatorioPeriodo';

export type ModoReciboBaixaCobrador = 'pdf' | 'termica';

export type ReciboTermicoParcela = {
  label: string;
  valorCentavos: number;
  /** Número sequencial da parcela (ex.: 3 de 12). */
  parcelaNumero?: number;
  totalParcelas?: number;
  /** Data da parcela (dd/mm/aaaa) para a coluna PARCELA. */
  dataParcela?: string;
  /** Sigla do tipo (ex.: TXM). */
  tipo?: string;
};

export type ReciboTermicoData = {
  empresaNome: string;
  empresaCnpj: string;
  telefone: string;
  enderecoEmpresa?: string;
  logoUrl?: string;
  dataHora: string;
  atendente: string;
  /** Quando preenchido, o recibo usa rótulo COBRADOR em vez de Atendente. */
  cobradorNome?: string;
  parcelas: ReciboTermicoParcela[];
  totalCentavos: number;
  clienteCodigo: string;
  contratoCodigo: string;
  clienteNome: string;
  clienteCpfCnpj?: string;
  endereco: string;
  formaPagamento?: string;
  planoNome?: string;
  /** Data do pagamento (aaaa-mm-dd) — ex.: PIX RECEBIDO EM. */
  dataPagamento?: string;
};

const formatarCnpj = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return digits || '03617822000104';
  return digits;
};

const formatarCnpjExibicao = (value?: string | null) => {
  const digits = formatarCnpj(value);
  if (digits.length !== 14) return digits;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const formatarTelefone = (value?: string | null) => {
  const d = String(value || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)})${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)})${d.slice(2, 6)}-${d.slice(6)}`;
  return value || '';
};

export function formatarValorRecibo(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Ex.: `3/12` ou `3` quando não há total. */
export function rotuloNumeroParcelaRecibo(parcelaNumero?: number, totalParcelas?: number): string {
  const n = Math.max(1, Number(parcelaNumero) || 1);
  const total = Number(totalParcelas);
  if (total > 0) return `${n}/${total}`;
  return String(n);
}

export function labelParcelaRecibo(
  parcelaNumero: number,
  dataVencimento: string,
  totalParcelas?: number,
  descricao?: string
): string {
  const d = new Date(`${(dataVencimento || '').slice(0, 10)}T12:00:00`);
  const desc = descricao ? descricao.replace(/parcela|mensalidade/gi, '').trim() : 'MENSALIDADE';
  const descClean = desc.length > 13 ? desc.slice(0, 13) + '.' : desc;
  const numParcLabel = totalParcelas ? `${parcelaNumero}/${totalParcelas}` : `${parcelaNumero}`;
  if (Number.isNaN(d.getTime())) return `${numParcLabel} - ${descClean.toUpperCase()}`;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${numParcLabel} (${mm}/${yyyy}) ${descClean.toUpperCase()}`;
}

function padCodigoExibicao(codigo: string, tamanho = 8): string {
  const n = String(codigo || '').replace(/\D/g, '');
  if (!n) return codigo || '—';
  return n.padStart(tamanho, '0');
}

/** Supabase pode devolver relação como objeto ou array de um item. */
function primeiroRelacao<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

function extrairNumeroContrato(codigo?: string | null): string {
  const raw = String(codigo || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits) return digits.slice(-6).padStart(6, '0');
  return raw || '000000';
}

function montarEnderecoCliente(cli: {
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  endereco_estado?: string | null;
}): string {
  const partes: string[] = [];
  const rua = [cli.endereco_logradouro, cli.endereco_numero].filter(Boolean).join(' ').trim();
  if (rua) partes.push(rua);
  if (cli.endereco_complemento) partes.push(String(cli.endereco_complemento));
  const loc = [cli.endereco_bairro, cli.endereco_cidade, cli.endereco_estado].filter(Boolean).join(' ');
  if (loc) partes.push(loc);
  return partes.join(' ').toUpperCase();
}

export async function carregarContextoEmpresaRecibo(
  empresaIdExplicito?: string | null,
): Promise<EmpresaReciboContext> {
  return carregarEmpresaReciboContext(empresaIdExplicito);
}

export async function montarReciboTermicoBaixa(input: {
  clienteId: string;
  clienteNome: string;
  parcelas: Array<{
    parcela_numero: number;
    data_vencimento: string;
    valorCentavos: number;
    descricao?: string;
    total_parcelas?: number;
    /** Código do título (fin_contas_receber) — ex.: 116 na etiqueta. */
    codigo?: string;
  }>;
  totalCentavos: number;
  formaPagamento?: string;
  atendente?: string;
  /** Nome do cobrador em rota — exibe "COBRADOR: NOME" na etiqueta. */
  nomeCobrador?: string;
  assinaturaCodigo?: string | null;
  planoNome?: string | null;
  /** Data do pagamento (aaaa-mm-dd). */
  dataPagamento?: string;
  /** Força CNPJ/nome da unidade emissora (ex.: empresa do cliente). */
  empresaId?: string | null;
}): Promise<ReciboTermicoData> {
  const [empresa, cliRes, assRes] = await Promise.all([
    input.empresaId
      ? carregarEmpresaReciboContext(input.empresaId)
      : carregarEmpresaReciboPorClienteId(input.clienteId),
    supabase
      .from('clientes')
      .select(
        'codigo, cpf, empresa_id, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado, endereco_cob_logradouro, endereco_cob_numero, endereco_cob_bairro, endereco_cob_cidade, endereco_cob_estado',
      )
      .eq('id', input.clienteId)
      .maybeSingle(),
    supabase
      .from('assinaturas')
      .select('codigo, planos(nome)')
      .eq('cliente_id', input.clienteId)
      .eq('status', 'ativo')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const cli = cliRes.data;
  const enderecoCob = cli
    ? montarEnderecoCliente({
        endereco_logradouro: cli.endereco_cob_logradouro || cli.endereco_logradouro,
        endereco_numero: cli.endereco_cob_numero || cli.endereco_numero,
        endereco_bairro: cli.endereco_cob_bairro || cli.endereco_bairro,
        endereco_cidade: cli.endereco_cob_cidade || cli.endereco_cidade,
        endereco_estado: cli.endereco_cob_estado || cli.endereco_estado,
      })
    : '';
  const endereco = enderecoCob || (cli ? montarEnderecoCliente(cli) : '');

  let contratoCodigo = input.assinaturaCodigo || '';
  let planoNome = input.planoNome || '';

  const assAtiva = primeiroRelacao(assRes.data);
  if (assAtiva) {
    if (!contratoCodigo) {
      contratoCodigo = String(assAtiva.codigo || '');
    }
    if (!planoNome) {
      const plano = primeiroRelacao(assAtiva.planos as { nome?: string } | { nome?: string }[] | null);
      planoNome = plano?.nome || '';
    }
  }

  // Se ainda não encontrou, busca no histórico de contas receber
  if (!contratoCodigo) {
    const { data: hist } = await supabase
      .from('fin_contas_receber')
      .select('assinatura_id, assinaturas(codigo, planos(nome))')
      .eq('cliente_id', input.clienteId)
      .not('assinatura_id', 'is', null)
      .limit(1)
      .maybeSingle();

    const assHist = primeiroRelacao(
      hist?.assinaturas as { codigo?: string; planos?: { nome?: string } | { nome?: string }[] } | null,
    );
    if (assHist) {
      if (!contratoCodigo) contratoCodigo = String(assHist.codigo || '');
      if (!planoNome) {
        const plano = primeiroRelacao(assHist.planos);
        planoNome = plano?.nome || '';
      }
    }
  }

  return {
    empresaNome: empresa.nome,
    empresaCnpj: empresa.cnpj,
    telefone: empresa.telefone,
    enderecoEmpresa: empresa.endereco,
    logoUrl: empresa.logoUrl,
    dataHora: (() => {
      const agora = new Date();
      return `${agora.toLocaleDateString('pt-BR')}, ${agora.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`;
    })(),
    atendente: (input.atendente || input.nomeCobrador || 'ATENDENTE').toUpperCase(),
    cobradorNome: input.nomeCobrador?.trim()
      ? input.nomeCobrador.trim().toUpperCase()
      : undefined,
    parcelas: input.parcelas.map((p) => ({
      label: labelParcelaRecibo(
        p.parcela_numero,
        p.data_vencimento,
        p.total_parcelas,
        p.descricao,
      ),
      valorCentavos: p.valorCentavos,
      parcelaNumero: p.parcela_numero,
      totalParcelas: p.total_parcelas,
      dataParcela: formatarDataParcelaRecibo(p.data_vencimento),
      tipo: inferirTipoParcelaRecibo(p.descricao),
    })),
    totalCentavos: input.totalCentavos,
    clienteCodigo: padCodigoExibicao(cli?.codigo || ''),
    contratoCodigo: extrairNumeroContrato(contratoCodigo),
    clienteNome: input.clienteNome.toUpperCase(),
    clienteCpfCnpj: mascararCpfCnpjRecibo(cli?.cpf),
    endereco,
    formaPagamento: input.formaPagamento,
    planoNome: planoNome || undefined,
    dataPagamento: input.dataPagamento?.slice(0, 10) || undefined,
  };
}

function linhaDupla(esq: string, dir: string, cols: number): string {
  const e = (esq || '').trim();
  const d = (dir || '').trim();
  if (!d) return e.slice(0, cols);
  const espaco = Math.max(1, cols - e.length - d.length);
  if (e.length + espaco + d.length <= cols) {
    return (e + ' '.repeat(espaco) + d).slice(0, cols);
  }
  return `${e} ${d}`.slice(0, cols);
}

function pushLinhasTexto(linhas: string[], texto: string, cols: number): void {
  const t = (texto || '').trim();
  if (!t) return;
  for (const l of quebrarTexto(t, cols)) {
    linhas.push(l.slice(0, cols));
  }
}

function pushLinha(linhas: string[], texto: string, cols: number): void {
  linhas.push((texto || '').slice(0, cols));
}

function separador(char: string, cols: number): string {
  return char.repeat(cols);
}

function quebrarTexto(texto: string, cols: number): string[] {
  const t = (texto || '').trim();
  if (!t) return [];
  const palavras = t.split(/\s+/);
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    const cand = atual ? `${atual} ${p}` : p;
    if (cand.length <= cols) atual = cand;
    else {
      if (atual) linhas.push(atual);
      atual = p.length > cols ? p.slice(0, cols) : p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function centralizar(texto: string, cols: number): string {
  const s = (texto || '').slice(0, cols);
  const pad = Math.max(0, Math.floor((cols - s.length) / 2));
  return ' '.repeat(pad) + s;
}

function rotuloParcelaCurta(label: string): string {
  const m = label.match(/\((\d{2}\/\d{4})\)/);
  return m?.[1] || label.slice(0, 10);
}

/** Formato legado na etiqueta: `116 - 06/2026`. */
function rotuloParcelaLegado(label: string): string {
  const curto = label.trim();
  if (/^\d+\s*-\s*\d{2}\/\d{4}$/.test(curto)) return curto.replace(/\s*-\s*/, ' - ');
  const m = label.match(/^(\d+(?:\/\d+)?)\s*\((\d{2})\/(\d{4})\)/);
  if (m) return `${m[1]} - ${m[2]}/${m[3]}`;
  const m2 = label.match(/\((\d{2}\/\d{4})\)/);
  if (m2) return m2[1];
  return label.slice(0, 14);
}

/** Código do título (ex.: 116) + vencimento — formato da etiqueta Fenix. */
export function rotuloParcelaCodigoLegado(codigo: string, dataVencimento?: string): string {
  const digits = String(codigo || '').replace(/\D/g, '');
  const exibir = digits ? String(Number(digits) || digits) : String(codigo || '').trim();
  const venc = String(dataVencimento || '').slice(0, 10);
  if (!venc) return exibir;
  const d = new Date(`${venc}T12:00:00`);
  if (Number.isNaN(d.getTime())) return exibir;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return exibir ? `${exibir} - ${mm}/${yyyy}` : `${mm}/${yyyy}`;
}

function dataCurtaRecibo(data: string): string {
  const m = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[1]}/${m[2]}/${m[3].slice(-2)}`;
  return data;
}

/** Separa data/hora do atendimento (formato pt-BR). */
export function splitDataHoraAtendimento(dataHora: string): { data: string; hora: string } {
  const bruto = (dataHora || '').trim();
  const virgula = bruto.indexOf(',');
  if (virgula >= 0) {
    return {
      data: bruto.slice(0, virgula).trim(),
      hora: bruto.slice(virgula + 1).trim(),
    };
  }
  const agora = new Date();
  return {
    data: bruto || agora.toLocaleDateString('pt-BR'),
    hora: agora.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}

/** Data e hora para o rodapé do recibo (ex.: 01/06/2026 14:35:02). */
export function formatarDataHoraReciboExibicao(dataHora: string): string {
  const { data, hora } = splitDataHoraAtendimento(dataHora);
  return hora ? `${data} ${hora}` : data;
}

function totalReciboCentavos(data: ReciboTermicoData): number {
  const soma = data.parcelas.reduce((s, p) => s + (Number(p.valorCentavos) || 0), 0);
  if (soma > 0) return soma;
  return Number(data.totalCentavos) || 0;
}

function formatarDataParcelaRecibo(dataVencimento?: string): string {
  const venc = String(dataVencimento || '').slice(0, 10);
  if (!venc) return '';
  const d = new Date(`${venc}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

function formatarDataIsoRecibo(iso?: string): string {
  const venc = String(iso || '').slice(0, 10);
  if (!venc) return '';
  const d = new Date(`${venc}T12:00:00`);
  if (Number.isNaN(d.getTime())) return venc;
  return d.toLocaleDateString('pt-BR');
}

export function mascararCpfCnpjRecibo(doc?: string | null): string {
  const digits = String(doc || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.***-**`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.***-**`;
  }
  return digits ? '***' : '';
}

function inferirTipoParcelaRecibo(descricao?: string): string {
  const d = String(descricao || '').toUpperCase();
  if (d.includes('TXM') || d.includes('TAXA') || d.includes('MENSAL')) return 'TXM';
  if (d.includes('CARN') || d.includes('CARNE')) return 'CARN';
  return 'TXM';
}

export function rotuloFormaPagamentoRecibo(forma?: string): string {
  const raw = String(forma || '').trim();
  if (!raw || raw === '-' || raw === '—') return 'NAO INFORMADO';
  const f = raw.toUpperCase();
  if (f.includes('PIX') || f.includes('TRANSFER')) return 'TRANSFERENCIA (PIX)';
  if (f.includes('DEBITO')) return 'CARTAO DEBITO';
  if (f.includes('CREDITO')) return 'CARTAO CREDITO';
  if (f.includes('DINHEIRO') || f.includes('ESPECIE')) return 'DINHEIRO';
  if (f.includes('BOLETO')) return 'BOLETO';
  if (f.includes('CHEQUE')) return 'CHEQUE';
  return f;
}

function limparTelefoneDoAviso(texto: string): string {
  return texto
    .replace(/\s*\(?\d{2}\)?\s*\d{4,5}[-.]?\d{4}\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCabecalhoTabelaParcelas(cols: number): string {
  const cab = 'PARCELA   TIPO  FORMA PAG     VALOR';
  return cab.slice(0, cols);
}

function montarLinhaTabelaParcela(
  dataParc: string,
  tipo: string,
  forma: string,
  valor: string,
  cols: number,
): string {
  const valorPad = valor.padStart(7);
  const formaMax = Math.max(4, cols - dataParc.length - tipo.length - valorPad.length - 3);
  const formaC = forma.slice(0, formaMax);
  const meio = `${dataParc} ${tipo} ${formaC}`;
  const espacos = Math.max(1, cols - meio.length - valorPad.length);
  return `${meio}${' '.repeat(espacos)}${valorPad}`.slice(0, cols);
}

function formaPagamentoTabelaRecibo(forma?: string): { linha1: string; linha2?: string } {
  const raw = String(forma || '').trim();
  if (!raw || raw === '-' || raw === '—') return { linha1: 'NAO INF' };
  const f = raw.toUpperCase();
  if (f.includes('PIX')) return { linha1: 'TRANSFERENCIA', linha2: '(PIX)' };
  if (f.includes('TRANSFER')) return { linha1: 'TRANSFERENCIA' };
  if (f.includes('DEBITO')) return { linha1: 'CARTAO DEB' };
  if (f.includes('CREDITO')) return { linha1: 'CARTAO CRED' };
  if (f.includes('DINHEIRO') || f.includes('ESPECIE')) return { linha1: 'DINHEIRO' };
  if (f.includes('BOLETO')) return { linha1: 'BOLETO' };
  if (f.includes('CHEQUE')) return { linha1: 'CHEQUE' };
  return { linha1: f.slice(0, 14) };
}

function formatLinhasParcelaTabelaFenix(
  dataParc: string,
  tipo: string,
  forma1: string,
  forma2: string | undefined,
  valor: string,
  cols: number,
): string[] {
  const linhaPrincipal = montarLinhaTabelaParcela(dataParc, tipo, forma1, valor, cols);
  const linhas = [linhaPrincipal];
  if (forma2) {
    const colForma = dataParc.length + 1 + tipo.length + 2;
    const indent = ' '.repeat(Math.max(0, Math.min(colForma, cols - forma2.length)));
    linhas.push(`${indent}${forma2}`.slice(0, cols));
  }
  return linhas;
}

/** Layout do comprovante de pagamento (modelo Fenix) — tabela PARCELA | TIPO | FORMA PAG | VALOR. */
export function gerarLinhasReciboTermico(
  data: ReciboTermicoData,
  cfg: ReciboTermicoConfig = loadReciboTermicoConfig(),
): string[] {
  const cols = charsPorLinha(cfg.larguraMm);
  const linhas: string[] = [];
  const { data: dataGeracao, hora: horaGeracao } = splitDataHoraAtendimento(data.dataHora);
  const responsavel = (data.cobradorNome || data.atendente || 'ATENDENTE').slice(0, cols - 12);
  const rotuloResp = data.cobradorNome ? 'COBRADOR' : 'ATENDENTE';
  const totalCentavos = totalReciboCentavos(data);
  const qtd = Math.max(1, data.parcelas.length);
  const cnpjFmt = formatarCnpjExibicao(data.empresaCnpj);
  const foneFmt = formatarTelefone(data.telefone);
  const dataPag = data.dataPagamento ? formatarDataIsoRecibo(data.dataPagamento) : dataGeracao;
  const valorTotalFmt = formatarValorRecibo(totalCentavos);
  const planoUpper = (data.planoNome || '').toUpperCase().trim();
  const contratoLinha = planoUpper
    ? `${data.contratoCodigo.padStart(6, '0')} - ${planoUpper}`
    : data.contratoCodigo.padStart(6, '0');
  const formaTabela = formaPagamentoTabelaRecibo(data.formaPagamento);
  const ehPix = rotuloFormaPagamentoRecibo(data.formaPagamento).includes('PIX');

  for (const l of quebrarTexto(data.empresaNome.toUpperCase(), cols)) {
    pushLinha(linhas, centralizar(l, cols), cols);
  }
  if (cnpjFmt) pushLinha(linhas, centralizar(`CNPJ: ${cnpjFmt}`, cols), cols);
  if (data.enderecoEmpresa?.trim()) {
    for (const l of quebrarTexto(data.enderecoEmpresa.toUpperCase(), cols)) {
      pushLinha(linhas, centralizar(l, cols), cols);
    }
  }
  if (foneFmt) pushLinha(linhas, centralizar(`FONE: ${foneFmt}`, cols), cols);
  pushLinha(linhas, '', cols);
  pushLinha(linhas, centralizar('RECIBO DE PAGAMENTO', cols), cols);
  pushLinha(linhas, separador('=', cols), cols);

  pushLinha(linhas, `CLIENTE: ${data.clienteNome}`.slice(0, cols), cols);
  if (data.clienteCpfCnpj) {
    pushLinha(linhas, `CPF/CNPJ: ${data.clienteCpfCnpj}`.slice(0, cols), cols);
  }
  pushLinha(linhas, `CONTRATO N\u00BA: ${contratoLinha}`.slice(0, cols), cols);
  pushLinha(linhas, '', cols);

  pushLinha(linhas, formatCabecalhoTabelaParcelas(cols), cols);
  pushLinha(linhas, separador('-', cols), cols);

  const parcelasExibir = data.parcelas.length
    ? data.parcelas
    : [{ label: '', valorCentavos: totalCentavos, dataParcela: dataPag, tipo: 'TXM' }];

  for (const p of parcelasExibir) {
    const dataParc = p.dataParcela || dataPag;
    const tipo = (p.tipo || 'TXM').toUpperCase();
    const valorStr = formatarValorRecibo(p.valorCentavos || totalCentavos);
    for (const tl of formatLinhasParcelaTabelaFenix(
      dataParc,
      tipo,
      formaTabela.linha1,
      formaTabela.linha2,
      valorStr,
      cols,
    )) {
      pushLinha(linhas, tl, cols);
    }
  }

  pushLinha(linhas, separador('-', cols), cols);
  pushLinha(
    linhas,
    linhasDuplaTotal(`${qtd} parcela(s) no valor total de`, valorTotalFmt, cols).slice(0, cols),
    cols,
  );
  pushLinha(linhas, '', cols);

  pushLinha(linhas, `${rotuloResp}: ${responsavel}`.slice(0, cols), cols);
  const geradoEm = horaGeracao
    ? `RECIBO GERADO EM: ${dataGeracao} ${horaGeracao}`
    : `RECIBO GERADO EM: ${dataGeracao}`;
  pushLinha(linhas, geradoEm.slice(0, cols), cols);

  if (ehPix) {
    const pixEm = horaGeracao
      ? `PIX RECEBIDO EM: ${dataPag} ${horaGeracao}`
      : `PIX RECEBIDO EM: ${dataPag}`;
    pushLinha(linhas, pixEm.slice(0, cols), cols);
  }

  pushLinha(linhas, '', cols);
  const aviso = resolveAvisoRodape(cfg);
  if (aviso) {
    const limpo = limparTelefoneDoAviso(aviso);
    if (limpo) {
      for (const l of quebrarTexto(limpo, cols)) {
        pushLinha(linhas, centralizar(l, cols), cols);
      }
    }
  }
  pushLinha(linhas, separador('-', cols), cols);
  pushLinha(linhas, '', cols);
  pushLinha(linhas, '', cols);
  return linhas;
}

function linhasDuplaTotal(esq: string, dir: string, cols: number): string {
  const pontos = Math.max(1, cols - esq.length - dir.length - 1);
  return `${esq} ${'.'.repeat(pontos)} ${dir}`;
}

function fmtDataPeriodo(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}

function cabecalhoRelatorioTermico(
  cols: number,
  opts: { empresaNome: string; titulo: string; cobradorNome: string; caixaNome?: string; dataInicio: string; dataFim: string },
): string[] {
  const linhas: string[] = [];
  linhas.push(opts.empresaNome.toUpperCase());
  linhas.push(opts.titulo);
  linhas.push(`COBRADOR: ${opts.cobradorNome.toUpperCase()}`);
  if (opts.caixaNome?.trim()) {
    for (const l of quebrarTexto(`CAIXA: ${opts.caixaNome.trim().toUpperCase()}`, cols)) linhas.push(l);
  }
  linhas.push(`Periodo: ${fmtDataPeriodo(opts.dataInicio)} a ${fmtDataPeriodo(opts.dataFim)}`);
  linhas.push(separador('=', cols));
  return linhas;
}

/** Sintético: PIX, cartão, qtd. clientes e total do período. */
export function gerarLinhasResumoCobradorPeriodo(opts: {
  empresaNome: string;
  cobradorNome: string;
  caixaNome?: string;
  dataInicio: string;
  dataFim: string;
  itens: ItemRelatorioCobradorPeriodo[];
}): string[] {
  const cfg = loadReciboTermicoConfig();
  const cols = charsPorLinha(cfg.larguraMm);
  const fmt = (c: number) => formatarValorRecibo(c);
  const resumo = calcularResumoSintetico(opts.itens);

  const linhas = cabecalhoRelatorioTermico(cols, {
    ...opts,
    titulo: 'RELATORIO SINTETICO',
  });

  linhas.push(linhaDupla('TOTAL PIX', fmt(resumo.totalPixCentavos), cols));
  linhas.push(linhaDupla('TOTAL CARTAO', fmt(resumo.totalCartaoCentavos), cols));
  if (resumo.totalDinheiroCentavos > 0) {
    linhas.push(linhaDupla('TOTAL DINHEIRO', fmt(resumo.totalDinheiroCentavos), cols));
  }
  if (resumo.totalOutrosCentavos > 0) {
    linhas.push(linhaDupla('OUTROS', fmt(resumo.totalOutrosCentavos), cols));
  }
  linhas.push(separador('-', cols));
  linhas.push(linhaDupla('TOTAL CLIENTES', String(resumo.qtdClientes), cols));
  linhas.push(linhaDupla('RECEBIMENTOS', String(resumo.qtdRecebimentos), cols));
  linhas.push(separador('=', cols));
  linhas.push(linhaDupla('TOTAL GERAL', fmt(resumo.totalCentavos), cols));
  linhas.push(separador('-', cols));
  linhas.push(new Date().toLocaleString('pt-BR'));
  linhas.push('');
  linhas.push('');
  return linhas;
}

/** Analítico: cada cliente com contrato, parcelas e valor. */
export function gerarLinhasRelatorioAnaliticoCobradorPeriodo(opts: {
  empresaNome: string;
  cobradorNome: string;
  caixaNome?: string;
  dataInicio: string;
  dataFim: string;
  itens: ItemRelatorioCobradorPeriodo[];
}): string[] {
  const cfg = loadReciboTermicoConfig();
  const cols = charsPorLinha(cfg.larguraMm);
  const fmt = (c: number) => formatarValorRecibo(c);
  const resumo = calcularResumoSintetico(opts.itens);

  const linhas = cabecalhoRelatorioTermico(cols, {
    ...opts,
    titulo: 'RELATORIO ANALITICO',
  });

  linhas.push('CONTRATO | CLIENTE | PARC | VALOR');
  linhas.push(separador('-', cols));

  const ordenados = [...opts.itens].sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      rotuloContratoItem(a).localeCompare(rotuloContratoItem(b), 'pt-BR') ||
      a.cliente_nome.localeCompare(b.cliente_nome, 'pt-BR'),
  );
  const maxItens = 80;
  const lista = ordenados.slice(0, maxItens);

  for (const item of lista) {
    const contrato = rotuloContratoItem(item);
    const parc = rotuloParcelasItem(item);
    const forma = labelFormaPagamentoRecibo(item.forma_pagamento) || item.forma_pagamento;
    linhas.push(`${fmtDataPeriodo(item.data)}  ${fmt(item.valor_centavos)}`);
    linhas.push(`CTR: ${contrato}`);
    for (const l of quebrarTexto(item.cliente_nome, cols)) linhas.push(l);
    linhas.push(`PARC: ${parc}  ${forma}`);
    linhas.push('');
  }

  if (ordenados.length > maxItens) {
    linhas.push(`+${ordenados.length - maxItens} cliente(s) no PDF.`);
    linhas.push('');
  }

  linhas.push(separador('=', cols));
  linhas.push(linhaDupla('TOTAL GERAL', fmt(resumo.totalCentavos), cols));
  linhas.push(`Clientes: ${resumo.qtdClientes}`);
  linhas.push(separador('-', cols));
  linhas.push(new Date().toLocaleString('pt-BR'));
  linhas.push('');
  linhas.push('');
  return linhas;
}

export type RelatorioCobradorPeriodoOpts = {
  empresaNome: string;
  cobradorNome: string;
  caixaNome?: string;
  dataInicio: string;
  dataFim: string;
  itens: ItemRelatorioCobradorPeriodo[];
  tipo?: TipoRelatorioCobradorPeriodo;
  modo?: ModoReciboBaixaCobrador;
  janelaPdf?: Window | null;
};

function cssReciboTermico(mm: number, _cols: number): string {
  const largura = mm === 58 ? 58 : 80;
  const { fontSizeMm, tituloMm, destaqueMm, paddingHorizontalMm } = metricasLayoutReciboImpressao(largura);
  const logoMaxMm = largura === 58 ? 16 : 20;
  return `
  @page { size: ${mm}mm auto; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; width: ${mm}mm; min-width: ${mm}mm; background: #fff; }
  body {
    font-family: 'Courier New', Courier, 'Lucida Console', monospace;
    font-size: ${fontSizeMm.toFixed(2)}mm;
    font-weight: 700;
    line-height: 1.38;
    color: #000;
    padding: 2mm ${paddingHorizontalMm.toFixed(1)}mm 3mm;
    width: ${mm}mm;
  }
  .recibo-linhas {
    width: 100%;
    max-width: ${mm}mm;
  }
  .logo-wrap {
    text-align: center;
    margin: 0 0 2mm;
    width: 100%;
    line-height: 0;
  }
  .logo {
    display: block;
    margin: 0 auto;
    width: 88%;
    max-width: ${mm === 58 ? 48 : 68}mm;
    max-height: ${logoMaxMm}mm;
    height: auto;
    object-fit: contain;
    image-rendering: crisp-edges;
    filter: contrast(1.35);
  }
  .line {
    display: block;
    width: 100%;
    color: #000;
    font-weight: 700;
    margin: 0.28mm 0;
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: pre-wrap;
  }
  .line.vazio { height: 1.5mm; margin: 0; }
  .line.empresa {
    text-align: center;
    font-size: ${tituloMm.toFixed(2)}mm;
    font-weight: 900;
    letter-spacing: 0.03em;
    margin: 0.4mm 0;
  }
  .line.titulo {
    text-align: center;
    font-size: ${(tituloMm * 1.05).toFixed(2)}mm;
    font-weight: 900;
    margin: 1.5mm 0 0.5mm;
    letter-spacing: 0.04em;
  }
  .line.centro { text-align: center; }
  .line.sep {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    color: #000;
    font-size: ${(fontSizeMm * 0.9).toFixed(2)}mm;
    margin: 0.8mm 0;
    letter-spacing: 0;
  }
  .line.rotulo {
    font-weight: 900;
    font-size: ${(fontSizeMm * 1.05).toFixed(2)}mm;
    margin-top: 1.2mm;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .line.valor {
    font-size: ${(destaqueMm * 0.9).toFixed(2)}mm;
    font-weight: 900;
    text-align: center;
    margin: 0.5mm 0;
    letter-spacing: 0.03em;
  }
  .line.total {
    font-size: ${destaqueMm.toFixed(2)}mm;
    font-weight: 900;
    text-align: center;
    margin: 1.5mm 0;
    letter-spacing: 0.04em;
    border: 0.4mm solid #000;
    padding: 1mm 0;
  }
  .line.rodape {
    font-size: ${(fontSizeMm * 0.9).toFixed(2)}mm;
    text-align: center;
    font-style: italic;
    margin-top: 0.5mm;
  }
  @media print {
    html, body { width: ${mm}mm; }
    body { font-weight: 700; -webkit-print-color-adjust: exact; }
    .line { color: #000 !important; }
    .line.total { border: 0.4mm solid #000 !important; }
  }`;
}

function textoLinhaRecibo(linha: string): string {
  return (linha || '').trim();
}

function classificarLinhaRecibo(linha: string): string {
  const t = textoLinhaRecibo(linha);
  if (!t) return 'line vazio';

  // Separadores
  if (/^=+$|^-+$|^_+$/.test(t)) return 'line sep';

  // Título principal
  if (/^\*{0,3}\s*RECIBO DE PAGAMENTO\s*\*{0,3}$/i.test(t)) return 'line titulo';

  // Cabeçalho da tabela
  if (/^PARCELA\s+TIPO\s+FORMA PAG/i.test(t)) return 'line rotulo';

  // Cliente / contrato
  if (/^(CLIENTE:|CPF\/CNPJ:|CONTRATO)/i.test(t)) return 'line';

  // Linhas de dados com rótulo:valor
  if (/^(ATENDENTE|COBRADOR|RECIBO GERADO EM|PIX RECEBIDO EM|CNPJ:|FONE:)/i.test(t)) {
    return 'line';
  }

  // Total de parcelas
  if (/parcela\(s\) no valor total/i.test(t)) return 'line total';

  // Linha da tabela (data + valor à direita)
  if (/^\d{2}\/\d{2}\/\d{4}/.test(t) && /\d,\d{2}$/.test(t)) return 'line valor';

  // Segunda linha da forma (PIX)
  if (/^\(PIX\)$/i.test(t)) return 'line valor';

  // Mensagem de rodapé / aviso
  if (/reajuste|janeiro|mensalidade|amor que|legado|cuidando/i.test(t)) return 'line rodape';

  // Nome da empresa (centralizado, com espaços à esquerda ou só maiúsculas)
  if (linha.length - t.length >= 2) return 'line empresa';
  if (t.length <= 48 && /^[A-Z0-9ÁÉÍÓÚÃÕÇ .\-/()*ºª]+$/.test(t) && !t.includes(':')) {
    return 'line empresa';
  }

  return 'line';
}

function renderLinhasReciboHtml(linhas: string[], logoUrl?: string): string {
  const logoSrc = logoUrl ? escapeHtml(logoUrl) : '';
  const logoBlock = logoSrc
    ? `<div class="logo-wrap"><img class="logo" src="${logoSrc}" alt="Logo" /></div>`
    : '';

  const body = linhas
    .map((l) => {
      const cls = classificarLinhaRecibo(l);
      const texto = textoLinhaRecibo(l);
      return `<div class="${cls}">${escapeHtml(texto) || '&nbsp;'}</div>`;
    })
    .join('');

  return `${logoBlock}<div class="recibo-linhas">${body}</div>`;
}

export function gerarHtmlLinhasReciboTermico(
  linhas: string[],
  cfg: ReciboTermicoConfig = loadReciboTermicoConfig(),
  logoUrl?: string,
): string {
  const mm = cfg.larguraMm;
  const cols = charsPorLinha(mm);
  const body = renderLinhasReciboHtml(linhas, logoUrl || urlLogoReciboTermico(null));
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Relatorio</title>
<style>${cssReciboTermico(mm, cols)}</style>
</head>
<body>${body}</body>
</html>`;
}

/** Imprime linhas prontas no navegador (relatório — não usa layout de recibo). */
export function imprimirLinhasReciboTermico(
  linhas: string[],
  cfg: ReciboTermicoConfig = loadReciboTermicoConfig(),
  logoUrl?: string,
): boolean {
  const html = gerarHtmlLinhasReciboTermico(linhas, cfg, logoUrl);
  const w = window.open('', '_blank', `width=${cfg.larguraMm === 58 ? 240 : 320},height=720`);
  if (!w) return false;

  w.document.open();
  w.document.write(html);
  w.document.close();

  let impresso = false;
  const disparar = () => {
    if (impresso) return;
    impresso = true;
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  };
  const agendar = () => window.setTimeout(disparar, 700);
  if (w.document.readyState === 'complete') agendar();
  else w.onload = agendar;
  return true;
}

async function imprimirLinhasRelatorioTermico(linhas: string[]): Promise<'bluetooth' | 'navegador' | 'pdf'> {
  const cfg = { ...loadReciboTermicoConfig(), ...RECIBO_COBRADOR_DEFAULTS };
  const { imprimirReciboModoConfigurado } = await import('./ImpressoraBluetoothService');
  return imprimirReciboModoConfigurado(
    linhas,
    { termico: () => imprimirLinhasReciboTermico(linhas, cfg) },
    { fallback: 'termico' },
  );
}

/** Relatório do período: sintético (resumo) ou analítico (detalhado); térmica ou PDF. */
export async function imprimirRelatorioCobradorPeriodo(
  opts: RelatorioCobradorPeriodoOpts,
): Promise<'bluetooth' | 'navegador' | 'pdf'> {
  const tipo = opts.tipo ?? 'sintetico';
  const modo = opts.modo ?? 'termica';

  if (modo === 'pdf') {
    const { montarPdfRelatorioCobradorPeriodo, nomeArquivoRelatorioCobradorPeriodo } = await import(
      './cobradorRelatorioPeriodoPdf',
    );
    const { abrirPdfNaJanelaReservada, abrirPdfParaImprimir, downloadPdfBlob } = await import('./printPdfBlob');
    const blob = montarPdfRelatorioCobradorPeriodo({
      tipo,
      empresaNome: opts.empresaNome,
      cobradorNome: opts.cobradorNome,
      caixaNome: opts.caixaNome,
      dataInicio: opts.dataInicio,
      dataFim: opts.dataFim,
      itens: opts.itens,
    });
    const nome = nomeArquivoRelatorioCobradorPeriodo(
      opts.cobradorNome,
      opts.dataInicio,
      opts.dataFim,
      tipo,
    );
    if (opts.janelaPdf) {
      await abrirPdfNaJanelaReservada(opts.janelaPdf, blob, nome, undefined, { baixarTambem: true });
    } else if (!(await abrirPdfParaImprimir(blob, nome, { baixarTambem: true }))) {
      await downloadPdfBlob(blob, nome);
    }
    return 'pdf';
  }

  const base = {
    empresaNome: opts.empresaNome,
    cobradorNome: opts.cobradorNome,
    caixaNome: opts.caixaNome,
    dataInicio: opts.dataInicio,
    dataFim: opts.dataFim,
    itens: opts.itens,
  };
  const linhas =
    tipo === 'analitico'
      ? gerarLinhasRelatorioAnaliticoCobradorPeriodo(base)
      : gerarLinhasResumoCobradorPeriodo(base);

  return imprimirLinhasRelatorioTermico(linhas);
}

/** @deprecated Use imprimirRelatorioCobradorPeriodo com tipo sintetico */
export async function imprimirResumoCobradorPeriodo(
  opts: Omit<RelatorioCobradorPeriodoOpts, 'tipo' | 'modo'>,
): Promise<'bluetooth' | 'navegador' | 'pdf'> {
  return imprimirRelatorioCobradorPeriodo({ ...opts, tipo: 'sintetico', modo: 'termica' });
}

export function gerarHtmlReciboTermico(
  data: ReciboTermicoData,
  cfg: ReciboTermicoConfig = loadReciboTermicoConfig(),
): string {
  const mm = cfg.larguraMm;
  const cols = charsPorLinha(mm);
  const linhas = gerarLinhasReciboTermico(data, cfg);
  const body = renderLinhasReciboHtml(linhas, data.logoUrl || urlLogoReciboTermico(null));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Recibo</title>
<style>${cssReciboTermico(mm, cols)}</style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function imprimirReciboTermico(
  data: ReciboTermicoData,
  cfg: ReciboTermicoConfig = loadReciboTermicoConfig(),
): boolean {
  const html = gerarHtmlReciboTermico(data, cfg);
  const w = window.open('', '_blank', `width=${cfg.larguraMm === 58 ? 240 : 320},height=720`);
  if (!w) return false;

  w.document.open();
  w.document.write(html);
  w.document.close();

  let impresso = false;
  const disparar = () => {
    if (impresso) return;
    impresso = true;
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  };

  const agendar = () => window.setTimeout(disparar, 700);
  if (w.document.readyState === 'complete') {
    agendar();
  } else {
    w.onload = agendar;
  }
  return true;
}

export async function imprimirReciboTermicoBaixa(
  input: Parameters<typeof montarReciboTermicoBaixa>[0],
  cfg: ReciboTermicoConfig = loadReciboTermicoConfigFinanceiro(),
): Promise<boolean> {
  const data = await montarReciboTermicoBaixa(input);
  return imprimirReciboTermico(data, cfg);
}

export function reciboTermicoParaPdf(
  data: ReciboTermicoData,
  extras?: { numero?: string; vencimento?: string },
): ReciboData {
  return {
    numero: extras?.numero || data.contratoCodigo || data.clienteCodigo,
    data: data.dataHora.split(',')[0]?.trim() || data.dataHora,
    clienteNome: data.clienteNome,
    valor: data.totalCentavos / 100,
    referencia: data.parcelas.map((p) => p.label).join(' · ') || 'Recebimento de mensalidade',
    descricao: 'Recebimento de cobranca em rota',
    vencimento: extras?.vencimento || '—',
    empresaNome: data.empresaNome,
    empresaCnpj: data.empresaCnpj,
    contratoCodigo: data.contratoCodigo,
    planoNome: data.planoNome,
    dataPagamento: new Date().toLocaleDateString('pt-BR'),
    atendenteNome: data.atendente,
    formaPagamento: data.formaPagamento,
    parcelasDetalhes: data.parcelas.map((p, i) => ({
      numero: i + 1,
      vencimento: extras?.vencimento || '—',
      mesReferencia: p.label,
      valor: p.valorCentavos / 100,
      descricao: p.label,
    })),
  };
}

export async function imprimirReciboTermicoInteligente(
  data: ReciboTermicoData,
  cfg: ReciboTermicoConfig = loadReciboTermicoConfig(),
  opts?: { fallback?: 'pdf' | 'termico' | 'nenhum' },
): Promise<'bluetooth' | 'navegador' | 'pdf'> {
  const { imprimirReciboModoConfigurado } = await import('./ImpressoraBluetoothService');
  const linhas = gerarLinhasReciboTermico(data, cfg);
  return imprimirReciboModoConfigurado(
    linhas,
    {
      termico: () => imprimirReciboTermico(data, cfg),
      pdf: async () => {
        await generateReciboPDF(reciboTermicoParaPdf(data));
      },
    },
    { ...opts, logoUrl: data.logoUrl },
  );
}

/** Cobrador em campo: escolhe PDF (A5) ou recibo térmico 58 mm. */
export async function imprimirReciboBaixaCobrador(
  input: Parameters<typeof montarReciboTermicoBaixa>[0] & {
    parcelaCodigo?: string;
    dataVencimento?: string;
    janelaPdf?: Window | null;
    modo: ModoReciboBaixaCobrador;
  },
): Promise<'bluetooth' | 'pdf' | 'navegador'> {
  const data = await montarReciboTermicoBaixa(input);
  const venc =
    input.dataVencimento
      ? new Date(`${input.dataVencimento.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')
      : undefined;
  const { loadReciboTermicoConfigCobrador } = await import('./reciboTermicoConfig');
  const cfg = loadReciboTermicoConfigCobrador();
  const linhas = gerarLinhasReciboTermico(data, cfg);

  const imprimirPdf = async (): Promise<'pdf'> => {
    const baixarTambem = input.modo === 'pdf' || Boolean(input.janelaPdf);
    await generateReciboPDF(
      reciboTermicoParaPdf(data, { numero: input.parcelaCodigo, vencimento: venc }),
      'newtab',
      input.janelaPdf,
      { baixarTambem },
    );
    return 'pdf';
  };
  const imprimirPdfCb = async (): Promise<void> => {
    await imprimirPdf();
  };

  if (input.modo === 'pdf') {
    return imprimirPdf();
  }

  const { impressoraCobradorUsaNavegador, impressoraEhBleSalva, imprimirReciboModoConfigurado } =
    await import('./ImpressoraBluetoothService');
  const { isNavegadorMobile } = await import('./printPdfBlob');

  const fallbackPdf = async (): Promise<'pdf'> => {
    if (input.janelaPdf) return imprimirPdf();
    if (isNavegadorMobile()) return imprimirPdf();
    throw new Error('Permita pop-ups do navegador ou escolha o modo PDF para o recibo.');
  };

  if (impressoraEhBleSalva(cfg.impressoraBluetooth?.id)) {
    try {
      return await imprimirReciboModoConfigurado(
        linhas,
        {
          termico: () => imprimirReciboTermico(data, cfg),
          pdf: imprimirPdfCb,
        },
        { fallback: input.janelaPdf || isNavegadorMobile() ? 'pdf' : 'nenhum', logoUrl: data.logoUrl },
      );
    } catch {
      return fallbackPdf();
    }
  }

  if (impressoraCobradorUsaNavegador(cfg)) {
    const ok = imprimirReciboTermico(data, cfg);
    if (!ok) {
      return fallbackPdf();
    }
    return 'navegador';
  }

  try {
    return await imprimirReciboModoConfigurado(
      linhas,
      {
        termico: () => imprimirReciboTermico(data, cfg),
        pdf: imprimirPdfCb,
      },
      { fallback: input.janelaPdf || isNavegadorMobile() ? 'pdf' : 'nenhum', logoUrl: data.logoUrl },
    );
  } catch {
    return fallbackPdf();
  }
}

export async function imprimirReciboTermicoBaixaInteligente(
  input: Parameters<typeof montarReciboTermicoBaixa>[0],
): Promise<'bluetooth' | 'navegador' | 'pdf'> {
  const data = await montarReciboTermicoBaixa(input);
  return imprimirReciboTermicoInteligente(data, loadReciboTermicoConfigFinanceiro());
}

const FORMA_PGTO_LABEL: Record<string, string> = {
  dinheiro: 'DINHEIRO',
  pix: 'PIX',
  cartao: 'CARTAO',
  cartao_credito: 'CARTAO CREDITO',
  cartao_debito: 'CARTAO DEBITO',
  credito: 'CARTAO CREDITO',
  debito: 'CARTAO DEBITO',
};

export function labelFormaPagamentoRecibo(forma?: string): string | undefined {
  if (!forma) return undefined;
  const k = forma.toLowerCase().replace(/\s+/g, '_');
  return FORMA_PGTO_LABEL[k] || forma.toUpperCase();
}
