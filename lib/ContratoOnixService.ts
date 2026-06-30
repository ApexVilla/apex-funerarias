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
import {
  alturaRodapeAssinaturasContrato,
  drawRodapeAssinaturasContrato,
  type AssinaturaDigitalPdfInfo,
} from './contratoAssinaturaDigitalPdf';
import {
  empresaJuridicaOuPadrao,
} from './contratoEmpresaJuridica';
import type { ContratoFenixData } from './ContratoFenixService';

export type ContratoOnixData = ContratoFenixData;

export const buildContratoOnixPdfBlob = async (data: ContratoOnixData): Promise<Blob> => {
  const jur = empresaJuridicaOuPadrao(data.empresaJuridica);
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = W - (margin * 2);
  const fluxo = criarFluxoTextoContrato(doc, W, H);
  let y = fluxo.y;

  y = await drawCapaContratoFenix(doc, W, y, {
    linhaEmpresa: jur.linhaCapaEmpresa,
    linhaSubtitulo: 'Convênios - Saúde - Postumos',
    linhaTitulo:
      'CONTRATO DE ADMINISTRAÇÃO DE PLANO FAMILIAR PARA FUTURA ASSISTÊNCIA FUNERÁRIA',
    linhaCertificado: 'Certificado de Adesão Termos e Condições Onix',
  });

  const { boxBottomY } = drawContratoCabecalhoInfoBox(doc, {
    boxTopY: y,
    margin,
    contentWidth,
    pageWidth: W,
    numeroContrato: data.numeroContrato,
    titularNome: data.titularNome,
    titularEndereco: data.titularEndereco,
    vendedorNome: data.vendedorNome,
    nomePlano: data.nomePlano,
    dataContrato: data.dataContrato,
  });
  fluxo.y = boxBottomY + 5;

  // --- BODY TEXT ---
  fluxo.addText(jur.clausulaIntroFenixOnix);

  fluxo.addTitle('CLÁUSULA PRIMEIRA – OBJETO E DEPENDENTES');
  fluxo.addText('1. O objeto desse contrato é a administração, pela CONTRATADA, de plano para futura assistência funerária, que, por ela comercializado, garante a prestação futura dos serviços funerários abaixo especificados para o CONTRATANTE e seus dependentes, individualizados na Proposta Contratual, parte integrante e indissolúvel do presente contrato, desde que esteja adimplente com as obrigações financeiras e contratuais aqui previstas, comprove o óbito do beneficiário e faça a formal solicitação da prestação garantida.');
  fluxo.addText('1.1. A prestação futura dos serviços funerários aqui contratados consiste na garantia de que a CONTRATADA cumprirá as seguintes obrigações:');
  fluxo.addText('1.1.1. Fornecer uma urna mortuária produzida em madeira, modelo sextavado, com visor de vidro e sobre tampo e forração interna, interior forrado com babado e sobrebabado, alças do tipo varãozinho nas laterais, quatro chavetas para fixar à base; acabamento externo com fundo e verniz de alto brilho; com medidas entre 0,60m de largura, 1,90m de cumprimento e 0,50m de altura; para um corpo cujo peso não ultrapasse os 100 quilos.');
  fluxo.addText('1.1.2. Acomodar o corpo na urna mortuária e sua ornamentação interna com enfeite floral natural, podendo, na falta ou impossibilidade na aquisição das flores naturais ou a pedido da família, substitui-las por flores artificiais ou edredom, com colocação de tule de nylon para cobrir o corpo; um vestuário, uma coroa de flores.');
  fluxo.addText('1.1.3. Realizar a remoção, e cortejo viário, do corpo do velório para o sepultamento;');
  fluxo.addText('1.1.4. Realizar, caso necessário, um único traslado do corpo de uma localidade a outra, limitado a Unidade Federativa denominada Estado de Goiás;');
  fluxo.addText('1.1.5. Emprestar a paramentação (2 cavaletes e 1 esplendor) para montagem em velório;');
  fluxo.addText('1.1.6. Fornecer duas velas e um Kit com: 1 (um) quilo de pó de café moído, 2 (dois) quilos de açúcar, 1 (um) leite, 1 (um) suco, chá, biscoitos e 200 copos descartáveis;');
  fluxo.addText('1.1.7. Emprestar um luminoso para sinalização de velório;');
  fluxo.addText('1.1.8. Emprestar uma sala, sem ar condicionado, cama, sofá ou outro equipamento, para realização de velório (duração 12 horas), quando, e desde que, o sepultamento ocorra em cidades que a CONTRATADA tenha sede ou filial;');
  fluxo.addText('1.1.9. Pagar os impostos e tributos incidentes aos serviços e insumos dos subitens, deste item 1.1, desde que sejam prestados e executados na localidade definida na Proposta Contratual para sua realização.');
  fluxo.addText('1.1.10. Realizar, se necessário, serviços de somatoconservação do corpo, para realização de homenagens póstumas. Serviço este que somente será realizado na localidade definida na Proposta Contratual e com solicitação e autorização expressa do CONTRATANTE.');
  fluxo.addText('1.2. A empresa CONTRATADA não se obriga ou se compromete com qualquer outro serviço, atividade, empréstimo, entrega, pagamento que não esteja listado nos subitens do item anterior, mesmo que afetos ou referentes à atividade funerária.');
  fluxo.addText('1.2.1. Não estão inclusos na contratação do plano: o fornecimento de carneiras ou terreno em cemitério, a construção de jazigos ou gavetas para sepultamento, a locação de jazigos, de lóculos para sepultamento, cremação e cerimônias de cremação, serviço de necromaquiagem e reconstrução facial ou de membros, pagamento de taxas de sepultamento e/ou velório, pagamento de taxas de exumação, abertura de jazigo ou sepultura, locação de salas de velórios ou capelas para velório em localidades em que a empresa não tenha sede ou filial, fornecimento de zinco para urnas, fornecimento de urnas especiais ou de medidas diferentes da prevista no subitem 1.1.1, do item 1.1, dessa Cláusula Primeira.');
  fluxo.addText('1.3. Havendo necessidade ou interesse no acréscimo, troca ou substituição dos serviços, atividades e produtos listados nos subitens, do item 1.1, seja por qualquer motivo que não o de má qualidade, o CONTRATANTE, e /ou seus dependentes, ficam obrigados a pagar integralmente a diferença que vier ser apurada ou o valor do item que for acrescido, trocado ou substituído.');
  fluxo.addText('1.4. Todo e qualquer serviço extra, a mais ou a maior, que for solicitado, por qualquer motivo, será objeto de negociação e pagamento para a CONTRATADA.');
  fluxo.addText('1.5. Os valores dos serviços e itens listados nos subitens do item 1.1, dessa Cláusula, são os mesmos praticados na Tabela de Preço Funerário do Município sede indicado no contrato, e servirá também como parâmetro para o cálculo dos preços dos serviços extras, a mais ou maior, ou das diferenças devidas por acréscimos, trocas ou substituições, que forem solicitadas.');
  fluxo.addText('1.6. O CONTRATANTE e seus dependentes declaram estar cientes de que a presente contratação não contempla a compra ou aquisição de qualquer produto ou serviço, tendo plena consciência de estarem, mediante o pagamento de mensalidades, aderindo a um plano garantidor de futura assistência funerária, em uma data incerta, consistente na realização dos serviços e atividades listadas nos subitens do item 1.1, dessa Cláusula Primeira.');
  fluxo.addText('1.7. A extinção desse contrato por falta de pagamento das mensalidades ou a rescisão espontânea por parte do CONTRATANTE, não confere direito a pleitear reembolso ou devolução das mensalidades ou taxa de adesão que houver pago, pois tem consciência de que correspondem a contrapartida mensal pela garantia diária de execução, em benefício dele e de seus dependentes, dos serviços previstos nos subitens do item 1.1, dessa Cláusula Primeira.');

  fluxo.addTitle('CLÁUSULA SEGUNDA – DEPENDENTES');
  fluxo.addText('2. São dependentes do CONTRATANTE e beneficiários dessa contratação.');
  fluxo.addText('2.1.1. O cônjuge ou companheira; 2.1.2. Os filhos solteiros; 2.1.3. O pai e mãe e/ou o sogro e a sogra; 2.1.4. Os dependentes econômicos legalmente reconhecidos e comprovados.');
  const listaDependentes = normalizarDependentesContrato(data.dependentesDetalhados, data.dependentes);
  if (listaDependentes.length > 0) {
    fluxo.y = drawContratoRolDependentes(doc, {
      margin,
      contentWidth,
      y: fluxo.y,
      pageHeight: H,
      dependentes: listaDependentes,
    });
  } else {
    fluxo.addText('2.2. Não há dependentes beneficiários individualizados inscritos nesta data.', 8, 'justify');
  }


  fluxo.addTitle('CLÁUSULA TERCEIRA – OBRIGAÇÕES DA CONTRATADA');
  fluxo.addText('3. A CONTRATADA se obriga, na forma disposta na Lei nº 13.261/2016, a administrar o presente plano, receber as mensalidades e realizar, diretamente ou por intermédio de empresas terceirizadas que vier a escolher, contratar, autorizar ou conveniar-se para essa finalidade, os serviços funerários descritos no subitens, do item 1.1, da Cláusula Primeira, desse contrato, na localidade da celebração da contratação, ou outra que ela tenha sede ou filial, declarada na Proposta Contratual, desde que adimplente com suas obrigações financeiras e contratuais, expressamente solicite e autorize o CONTRATANTE, ou familiar dependente, os serviços contratados e haja a comprovação do óbito do beneficiário.');
  fluxo.addText('3.1. É terminantemente proibido ao CONTRATANTE e seus dependentes, sob qualquer pretexto, solicitar e/ou autorizar outra empresa a realizar os serviços funerários previstos nesse contrato, constituindo a ação ou ato nesse sentido, renúncia tácita ao serviço funerário que teria direito em razão dessa contatação.');

  fluxo.addTitle('CLÁUSULA QUARTA - OBRIGAÇÕES DO CONTRATANTE');
  fluxo.addText('4. O CONTRATANTE e seus dependentes se obrigam:');
  fluxo.addText('4.1. Pagar pontualmente, para a CONTRATADA, as mensalidades devidas em contrapartida pela administração do plano e a garantia da realização futura dos serviços objeto desse contrato; 4.2. Manter em dia as obrigações financeiras e contratuais aqui assumidas; 4.3. Manter atualizado os seus dados cadastrais e de seus dependentes; 4.4. Solicitar formal e expressamente, por meio eletrônico ou físico, à CONTRATADA, em caso de necessidade, os serviços objeto desse contrato, bem como, a orientação procedimental para a obtenção dos serviços; 4.5. Comprovar materialmente a ocorrência do óbito do beneficiário quando solicitar a realização dos serviços; 4.6. Autorizar formalmente a realização dos serviços; 4.7. Fazer a comprovação formal da qualidade (parentesco ou dependência econômica) dos dependentes nominados na proposta contratual; 4.8. Cumprir as carências aqui previstas e/ou estipuladas. 4.9. Pagar o valor devido, previsto nesse contrato, para a obtenção da realização dos serviços objeto desse contrato no período de cumprimento de carência pelo titular ou dependente a ser beneficiário; 4.10. Solicitar formalmente a suspensão temporária dos pagamentos das mensalidades devidas para obter a execução dos serviços desse contrato quando atingir o direito a esse benefício.');

  fluxo.addTitle('CLÁUSULA QUINTA – INÍCIO DA CONTRATAÇÃO E PRAZO DE VIGÊNCIA CONTRATUAL');
  fluxo.addText('5. Esse contrato tem início, para o CONTRATANTE, com a assinatura da Proposta Comercial, para a CONTRATADA, com a aceitação da proposta, que se dá com o envio da primeira cobrança da mensalidade ao CONTRATANTE. 5.1.- A carência conta-se do início da contratação. 5.2 A presente contratação é feita por prazo indeterminado.');

  fluxo.addTitle('CLÁUSULA SEXTA – TROCA E ACRÉSCIMO');
  fluxo.addText('6. A troca de qualquer objeto disposto nos subitens do item 1.1, da Cláusula Primeira, ou acréscimo a eles, depende da disponibilidade por parte da CONTRATADA, e, no primeiro caso, para produto ou serviço equivalente, de melhor qualidade e maior preço, condicionado ainda, ao pagamento integral ou à diferença entre um e outro.');

  fluxo.addTitle('CLÁUSULA SÉTIMA – SOLICITAÇÃO E LOCAL DA PRESTAÇÃO DOS SERVIÇOS');
  fluxo.addText('7. O CONTRATANTE, ou seus dependentes, ficam obrigados, para terem direito ao objeto dessa contratação, quando da ocorrência do evento que exija a realização dos serviços aqui contratados, a ligar nos números telefônicos disponibilizados na Proposta Contratual ou impressos da empresa, para avisar o ocorrido e obter as informações iniciais.');
  fluxo.addText('7.1. Recebidas as orientações iniciais por telefone, um representante da família ou dependente no contrato deverá ir à sede local, ou a mais próxima, da CONTRATADA para assinar a solicitação dos serviços e entregar os documentos legais exigidos pelas autoridades para a adoção dos preparativos fúnebres.');
  fluxo.addText('7.2. O não comparecimento na empresa para a entrega dos documentos legais exigidos e autorizar o início dos serviços, exime a CONTRATADA de cumprir a obrigação assumida nessa contratação.');
  fluxo.addText('7.3. O CONTRATANTE, e seus dependentes nesse contrato, declaram estar cientes, e concordarem, com que os serviços funerários objeto dessa contratação sejam executados e entregues na localidade em que firmarem a Proposta Contratual, onde ficará consignada como “localidade sede”.');
  fluxo.addText('7.4. A localidade sede só poderá ser alterada mediante solicitação formal do CONTRATANTE, e sempre para outra localidade onde a CONTRATADA tenha filial ou sede.');
  fluxo.addText('7.5. O CONTRATANTE, e/ou seus dependentes nesse contrato, querendo que a realização dos serviços objeto desse contrato ocorra em outra localidade que não o da sede, terão que arcar com a diferença do traslado do corpo, do transporte de pessoas, dos custos relativos a impostos, taxas, emolumentos ou outros encargos que incidam ou venham a incidir, acrescer ou ser exigidos na localidade de destino.');

  fluxo.addTitle('CLÁUSULA OITAVA – TRASLADO');
  fluxo.addText('8. O CONTRATANTE tem direito a um único traslado gratuito do corpo dentro da Unidade Federativa, denominada Estado de Goiás iniciando se a contagem sempre da localidade sede, apontada na Proposta Contratual.');
  fluxo.addText('8.1. Caso essa distância a percorrer seja superior aos limites do Estado de Goiás, será cobrado, e, portanto, devido, no ato da solicitação da prestação, o valor dos quilômetros rodados que sobejarem.');

  fluxo.addTitle('CLÁUSULA NONA – CARÊNCIAS, INADIMPLÊNCIA E TAXA DE ATENDIMENTO');
  fluxo.addText('9. Para ter direito á prestação de serviço objeto dessa contratação o CONTRATANTE, e seus dependentes, deverão estar em dia com as mensalidades e cumprir carência de 03 ( três ) meses, contada da data da adesão ou da inclusão de cada qual no plano desse contrato.');
  fluxo.addText('9.1. Caso venha necessitar do atendimento funerário no período de carência , poderão receber o serviço contratado, desde que todas as mensalidades estejam quitadas e seja pago a taxa de atendimento em carência de valor correspondente a 35% (trinta e cinco por cento) do preço dos serviços objeto desse contrato, cotados na tabela de preços praticada no Município sede.');
  fluxo.addText('9.2. O CONTRATANTE, e seus dependente, também cumprirão carência de 1(um) mês toda vez que ficar inadimplente com o pagamento de 3 (três) ou mais mensalidades consecutivas desse contrato.');
  fluxo.addText('9.3. O CONTRATANTE tem o direito, em substituição do pagamento integral do valor previsto para o atendimento no período de carência, de assinar um termo compromissório, comprometendo-se a não, por qualquer motivo que seja, rescindir e/ou deixar de pagar as mensalidades aqui pactuadas por um prazo de 60 (sessenta) meses.');

  fluxo.addTitle('CLÁUSULA DÉCIMA – OBRIGAÇÃO FINANCEIRA, VALOR, NÚMERO DE PARCELAS E REAJUSTE');
  fluxo.addText('10. Em contraprestação às obrigações assumidas em garantia pela CONTRATADA, o CONTRATANTE obriga-se a pagar para a CONTRATADA:');
  fluxo.addText('10.1. Mensalmente, por prazo indeterminado, mensalidades, no valor inicial fixado na Proposta Contratual, que será reajustado anualmente pelo Índice Geral de Preços de Mercado (IGPM), todo dia 2 (dois) de janeiro do ano seguinte a oficialização do contrato.');

  fluxo.addTitle('CLÁUSULA DÉCIMA SEXTA – RESCISÃO');
  fluxo.addText('16 Esse contrato poderá ser rescindido por vontade unilateral do CONTRATANTE mediante manifestação formal desse intento à CONTRATADA.');

  fluxo.addTitle('CLÁUSULA DÉCIMA SÉTIMA – CANCELAMENTO');
  fluxo.addText('17. Será entendida como manifestação de desistência formal do contrato, impondo seu cancelamento, o atraso de 6 (seis) ou mais mensalidades.');

  fluxo.ensureSpace(alturaRodapeAssinaturasContrato(data.assinaturaDigital));
  y = await drawRodapeAssinaturasContrato(doc, {
    W,
    margin,
    yStart: fluxo.y + 4,
    titularNome: data.titularNome,
    nomeEmpresa: jur.nomeEmpresaRodape,
    assinaturaDigital: data.assinaturaDigital,
  });

  // --- FOOTER (CERTIFICADO MJ) ---
  fluxo.y = y + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CERTIFICADO DE AUTORIZAÇÃO/MJ N° 07/001/98', margin, fluxo.y);
  fluxo.y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const footText = 'De acordo com o disposto na Lei n° 5.768, de 20 de dezembro de 1.971, alterada pelas Leis n° 5.684, de 12 de dezembro 1.972 e 9.649, de 27 de maio de 1.998, regulamentada pelo decreto n° 70.951, de 09 de agosto de 1.972 modificado pelo Decreto n° 72.411, de 27 de junho de 1.973... A Pessoa Jurídica acima identificada, fica proibida de comercializar seus planos de prestação de serviços póstumos, fora dos limites geográficos do município onde se encontra sediada...';
  fluxo.addText(footText, 7);

  // --- ANEXO I - RELAÇÃO DE DEPENDENTES ---
  if (listaDependentes.length > 0) {
    await drawContratoAnexoDependentes(doc, {
      margin,
      W,
      H,
      numeroContrato: data.numeroContrato,
      titularNome: data.titularNome,
      titularCpf: data.titularCpf,
      dataContrato: data.dataContrato,
      planoNome: data.nomePlano,
      dependentes: listaDependentes,
      subtituloPlano: 'Certificado de Adesão Termos e Condições Onix',
      razaoSocial: jur.razaoSocial,
      cnpjFormatado: jur.cnpjFormatado,
    });
  }

  aplicarNumeracaoPaginasContratoPdf(doc, { numeroContrato: data.numeroContrato });

  return doc.output('blob');
};
