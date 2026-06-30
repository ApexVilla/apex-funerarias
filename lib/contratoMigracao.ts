import {
  calcularPrimeiroVencimento30DiasApos,
  calcularPrimeiroVencimentoDesde,
  contarMensalidadesAte,
  dataHojeIsoLocal,
  normalizarDataIso,
} from './contratoDatas';

export type ContratoMigracaoInput = {
  contratoMigracao: boolean;
  /** Cobrança na Fênix só a partir de hoje; mantém data de contrato histórica. */
  migracaoCobrarApenasFenix: boolean;
  dataInicioContrato: string;
  dataUltimaMensalidadePaga?: string;
  dataRegistroUltimoPagamento?: string;
  diaVencimento: number;
  /** 1º vencimento informado na proposta (quando aplicável). */
  primeiroVencimentoInformado?: string;
};

export function resolverDatasContratoMigracao(input: ContratoMigracaoInput): {
  dataContratacao: string;
  dataPrimeiroVencimento: string;
} {
  const hoje = dataHojeIsoLocal();
  const dataInicio = normalizarDataIso(input.dataInicioContrato) || hoje;
  const dia = Math.max(1, Math.min(31, Math.floor(input.diaVencimento) || 5));

  if (!input.contratoMigracao) {
    // Contrato novo: 1º vencimento sempre a partir da data do contrato (cliente_desde),
    // nunca da data da proposta — evita atraso quando o cadastro já existia antes da venda.
    return {
      dataContratacao: dataInicio,
      dataPrimeiroVencimento: calcularPrimeiroVencimento30DiasApos(dataInicio),
    };
  }

  if (input.migracaoCobrarApenasFenix) {
    const pv =
      normalizarDataIso(input.primeiroVencimentoInformado) ||
      calcularPrimeiroVencimento30DiasApos(hoje);
    return { dataContratacao: dataInicio, dataPrimeiroVencimento: pv };
  }

  const pv = calcularPrimeiroVencimentoDesde(dataInicio, dia);
  return { dataContratacao: dataInicio, dataPrimeiroVencimento: pv };
}

export function contarMensalidadesPagasMigracao(input: ContratoMigracaoInput): number {
  if (!input.contratoMigracao || input.migracaoCobrarApenasFenix) return 0;
  const ultima = normalizarDataIso(input.dataUltimaMensalidadePaga);
  if (!ultima) return 0;
  const { dataPrimeiroVencimento } = resolverDatasContratoMigracao(input);
  return contarMensalidadesAte(dataPrimeiroVencimento, ultima, input.diaVencimento);
}

export type GerarParcelasMigracaoHandlers = {
  gerarLote: (assinaturaId: string, meses: number) => Promise<number>;
  gerarHistorico: (
    assinaturaId: string,
    ateVencimento: string,
    dataPagamento?: string,
    mesesFuturos?: number,
  ) => Promise<{ pagas?: number; futuras?: number; total?: number; error?: string } | null>;
};

export async function gerarParcelasContratoMigracao(
  assinaturaId: string,
  input: ContratoMigracaoInput,
  handlers: GerarParcelasMigracaoHandlers,
): Promise<{ modo: 'padrao' | 'fenix' | 'historico'; detalhe?: string }> {
  if (!input.contratoMigracao) {
    await handlers.gerarLote(assinaturaId, 12);
    return { modo: 'padrao' };
  }

  if (input.migracaoCobrarApenasFenix) {
    await handlers.gerarLote(assinaturaId, 12);
    return { modo: 'fenix' };
  }

  const ultima = normalizarDataIso(input.dataUltimaMensalidadePaga);
  if (!ultima) {
    await handlers.gerarLote(assinaturaId, 12);
    return { modo: 'padrao', detalhe: 'Migração sem última mensalidade — parcelas padrão.' };
  }

  const res = await handlers.gerarHistorico(
    assinaturaId,
    ultima,
    normalizarDataIso(input.dataRegistroUltimoPagamento) || dataHojeIsoLocal(),
    12,
  );
  if (res?.error) {
    return { modo: 'historico', detalhe: res.error };
  }
  return {
    modo: 'historico',
    detalhe: `${res?.pagas ?? 0} quitada(s), ${res?.futuras ?? 0} em aberto`,
  };
}
