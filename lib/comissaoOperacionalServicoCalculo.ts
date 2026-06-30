import type { CargoComissaoOperacional, RegraComissao } from './comissaoCalculo';
import { calcularComissaoCumulativa, resolverRegraOperacionalOS } from './comissaoCalculo';
import type { ComissaoConfigPadrao, AtendimentoComissaoDto, ColaboradorResumoDto, OperacionalPlanoComissaoDto } from './comissaoAtendenteService';
import type { ComissaoOperacionalServicoDto, ModoCalculoComissao } from './comissaoOperacionalServico';

export interface ItemAtendimentoComissao {
  nome: string;
  quantidade: number;
}

export interface ContextoComissaoAtendimento {
  tipo_atendimento: 'particular' | 'plano';
  valor_total_centavos: number;
  plano_nome: string | null;
  formulario_preparacao: string;
  orientacoes_tecnicas: string;
  observacoes_corpo: string;
  itens: ItemAtendimentoComissao[];
}

export interface DetalheComissaoServico {
  codigo: string;
  nome: string;
  valor_centavos: number;
  detectado: boolean;
}

export interface ResultadoComissaoPorServico {
  total_centavos: number;
  detalhes: DetalheComissaoServico[];
}

function normalizarTexto(txt: string): string {
  return (txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function textoCompleto(ctx: ContextoComissaoAtendimento): string {
  const partes = [
    ctx.formulario_preparacao,
    ctx.orientacoes_tecnicas,
    ctx.observacoes_corpo,
    ctx.plano_nome || '',
    ...ctx.itens.map((i) => i.nome),
  ];
  return normalizarTexto(partes.join(' '));
}

function contemPalavraChave(texto: string, palavras: string[]): boolean {
  if (palavras.length === 0) return false;
  return palavras.some((p) => {
    const chave = normalizarTexto(p);
    if (!chave) return false;
    return texto.includes(chave);
  });
}

/** Nomes comuns do catálogo → código de comissão (complementa palavras_chave). */
const MAPEAMENTO_NOME_ITEM: Record<string, string[]> = {
  tanato: ['tanatopraxia', 'embalsamamento', 'embalsam'],
  sala: ['sala de velorio', 'sala de velório', 'sala velorio'],
  cortejo: ['cortejo para cemiterio', 'cortejo para cemitério', 'cortejo'],
  retirada: ['remocao hospital', 'remoção hospital', 'remocao residencia', 'remoção residência', 'retirada', 'remocao', 'remoção'],
  roupa: ['terno simples', 'terno completo', 'roupa feminina', 'vestimenta', 'vestir'],
  fenix: ['plano fenix', 'plano fênix', 'preparacao fenix', 'preparação fênix', 'urna plano fenix', 'urna plano fênix'],
  onix: ['plano onix', 'plano ônix', 'preparacao onix', 'preparação ônix', 'urna plano onix', 'urna plano ônix'],
};

function itemCombinaCodigo(nomeItem: string, codigo: string, palavrasChave: string[]): boolean {
  const norm = normalizarTexto(nomeItem);
  if (!norm) return false;

  if (contemPalavraChave(norm, palavrasChave)) return true;

  const aliases = MAPEAMENTO_NOME_ITEM[codigo] || [];
  return aliases.some((alias) => {
    const a = normalizarTexto(alias);
    return norm.includes(a) || a.includes(norm);
  });
}

function detectaServicoNosItens(
  servico: ComissaoOperacionalServicoDto,
  ctx: ContextoComissaoAtendimento,
): boolean {
  return ctx.itens.some((item) =>
    itemCombinaCodigo(item.nome, servico.codigo.toLowerCase(), servico.palavras_chave),
  );
}

function detectaServico(
  servico: ComissaoOperacionalServicoDto,
  ctx: ContextoComissaoAtendimento,
  texto: string,
): boolean {
  if (!servico.ativo) return false;

  const codigo = servico.codigo.toLowerCase();

  if (codigo === 'particular') {
    return ctx.tipo_atendimento === 'particular';
  }

  // Prioridade: itens lançados na OS
  if (detectaServicoNosItens(servico, ctx)) return true;

  if (codigo === 'fenix') {
    if (ctx.plano_nome && /fenix|fênix/i.test(ctx.plano_nome)) return true;
    return contemPalavraChave(texto, servico.palavras_chave);
  }

  if (codigo === 'onix') {
    if (ctx.plano_nome && /onix|ônix/i.test(ctx.plano_nome)) return true;
    return contemPalavraChave(texto, servico.palavras_chave);
  }

  return contemPalavraChave(texto, servico.palavras_chave);
}

function valorServicoDetectado(
  servico: ComissaoOperacionalServicoDto,
  ctx: ContextoComissaoAtendimento,
): number {
  if (servico.tipo_calculo === 'percentual') {
    const base = Math.max(0, ctx.valor_total_centavos);
    return Math.round(base * (Math.max(0, servico.percentual) / 100));
  }
  return Math.max(0, servico.valor_fixo_centavos);
}

/** Evita pagar Fênix e Ônix na mesma OS — mantém o detectado pelo plano ou o primeiro encontrado. */
function resolverExclusivosFenixOnix(
  detalhes: DetalheComissaoServico[],
  ctx: ContextoComissaoAtendimento,
): DetalheComissaoServico[] {
  const fenix = detalhes.find((d) => d.codigo === 'fenix' && d.detectado);
  const onix = detalhes.find((d) => d.codigo === 'onix' && d.detectado);
  if (!fenix || !onix) return detalhes;

  const plano = (ctx.plano_nome || '').toLowerCase();
  const prefereFenix = /fenix|fênix/.test(plano);
  const prefereOnix = /onix|ônix/.test(plano);

  return detalhes.map((d) => {
    if (d.codigo === 'fenix' && prefereOnix && !prefereFenix) {
      return { ...d, detectado: false, valor_centavos: 0 };
    }
    if (d.codigo === 'onix' && prefereFenix && !prefereOnix) {
      return { ...d, detectado: false, valor_centavos: 0 };
    }
    // Sem plano definido: mantém Fênix (maior valor) como fallback conservador
    if (!prefereFenix && !prefereOnix) {
      if (d.codigo === 'onix') return { ...d, detectado: false, valor_centavos: 0 };
    }
    return d;
  });
}

export function calcularComissaoPorServicos(
  servicos: ComissaoOperacionalServicoDto[],
  ctx: ContextoComissaoAtendimento,
): ResultadoComissaoPorServico {
  const texto = textoCompleto(ctx);

  let detalhes: DetalheComissaoServico[] = servicos
    .filter((s) => s.ativo)
    .map((servico) => {
      const detectado = detectaServico(servico, ctx, texto);
      return {
        codigo: servico.codigo,
        nome: servico.nome,
        detectado,
        valor_centavos: detectado ? valorServicoDetectado(servico, ctx) : 0,
      };
    });

  detalhes = resolverExclusivosFenixOnix(detalhes, ctx);

  const total_centavos = detalhes.reduce((acc, d) => acc + d.valor_centavos, 0);
  return { total_centavos, detalhes };
}

export function calcularComissaoOperacionalOS(
  modo: ModoCalculoComissao,
  cargo: CargoComissaoOperacional,
  ctx: ContextoComissaoAtendimento,
  regraPercentualOs: RegraComissao,
  servicosConfig: ComissaoOperacionalServicoDto[],
  empresaId?: string,
): ResultadoComissaoPorServico {
  if (modo === 'percentual_os') {
    const total = calcularComissaoCumulativa(ctx.valor_total_centavos, regraPercentualOs);
    return {
      total_centavos: total,
      detalhes: [
        {
          codigo: 'percentual_os',
          nome: 'Comissão sobre faturamento da OS',
          detectado: total > 0,
          valor_centavos: total,
        },
      ],
    };
  }

  let doCargo = servicosConfig.filter((s) => s.cargo === cargo && s.ativo);
  if (empresaId) {
    doCargo = doCargo.filter((s) => s.empresa_id === empresaId);
  }
  // Um registro por código (evita duplicar quando há várias empresas no filtro)
  const porCodigo = new Map<string, ComissaoOperacionalServicoDto>();
  doCargo.forEach((s) => {
    if (!porCodigo.has(s.codigo)) porCodigo.set(s.codigo, s);
  });

  return calcularComissaoPorServicos([...porCodigo.values()], ctx);
}

export function contextoFromAtendimentoComissao(atd: {
  tipo_atendimento?: string | null;
  valor_total_centavos: number;
  plano_nome?: string | null;
  formulario_preparacao?: string | null;
  orientacoes_tecnicas?: string | null;
  observacoes_corpo?: string | null;
  itens_servicos?: ItemAtendimentoComissao[];
  itens_produtos?: ItemAtendimentoComissao[];
}): ContextoComissaoAtendimento {
  const tipo = atd.tipo_atendimento === 'plano' ? 'plano' : 'particular';
  const itens = [...(atd.itens_servicos || []), ...(atd.itens_produtos || [])];
  return {
    tipo_atendimento: tipo,
    valor_total_centavos: Number(atd.valor_total_centavos || 0),
    plano_nome: atd.plano_nome ?? null,
    formulario_preparacao: atd.formulario_preparacao || '',
    orientacoes_tecnicas: atd.orientacoes_tecnicas || '',
    observacoes_corpo: atd.observacoes_corpo || '',
    itens,
  };
}

function planoComissaoFromAtendimento(atd: AtendimentoComissaoDto) {
  return {
    comissao_agente_percentual: atd.plano_comissao_agente_percentual,
    comissao_agente_fixo_centavos: atd.plano_comissao_agente_fixo_centavos,
    comissao_atendente_percentual: atd.plano_comissao_atendente_percentual,
    comissao_atendente_fixo_centavos: atd.plano_comissao_atendente_fixo_centavos,
  };
}

export function modoCalculoCargo(
  configs: ComissaoConfigPadrao[],
  empresaId: string,
  cargo: CargoComissaoOperacional,
): ModoCalculoComissao {
  const conf = configs.find((c) => c.empresa_id === empresaId && c.cargo === cargo);
  return conf?.modo_calculo || 'por_servico';
}

export function calcularComissaoAtendimentoOperacional(params: {
  atd: AtendimentoComissaoDto;
  colab: ColaboradorResumoDto;
  cargo: CargoComissaoOperacional;
  configs: ComissaoConfigPadrao[];
  servicosConfig: ComissaoOperacionalServicoDto[];
  empresaId: string;
  padraoAt: RegraComissao;
  padraoAg: RegraComissao;
  override?: OperacionalPlanoComissaoDto | null;
}): ResultadoComissaoPorServico {
  const { atd, colab, cargo, configs, servicosConfig, empresaId, padraoAt, padraoAg, override } = params;
  const padrao = cargo === 'atendente' ? padraoAt : padraoAg;
  const regra = resolverRegraOperacionalOS(
    colab,
    padrao,
    cargo,
    planoComissaoFromAtendimento(atd),
    override,
  );
  const modo = modoCalculoCargo(configs, atd.empresa_id || empresaId, cargo);
  const ctx = contextoFromAtendimentoComissao(atd);
  return calcularComissaoOperacionalOS(modo, cargo, ctx, regra, servicosConfig, atd.empresa_id || empresaId);
}
