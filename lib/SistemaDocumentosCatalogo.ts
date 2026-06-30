import { generateReciboPDF, ReciboData, valorPorExtenso } from './ReciboService';
import { buildPropostaPdfBlob, PropostaDocumentoData } from './PropostaDocumentoService';
import { gerarOrdemServicoAtendimentoPdf } from './AtendimentoOrdemServicoPdf';
import { getDocumentosAtendimento, AtendimentoResumoDoc } from './AtendimentoDocumentos';
import {
  buildOrdemServicoMockBlob,
  buildReciboAtendimentoMockBlob,
  generateMockContratoFenix,
  generateMockContratoOnix
} from './SistemaDocumentosMock';
import { gerarContratoPdfPorAtendimento } from './contratoAtendimentoService';
import { supabase } from './supabase';

export type RequerSelecao = null | 'atendimento';

export interface PdfSistemaItem {
  id: string;
  titulo: string;
  descricao: string;
  modulo: string;
  badge: 'mock' | 'real';
  requerSelecao: RequerSelecao;
  /** Geração com dados de exemplo para visualização rápida do layout. */
  gerarMock?: () => Promise<{ blob: Blob; filename: string }>;
  /** Geração com dados reais a partir do id de um registro. */
  gerarReal?: (registroId: string) => Promise<{ blob: Blob; filename: string } | null>;
}

// ───────────────────────── Mocks de exemplo ─────────────────────────
const reciboMock = async (): Promise<{ blob: Blob; filename: string }> => {
  const valor = 199.9;
  const data: ReciboData = {
    numero: 'PRÉVIA-001',
    data: new Date().toLocaleDateString('pt-BR'),
    clienteNome: 'João da Silva (exemplo)',
    valor,
    valorExtenso: valorPorExtenso(valor),
    referencia: 'Mensalidade do plano Família Premium',
    descricao: 'Mensalidade abril/2026 - Plano Família Premium',
    vencimento: new Date().toLocaleDateString('pt-BR'),
  };
  const r = await generateReciboPDF(data, 'blob');
  if (!r) throw new Error('Falha ao gerar recibo de exemplo.');
  return r;
};

const propostaMock = async (): Promise<{ blob: Blob; filename: string }> => {
  const dataMock: PropostaDocumentoData = {
    numero: 'PRÉVIA',
    dataPedido: new Date().toISOString(),
    empresaNome: 'Funerária Exemplo Ltda',
    empresaCnpj: '03617822200095',
    vendedorNome: 'Maria Vendedora (exemplo)',
    vendedorDocumento: '(62) 99999-0000',
    contribuinteNome: 'João Cliente (exemplo)',
    contribuinteDocumento: '123.456.789-00',
    contribuinteTelefone: '(62) 98888-1111',
    contribuinteEmail: 'joao.exemplo@email.com',
    contribuinteEndereco: 'Rua das Flores 123, Setor Central, Goiânia - GO, CEP 74000-000',
    enderecoLogradouro: 'Rua das Flores',
    enderecoNumero: '123',
    enderecoBairro: 'Setor Central',
    enderecoCidade: 'Goiânia',
    enderecoUf: 'GO',
    enderecoCep: '74000000',
    planoNome: 'Plano Família Premium',
    valorAdesaoCentavos: 19990,
    primeiroVencimento: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    metodoCobranca: 'boleto',
    cobrancaConfirmada: true,
    statusProposta: 'rascunho',
    parcelasRecebidasQuantidade: 0,
    parcelasRecebidasTotalCentavos: 0,
    dependentesResumo: ['Maria Esposa', 'Pedro Filho'],
    observacoes:
      'Esta é uma prévia ilustrativa do layout da proposta. Os dados aqui exibidos são fictícios e servem apenas para conferência visual.',
  };
  const blob = await buildPropostaPdfBlob(dataMock);
  return { blob, filename: 'Proposta-Previa.pdf' };
};

// ───────────────────────── Real (atendimento) ─────────────────────────
const ordemServicoReal = async (atendimentoId: string) => {
  return gerarOrdemServicoAtendimentoPdf(atendimentoId, { download: false });
};

