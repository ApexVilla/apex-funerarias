import jsPDF from 'jspdf';
import {
  aplicarNumeracaoPaginasContratoPdf,
  criarFluxoTextoContrato,
  drawContratoAnexoDependentes,
  drawContratoCabecalhoInfoBox,
  drawContratoRolDependentes,
  normalizarDependentesContrato,
} from './contratoDependentesPdfLayout';
import { drawCapaContratoFenix } from './fenixLogo';
import type { ContratoFenixData } from './ContratoFenixService';
import {
  alturaRodapeAssinaturasContrato,
  drawRodapeAssinaturasContrato,
} from './contratoAssinaturaDigitalPdf';
import { empresaJuridicaOuPadrao } from './contratoEmpresaJuridica';

export type ContratoCatalaoPadraoData = ContratoFenixData;

const LINHA_FILIAIS =
  'Filiais: Anápolis (62)3321-4649 / Aparecida de Goiânia (62)3283-0101 / Bela Vista (62)3551-4158 / Caldas Novas (64)3453-7140 / Catalão (64)3441-4747 / Itaçu (62)3378-1539 / Itumbiara (64)3431-5765 / Nerópolis (62)3513-2066 / Silvânia (62)3332-2456';

export const buildContratoCatalaoPadraoPdfBlob = async (
  data: ContratoCatalaoPadraoData,
): Promise<Blob> => {
  const jur = empresaJuridicaOuPadrao(data.empresaJuridica);
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = W - margin * 2;
  const fluxo = criarFluxoTextoContrato(doc, W, H);
  let y = fluxo.y;

  y = await drawCapaContratoFenix(doc, W, y, {
    linhaEmpresa: 'FÉNIX SERVIÇOS PÓSTUMOS LTDA',
    linhaSubtitulo: 'Convênios - Saúde - Póstumos',
    linhaTitulo: 'CERTIFICADO DE ADESÃO TERMOS E CONDIÇÕES',
    linhaCertificado:
      'SÉRIE ÚNICA - DPDC - Certificado de Autorização nº 07/001/98 - MINISTÉRIO DA JUSTIÇA',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Matriz: Rua 5 nº 576 - Centro - Fone: (62) 3224-8686 - Goiânia - GO', W / 2, y, {
    align: 'center',
    maxWidth: W - 24,
  });
  y += 4;
  doc.text(LINHA_FILIAIS, W / 2, y, { align: 'center', maxWidth: W - 20 });
  y += 6;
  doc.text(`CNPJ: ${jur.cnpjFormatado}`, W / 2, y, { align: 'center' });
  y += 8;

  const { boxBottomY } = drawContratoCabecalhoInfoBox(doc, {
    boxTopY: y,
    margin,
    contentWidth,
    pageWidth: W,
    numeroContrato: data.numeroContrato,
    titularNome: data.titularNome,
    titularEndereco: data.titularEndereco,
    vendedorNome: data.vendedorNome,
    nomePlano: data.nomePlano || 'CATÁLÃO PADRÃO',
    dataContrato: data.dataContrato,
  });
  fluxo.y = boxBottomY + 4;

  fluxo.addText(jur.clausulaIntroCatalaoPadrao);

  fluxo.addTitle('CLÁUSULA 1ª - FINALIDADE');
  fluxo.addText(
    'A Fênix Funerária LTDA tem por finalidade a prestação de serviços funerários e intermediação de serviços assistenciais via proposta de adesão espontânea, em conformidade com o Art. 54 da Lei nº 8.078/1990 (CDC).',
  );

  fluxo.addTitle('CLÁUSULA 2ª - DEFINIÇÕES');
  fluxo.addText(
    'Adesão, Administradora, Associado, Atendimento, Beneficiários, Benefício, Cancelamento, Carência, Certificado, Cônjuge, Dependente, Desistência, Extinção, Inadimplência, Intermediação, Multa, Planilha, Rescisão, Taxa e Titular — nos termos do contrato registrado.',
  );

  fluxo.addTitle('CLÁUSULA 3ª - TITULAR E BENEFICIÁRIOS');
  fluxo.addText(
    'A Funerária Fênix LTDA obriga-se a prestar ao titular e beneficiários nominalmente inscritos os serviços previstos neste contrato. Parágrafo 1º: facultado designar mais beneficiários, até o limite de 6 (seis). Parágrafos 2º a 4º: inclusão de cônjuge, filhos e substituição conforme perfil aceito e carência (Cláusula 6ª).',
  );

  fluxo.addTitle('CLÁUSULA 4ª - OBJETO');
  fluxo.addText('1 - Atendimento Funeral:');
  fluxo.addText(
    '1.1 Urna mortuária padrão FÉNIX, envernizada, interior forrado; 1.2 Higienização simples; 1.3 Sala de velório; 1.4 Flores naturais para ornamentação da urna; 1.5 Veículo especial para remoção; 1.6 Veículo especial para sepultamento; 1.7 01 (um) véu; 1.8 02 (duas) velas; 1.9 Kit Lanche (1 kg café, 2 kg açúcar, 5 pacotes biscoitos, 1 L leite, 1 L suco, 100 g chá, 100 copos café, 100 copos água); 1.10 01 livro de presença; 1.11 Cessão e montagem de paramentos (01 banner FÉNIX, 02 cavaletes, 02 castiçais, luminosos de luto) conforme credo religioso; 1.12 05 anúncios em rádio FM; 1.13 Translado para todo o estado de Goiás + 120 km após a fronteira.',
  );
  fluxo.addText('2 - Indução de Benefícios por Intermediação:');
  fluxo.addText(
    'A Administradora atuará como indutora em convênios com prestadores e fornecedores, preferencialmente nas áreas médicas, odontológicas e bem-estar, objetivando descontos e vantagens. Isenta de responder por litígios entre associado e prestadores. Parágrafos 1º e 2º: cadastro atualizado de prestadores; não utilização não gera crédito ou restituição.',
  );
  fluxo.addText('3 - Oferta de empréstimo:');
  fluxo.addText(
    'Empréstimo de cadeira de rodas, par de muletas, andador ou cadeira para banho ao associado em dia com a mensalidade e que comprove não ter condições financeiras, por 03 meses, renovável por mais 03 ou conforme necessidade.',
  );

  fluxo.addTitle('CLÁUSULA 5ª - DURAÇÃO');
  fluxo.addText('Prazo indeterminado, com medidas preventivas para resguardar o interesse dos associados.');

  fluxo.addTitle('CLÁUSULA 6ª - DO PERÍODO DE CARÊNCIA');
  fluxo.addText(
    'Direito aos benefícios da Cláusula 4ª após 90 (noventa) dias da assinatura e aceitação da adesão. Parágrafo 1º: durante a carência, desconto de 50% nos serviços da Cláusula 4ª. Parágrafo 2º: inclusão ou substituição de beneficiário — carência de 90 dias; na carência, 50% de desconto; ao substituído cessam os compromissos.',
  );

  fluxo.addTitle('CLÁUSULA 7ª - DA ADESÃO');
  fluxo.addText('Adesão espontânea ao programa FÉNIX SERVIÇOS PÓSTUMOS mediante proposta com titular e beneficiários.');

  fluxo.addTitle('CLÁUSULA 8ª - DA RESCISÃO');
  fluxo.addText(
    'Rescisão consensual em caso de inviabilidade operativa; não cabe devolução pelo período em que os pagamentos mantiveram os direitos assegurados.',
  );

  fluxo.addTitle('CLÁUSULA 9ª - ÁREA OPERACIONAL');
  fluxo.addText(
    'Serviços pela FÉNIX FUNERÁRIA LTDA nas regiões definidas pela Administradora. Parágrafo 1º: fora do raio contratual, titular arca com despesas e reembolso até R$ 1.317,00 em 30 dias após sepultamento. Parágrafo 2º: sem reembolso se óbito em área de cobertura e associado optar por outro prestador.',
  );

  fluxo.addTitle('CLÁUSULA 10ª - TRANSLADO');
  fluxo.addText(
    'Fora da área operacional, despesas excedentes de rodagem acima do limite da Cláusula 4ª, conforme preços à época do óbito.',
  );

  fluxo.addTitle('CLÁUSULA 11ª - DA SOLICITAÇÃO DE BENEFÍCIOS');
  fluxo.addText('Titular em regularidade com parcelas e demais obrigações.');

  fluxo.addTitle('CLÁUSULA 12ª - DA INADIMPLÊNCIA');
  fluxo.addText(
    'Atraso superior a 90 dias configura desistência e caducidade dos benefícios (atinge titular e beneficiários).',
  );

  fluxo.addTitle('CLÁUSULAS 13ª a 15ª');
  fluxo.addText(
    '13ª Sucessão do titular; 14ª Continuidade pelos herdeiros; 15ª Isenção temporária após 250 parcelas pagas sem uso dos serviços (conforme regulamento).',
  );

  fluxo.addTitle('CLÁUSULA 16ª - OBRIGAÇÕES DO TITULAR');
  fluxo.addText(
    'Pagamento pontual; informações verídicas; documentação; cadastro atualizado; tratamento respeitoso; colaboração operacional. Parágrafos: quitação de parcelas em atraso no óbito; até 3 meses de atraso com acréscimos; após 3 meses sem atendimento até nova carência; cancelamento por declarações inexatas; despesas só com autorização escrita.',
  );

  fluxo.addTitle('CLÁUSULA 18ª - OBRIGAÇÕES DA ADMINISTRADORA');
  fluxo.addText('Fidelidade, zelo, ética, transparência e respeito aos associados.');

  fluxo.addTitle('CLÁUSULA 19ª - DO CONTRATO');
  fluxo.addText(
    'Contrato por tempo indeterminado desde a adesão. Parágrafos: herdeiros/beneficiários dispensados de carência exceto atraso > 3 meses; um atendimento por solicitação; comunicação imediata de óbito; excedente por serviço divergente; ficha de inscrição; suspensão em calamidade pública; intransferível salvo concordância; 02 vias assinadas.',
  );

  fluxo.addTitle('CLÁUSULA 20ª - SERVIÇOS NÃO INCLUSOS');
  fluxo.addText(
    'Urnas de luxo acima do padrão; vestuário; formolização; embalsamamento; reconstituição; cova ou carneiro.',
  );

  fluxo.addTitle('CLÁUSULAS 21ª a 24ª');
  fluxo.addText(
    '21ª Casos omissos à gerência; 22ª Ciência e acordo do titular; 23ª Registro cartorial (art. 136, III, CC/1916); 24ª Foro da comarca de Catalão-GO.',
  );

  fluxo.addTitle('ROL DE BENEFICIÁRIOS INSCRITOS');
  const listaDependentes = normalizarDependentesContrato(
    data.dependentesDetalhados,
    data.dependentes,
  );
  if (listaDependentes.length > 0) {
    fluxo.y = drawContratoRolDependentes(doc, {
      margin,
      contentWidth,
      y: fluxo.y,
      pageHeight: H,
      dependentes: listaDependentes,
    });
  } else {
    fluxo.addText('Beneficiários conforme ficha de inscrição anexa.', 8, 'justify');
  }

  fluxo.ensureSpace(alturaRodapeAssinaturasContrato(data.assinaturaDigital));
  y = await drawRodapeAssinaturasContrato(doc, {
    W,
    margin,
    yStart: fluxo.y + 4,
    titularNome: data.titularNome,
    nomeEmpresa: jur.nomeEmpresaRodape,
    assinaturaDigital: data.assinaturaDigital,
  });

  fluxo.y = y + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CERTIFICADO DE AUTORIZAÇÃO/MJ Nº 07/001/98', margin, fluxo.y);
  fluxo.y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  fluxo.addText(
    'De acordo com a Lei nº 5.768/71 e alterações. A pessoa jurídica identificada fica proibida de comercializar planos de prestação de serviços póstumos fora dos limites geográficos do município onde se encontra sediada.',
    7,
  );

  if (listaDependentes.length > 0) {
    await drawContratoAnexoDependentes(doc, {
      margin,
      W,
      H,
      numeroContrato: data.numeroContrato,
      titularNome: data.titularNome,
      titularCpf: data.titularCpf,
      dataContrato: data.dataContrato,
      planoNome: data.nomePlano || 'CATÁLÃO PADRÃO',
      dependentes: listaDependentes,
      subtituloPlano: 'Certificado de Adesão — Catálão Padrão',
      razaoSocial: jur.razaoSocial,
      cnpjFormatado: jur.cnpjFormatado,
    });
  }

  aplicarNumeracaoPaginasContratoPdf(doc, { numeroContrato: data.numeroContrato });
  return doc.output('blob');
};