const reciboAtendimentoReal = async (atendimentoId: string) => {
  const itens = getDocumentosAtendimento({ id: atendimentoId, valor_pago_centavos: 1 } as AtendimentoResumoDoc);
  const rec = itens.find((d) => d.id === 'recibo-pagamento');
  return rec ? rec.gerar() : null;
};

const contratoFenixReal = async (atendimentoId: string) =>
  gerarContratoPdfPorAtendimento(atendimentoId, 'fenix');

const contratoOnixReal = async (atendimentoId: string) =>
  gerarContratoPdfPorAtendimento(atendimentoId, 'onix');

// ───────────────────────── Seletor de atendimento ─────────────────────────
export interface AtendimentoSelectItem {
  id: string;
  codigo: string;
  cliente_nome: string;
  data_servico: string;
  status: string;
  tipo_atendimento: string;
}

export async function listarAtendimentosParaSelecao(empresaId: string, busca: string = ''): Promise<AtendimentoSelectItem[]> {
  if (!empresaId) return [];
  let query = supabase
    .from('ser_atendimentos')
    .select('id, codigo, data_servico, status, tipo_atendimento, clientes:cliente_id ( nome )')
    .eq('empresa_id', empresaId)
    .order('data_servico', { ascending: false })
    .limit(40);

  if (busca && busca.trim()) {
    query = query.ilike('codigo', `%${busca.trim()}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[SistemaDocumentos] listarAtendimentos:', error);
    return [];
  }
  return (data || []).map((a: any) => ({
    id: a.id,
    codigo: a.codigo,
    cliente_nome: a.clientes?.nome || 'Cliente',
    data_servico: a.data_servico,
    status: a.status,
    tipo_atendimento: a.tipo_atendimento,
  }));
}

// ───────────────────────── Catálogo público ─────────────────────────
export function getCatalogoSistemaPDFs(): PdfSistemaItem[] {
  return [
    {
      id: 'recibo-mensalidade',
      titulo: 'Recibo de Mensalidade',
      descricao: 'Comprovante de pagamento de mensalidade gerado a partir de baixas no Financeiro.',
      modulo: 'Financeiro',
      badge: 'mock',
      requerSelecao: null,
      gerarMock: reciboMock,
    },
    {
      id: 'proposta-venda',
      titulo: 'Proposta de Venda',
      descricao: 'Documento da proposta de plano com dados do titular, plano, dependentes e cobrança.',
      modulo: 'Comercial',
      badge: 'mock',
      requerSelecao: null,
      gerarMock: propostaMock,
    },
    {
      id: 'os-atendimento',
      titulo: 'Ordem de Serviço (OS) Completa',
      descricao:
        'Documento único com OS, Autorização Técnica e folha de controle de deslocamentos vinculados à frota.',
      modulo: 'Atendimentos',
      badge: 'mock',
      requerSelecao: 'atendimento',
      gerarMock: async () => buildOrdemServicoMockBlob(),
      gerarReal: ordemServicoReal,
    },
    {
      id: 'recibo-atendimento',
      titulo: 'Recibo de Pagamento (Atendimento)',
      descricao: 'Comprovante das formas de pagamento informadas no fechamento do atendimento.',
      modulo: 'Atendimentos',
      badge: 'mock',
      requerSelecao: 'atendimento',
      gerarMock: async () => buildReciboAtendimentoMockBlob(),
      gerarReal: reciboAtendimentoReal,
    },
    {
      id: 'contrato-fenix',
      titulo: 'Contrato Plano Fênix',
      descricao: 'Contrato completo de administração de plano familiar Fênix com cláusulas de assistência funerária.',
      modulo: 'Comercial / Contratos',
      badge: 'real',
      requerSelecao: 'atendimento',
      gerarMock: async () => ({ blob: await generateMockContratoFenix(), filename: 'Contrato-Fenix-Previa.pdf' }),
      gerarReal: contratoFenixReal,
    },
    {
      id: 'contrato-onix',
      titulo: 'Contrato Plano Onix',
      descricao: 'Contrato completo de assistência funerária - Plano Onix com cláusulas específicas.',
      modulo: 'Comercial / Contratos',
      badge: 'real',
      requerSelecao: 'atendimento',
      gerarMock: async () => ({ blob: await generateMockContratoOnix(), filename: 'Contrato-Onix-Previa.pdf' }),
      gerarReal: contratoOnixReal,
    },
  ];
}
